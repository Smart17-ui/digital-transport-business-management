-- DigitalTransport Version 0 core schema.
--
-- Trust boundary (design 8.1): the app never writes. Phones read through row
-- level security as `authenticated`; every write goes through the Command API
-- Edge Function, which acts as the `command_api` role inside a transaction with
-- `app.user_id` set, so RLS scopes its writes to the acting user's business
-- too. Money tables are append-only, enforced by triggers.

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'command_api') then
    create role command_api nologin;
  end if;
end $$;

grant usage on schema public to command_api;
grant command_api to postgres;

-- The acting user for the current Command API transaction.
create or replace function app_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- Reference data. Stored as rows, not enums, so later stages add rows rather
-- than migrations (Scope, "Built for later").
-- ---------------------------------------------------------------------------
create table roles (code text primary key);
insert into roles values ('owner'), ('driver'), ('conductor'), ('association_admin'), ('mechanic');

create table payment_methods (
  code text primary key,
  stage smallint not null,
  enabled boolean not null default false
);
insert into payment_methods values ('cash', 1, true), ('mobile_money', 2, false);

create table arrangement_types (code text primary key);
insert into arrangement_types values ('fixed_target'), ('revenue_share'), ('salary'), ('rent_to_own');

create table expense_categories (
  code text primary key,
  kind text not null check (kind in ('fuel', 'roadside', 'owner_paid')),
  sort_order smallint not null,
  -- Above this amount a receipt photo is required; null until decided (Open points).
  receipt_threshold_ngwee bigint
);
insert into expense_categories (code, kind, sort_order) values
  ('fuel', 'fuel', 10),
  ('puncture_tyre', 'roadside', 20),
  ('levy_toll', 'roadside', 30),
  ('parking', 'roadside', 40),
  ('car_wash', 'roadside', 50),
  ('small_repair', 'roadside', 60),
  ('fine', 'roadside', 70),
  ('other', 'roadside', 80),
  ('servicing', 'owner_paid', 100),
  ('road_tax', 'owner_paid', 110),
  ('insurance', 'owner_paid', 120);

-- ---------------------------------------------------------------------------
-- People and businesses
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  display_name text,
  language text not null default 'en',
  created_at timestamptz not null default now()
);

-- A profile row for every new auth user (UC1 step 4).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, phone) values (new.id, new.phone) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create table consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  scope text not null,
  notice_version text not null,
  granted_at timestamptz not null default now()
);

create table businesses (
  id uuid primary key,
  name text not null check (length(name) between 1 and 100),
  owner_id uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

-- Membership carries the role, so a driver can belong to several businesses
-- over time and new roles need no model change.
create table memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  user_id uuid not null references profiles (id),
  role text not null references roles (code),
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references profiles (id)
);
create unique index memberships_one_active on memberships (business_id, user_id) where ended_at is null;
create index memberships_user on memberships (user_id) where ended_at is null;

create table invite_codes (
  code text primary key,
  business_id uuid not null references businesses (id),
  role text not null references roles (code),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by uuid references profiles (id),
  used_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Vehicles and arrangements
-- ---------------------------------------------------------------------------
create table vehicles (
  id uuid primary key,
  business_id uuid not null references businesses (id),
  plate text not null,
  vehicle_type text not null,
  diagnostics text not null default 'none' check (diagnostics in ('none', 'obd_dongle', 'telematics')),
  created_at timestamptz not null default now()
);
create unique index vehicles_plate on vehicles (business_id, upper(plate));

create table vehicle_status_changes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  vehicle_id uuid not null references vehicles (id),
  status text not null check (status in ('active', 'off_road', 'retired')),
  reason text,
  expected_return date,
  changed_by uuid not null references profiles (id),
  changed_at timestamptz not null default now()
);
create index vehicle_status_changes_vehicle on vehicle_status_changes (vehicle_id, changed_at);

-- A Conductor has no account in Stage 1; the Driver records on their behalf.
create table conductors (
  id uuid primary key,
  business_id uuid not null references businesses (id),
  vehicle_id uuid not null references vehicles (id),
  name text not null,
  created_at timestamptz not null default now()
);

-- Versioned: a new arrangement ends the old one, and every trip day records the
-- arrangement it ran under, so changed terms never rewrite history.
create table arrangements (
  id uuid primary key,
  business_id uuid not null references businesses (id),
  vehicle_id uuid not null references vehicles (id),
  driver_id uuid not null references profiles (id),
  type text not null references arrangement_types (code),
  terms jsonb not null,
  fuel_bearer text not null check (fuel_bearer in ('owner', 'driver')),
  other_costs_bearer text not null check (other_costs_bearer in ('owner', 'driver')),
  fuel_float_ngwee bigint check (fuel_float_ngwee > 0),
  effective_from date not null,
  proposed_by uuid not null references profiles (id),
  proposed_at timestamptz not null default now(),
  status text not null default 'proposed' check (status in ('proposed', 'active', 'declined', 'ended')),
  decided_at timestamptz,
  decline_reason text,
  ended_on date
);
create unique index arrangements_one_active on arrangements (vehicle_id, driver_id) where status = 'active';

-- Only status moves forward; the terms themselves never change.
create or replace function guard_arrangement_update() returns trigger
language plpgsql as $$
begin
  if (new.id, new.business_id, new.vehicle_id, new.driver_id, new.type, new.terms, new.fuel_bearer,
      new.other_costs_bearer, new.fuel_float_ngwee, new.effective_from, new.proposed_by, new.proposed_at)
     is distinct from
     (old.id, old.business_id, old.vehicle_id, old.driver_id, old.type, old.terms, old.fuel_bearer,
      old.other_costs_bearer, old.fuel_float_ngwee, old.effective_from, old.proposed_by, old.proposed_at) then
    raise exception 'arrangement terms are immutable; propose a new arrangement' using errcode = 'P0001';
  end if;
  if not ((old.status = 'proposed' and new.status in ('active', 'declined'))
          or (old.status = 'active' and new.status = 'ended')
          or old.status = new.status) then
    raise exception 'invalid arrangement transition % -> %', old.status, new.status using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger arrangements_guard before update on arrangements
  for each row execute function guard_arrangement_update();

-- ---------------------------------------------------------------------------
-- Trip days
-- ---------------------------------------------------------------------------
create table trip_days (
  id uuid primary key,
  business_id uuid not null references businesses (id),
  vehicle_id uuid not null references vehicles (id),
  driver_id uuid not null references profiles (id),
  arrangement_id uuid not null references arrangements (id),
  service_date date not null,
  odometer_start integer not null check (odometer_start >= 0),
  odometer_end integer check (odometer_end >= odometer_start),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  device_started_at timestamptz,
  device_ended_at timestamptz,
  check ((odometer_end is null) = (ended_at is null))
);
create unique index trip_days_one_open_per_vehicle on trip_days (vehicle_id) where ended_at is null;
create index trip_days_driver on trip_days (business_id, driver_id, service_date);

-- A day can be closed once, and nothing else about it changes.
create or replace function guard_trip_day_update() returns trigger
language plpgsql as $$
begin
  if old.ended_at is not null then
    raise exception 'trip day % is closed', old.id using errcode = 'P0001';
  end if;
  if (new.id, new.business_id, new.vehicle_id, new.driver_id, new.arrangement_id, new.service_date,
      new.odometer_start, new.started_at, new.device_started_at)
     is distinct from
     (old.id, old.business_id, old.vehicle_id, old.driver_id, old.arrangement_id, old.service_date,
      old.odometer_start, old.started_at, old.device_started_at) then
    raise exception 'only the end of a trip day can be recorded' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trip_days_guard before update on trip_days
  for each row execute function guard_trip_day_update();

-- ---------------------------------------------------------------------------
-- Money ledger (append-only)
-- ---------------------------------------------------------------------------
create table income_entries (
  id uuid primary key,
  business_id uuid not null references businesses (id),
  trip_day_id uuid not null references trip_days (id),
  kind text not null check (kind in ('takings', 'remittance')),
  amount_ngwee bigint not null,
  method text not null references payment_methods (code),
  giver_kind text not null check (giver_kind in ('conductor', 'driver', 'owner')),
  giver_user_id uuid references profiles (id),
  receiver_kind text not null check (receiver_kind in ('driver', 'owner')),
  receiver_user_id uuid references profiles (id),
  recorded_by uuid not null references profiles (id),
  source text not null check (source in ('app', 'correction')),
  late boolean not null default false,
  reverses_id uuid references income_entries (id),
  replaces_id uuid references income_entries (id),
  device_time timestamptz,
  server_time timestamptz not null default now(),
  -- Only a reversing entry may be negative.
  check ((reverses_id is null and amount_ngwee > 0) or (reverses_id is not null and amount_ngwee < 0))
);
create unique index income_entries_one_reversal on income_entries (reverses_id) where reverses_id is not null;
create index income_entries_day on income_entries (trip_day_id);

-- Confirmation is a new row, never an update of the entry (UC8 step 7).
create table entry_confirmations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  entry_id uuid not null unique references income_entries (id),
  decision text not null check (decision in ('confirmed', 'disputed')),
  reason text,
  decided_by uuid not null references profiles (id),
  decided_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key,
  business_id uuid not null references businesses (id),
  trip_day_id uuid references trip_days (id),
  vehicle_id uuid not null references vehicles (id),
  category text not null references expense_categories (code),
  amount_ngwee bigint not null,
  litres numeric(8, 2) check (litres > 0),
  paid_by text not null check (paid_by in ('driver_cash', 'advance', 'owner')),
  borne_by text not null check (borne_by in ('owner', 'driver')),
  note text not null default '',
  receipt_path text,
  recorded_by uuid not null references profiles (id),
  late boolean not null default false,
  reverses_id uuid references expenses (id),
  replaces_id uuid references expenses (id),
  device_time timestamptz,
  server_time timestamptz not null default now(),
  check ((reverses_id is null and amount_ngwee > 0) or (reverses_id is not null and amount_ngwee < 0)),
  -- Only an owner-paid cost can sit outside a trip day (UC12 3a).
  check (trip_day_id is not null or paid_by = 'owner')
);
create unique index expenses_one_reversal on expenses (reverses_id) where reverses_id is not null;
create index expenses_day on expenses (trip_day_id);

-- ExpenseState as rows: no row means pending.
create table expense_decisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  expense_id uuid not null unique references expenses (id),
  decision text not null check (decision in ('approved', 'declined')),
  approved_amount_ngwee bigint,
  reason text,
  -- Null when an ApprovalPolicy decided automatically.
  decided_by uuid references profiles (id),
  decided_at timestamptz not null default now(),
  check ((decision = 'approved') = (approved_amount_ngwee is not null))
);

create table audit_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid not null references profiles (id),
  reason text,
  details jsonb not null default '{}',
  at timestamptz not null default now()
);
create index audit_entries_entity on audit_entries (entity_type, entity_id);

-- Statement snapshots. A recalculation appends a new version; arrears read the
-- latest version of each day.
create table settlements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  trip_day_id uuid not null references trip_days (id),
  arrangement_id uuid not null references arrangements (id),
  version integer not null,
  owed_for_day_ngwee bigint not null,
  net_balance_ngwee bigint not null,
  provisional boolean not null,
  statement jsonb not null,
  computed_at timestamptz not null default now(),
  unique (trip_day_id, version)
);

create table settlement_payments (
  id uuid primary key,
  business_id uuid not null references businesses (id),
  trip_day_id uuid not null references trip_days (id),
  payer text not null check (payer in ('driver', 'owner')),
  amount_ngwee bigint not null check (amount_ngwee > 0),
  method text not null references payment_methods (code),
  claimed_by uuid not null references profiles (id),
  claimed_at timestamptz not null default now(),
  device_time timestamptz
);
create index settlement_payments_day on settlement_payments (trip_day_id);

create table payment_decisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  payment_id uuid not null unique references settlement_payments (id),
  decision text not null check (decision in ('confirmed', 'rejected')),
  confirmed_amount_ngwee bigint check (confirmed_amount_ngwee > 0),
  reason text,
  decided_by uuid not null references profiles (id),
  decided_at timestamptz not null default now(),
  check ((decision = 'confirmed') = (confirmed_amount_ngwee is not null))
);

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------
create or replace function reject_change() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'P0001';
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'consents', 'vehicle_status_changes', 'income_entries', 'entry_confirmations', 'expenses',
    'expense_decisions', 'audit_entries', 'settlements', 'settlement_payments', 'payment_decisions'
  ] loop
    execute format('create trigger %I_append_only before update or delete on %I
                    for each row execute function reject_change()', t, t);
    execute format('create trigger %I_no_truncate before truncate on %I
                    for each statement execute function reject_change()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Commands, outbox and notifications
-- ---------------------------------------------------------------------------
-- Idempotency: a replayed clientId returns the stored result (UC9 5a).
create table command_log (
  client_id uuid primary key,
  user_id uuid not null references profiles (id),
  business_id uuid references businesses (id),
  type text not null,
  result jsonb not null,
  device_time timestamptz,
  received_at timestamptz not null default now()
);

-- Events are written in the same transaction as the change (design 8.3).
create table outbox (
  id bigint generated always as identity primary key,
  business_id uuid not null references businesses (id),
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text
);
create index outbox_unprocessed on outbox (id) where processed_at is null;

-- Claims a batch for the relay; SKIP LOCKED lets several relays run safely.
create or replace function claim_outbox(batch_size integer default 50)
returns setof outbox
language sql as $$
  update outbox set attempts = attempts + 1
  where id in (
    select id from outbox
    where processed_at is null and attempts < 10
    order by id
    limit batch_size
    for update skip locked
  )
  returning *
$$;

-- The in-app inbox, and the fallback when push fails (UC29 5a).
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  business_id uuid not null references businesses (id),
  outbox_id bigint references outbox (id),
  event_type text not null,
  category text not null,
  link text not null,
  critical boolean not null default false,
  delivered_via text check (delivered_via in ('push', 'inbox', 'sms')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (outbox_id, user_id)
);
create index notifications_user on notifications (user_id, created_at desc);

create table device_tokens (
  token text primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Read views. security_invoker makes RLS of the underlying tables apply.
-- ---------------------------------------------------------------------------
create view income_entries_v with (security_invoker = true) as
select e.*,
       coalesce(c.decision, 'pending') as status,
       c.decided_by, c.decided_at, c.reason as decision_reason
from income_entries e
left join entry_confirmations c on c.entry_id = e.id;

create view expenses_v with (security_invoker = true) as
select x.*, c.kind,
       coalesce(d.decision, 'pending') as status,
       d.approved_amount_ngwee, d.reason as decision_reason, d.decided_by, d.decided_at
from expenses x
join expense_categories c on c.code = x.category
left join expense_decisions d on d.expense_id = x.id;

create view settlement_payments_v with (security_invoker = true) as
select p.*,
       coalesce(d.decision, 'claimed') as status,
       d.confirmed_amount_ngwee, d.reason as decision_reason, d.decided_by, d.decided_at
from settlement_payments p
left join payment_decisions d on d.payment_id = p.id;

-- Latest statement per day with confirmed payments: the basis of arrears.
create view day_balances with (security_invoker = true) as
select t.id as trip_day_id, t.business_id, t.driver_id, t.service_date, t.started_at,
       coalesce(s.owed_for_day_ngwee, 0) as owed_for_day_ngwee,
       coalesce((
         select sum(case when p.payer = 'driver' then p.confirmed_amount_ngwee else -p.confirmed_amount_ngwee end)
         from settlement_payments_v p
         where p.trip_day_id = t.id and p.status = 'confirmed'
       ), 0)::bigint as paid_ngwee
from trip_days t
left join lateral (
  select owed_for_day_ngwee from settlements s
  where s.trip_day_id = t.id order by version desc limit 1
) s on true;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- security definer so policies can consult memberships without recursing.
create or replace function is_member(b uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m
                 where m.business_id = b and m.user_id = u and m.ended_at is null)
$$;

create or replace function is_owner(b uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m
                 where m.business_id = b and m.user_id = u and m.role = 'owner' and m.ended_at is null)
$$;

create or replace function shares_business(other uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships a join memberships b using (business_id)
                 where a.user_id = u and b.user_id = other and a.ended_at is null and b.ended_at is null)
$$;

-- Phones never write: strip the default Supabase grants, then grant reads.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant select on all tables in schema public to authenticated;
grant execute on function is_member(uuid, uuid), is_owner(uuid, uuid), shares_business(uuid, uuid),
  app_user_id() to authenticated, command_api;
grant update (read_at) on notifications to authenticated;
revoke select on command_log, outbox, invite_codes from authenticated;

-- The Command API can read and insert. Updates are limited to the columns a
-- command legitimately moves forward; triggers guard the rest.
grant select, insert on all tables in schema public to command_api;
grant update (status, decided_at, decline_reason, ended_on) on arrangements to command_api;
grant update (odometer_end, ended_at, device_ended_at) on trip_days to command_api;
grant update (ended_at, ended_by) on memberships to command_api;
grant update (used_by, used_at) on invite_codes to command_api;
grant update (display_name, language) on profiles to command_api;
grant update (user_id, platform, updated_at) on device_tokens to command_api;

do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Reference data: readable by everyone signed in.
create policy read_ref on roles for select to authenticated, command_api using (true);
create policy read_ref on payment_methods for select to authenticated, command_api using (true);
create policy read_ref on arrangement_types for select to authenticated, command_api using (true);
create policy read_ref on expense_categories for select to authenticated, command_api using (true);

-- Own rows.
create policy own on profiles for select to authenticated
  using (id = auth.uid() or shares_business(id, auth.uid()));
create policy own on consents for select to authenticated using (user_id = auth.uid());
create policy own on notifications for select to authenticated using (user_id = auth.uid());
create policy own_read on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on device_tokens for select to authenticated using (user_id = auth.uid());

-- Business-wide reads for members.
create policy members on businesses for select to authenticated using (is_member(id, auth.uid()));
create policy members on memberships for select to authenticated
  using (user_id = auth.uid() or is_member(business_id, auth.uid()));
create policy members on vehicles for select to authenticated using (is_member(business_id, auth.uid()));
create policy members on vehicle_status_changes for select to authenticated using (is_member(business_id, auth.uid()));
create policy members on conductors for select to authenticated using (is_member(business_id, auth.uid()));

-- Money: the Owner sees the business; a Driver sees only their own days, and
-- keeps that earnings record after leaving (UC45 step 5).
create policy owner_or_driver on arrangements for select to authenticated
  using (is_owner(business_id, auth.uid()) or driver_id = auth.uid());
create policy owner_or_driver on trip_days for select to authenticated
  using (is_owner(business_id, auth.uid()) or driver_id = auth.uid());

do $$
declare
  t text;
begin
  foreach t in array array['income_entries', 'expenses', 'settlements', 'settlement_payments'] loop
    execute format(
      'create policy owner_or_driver on %I for select to authenticated using (
         is_owner(business_id, auth.uid())
         or exists (select 1 from trip_days d where d.id = trip_day_id and d.driver_id = auth.uid()))', t);
  end loop;
end $$;

create policy owner_or_driver on entry_confirmations for select to authenticated
  using (is_owner(business_id, auth.uid()) or exists (
    select 1 from income_entries e join trip_days d on d.id = e.trip_day_id
    where e.id = entry_id and d.driver_id = auth.uid()));
create policy owner_or_driver on expense_decisions for select to authenticated
  using (is_owner(business_id, auth.uid()) or exists (
    select 1 from expenses x join trip_days d on d.id = x.trip_day_id
    where x.id = expense_id and d.driver_id = auth.uid()));
create policy owner_or_driver on payment_decisions for select to authenticated
  using (is_owner(business_id, auth.uid()) or exists (
    select 1 from settlement_payments p join trip_days d on d.id = p.trip_day_id
    where p.id = payment_id and d.driver_id = auth.uid()));
create policy owner_only on audit_entries for select to authenticated using (is_owner(business_id, auth.uid()));

-- Command API: every business-scoped row it reads or writes must belong to a
-- business the acting user is an active member of.
do $$
declare
  t text;
begin
  foreach t in array array[
    'vehicles', 'vehicle_status_changes', 'conductors', 'arrangements', 'trip_days', 'income_entries',
    'entry_confirmations', 'expenses', 'expense_decisions', 'audit_entries', 'settlements',
    'settlement_payments', 'payment_decisions', 'outbox'
  ] loop
    execute format(
      'create policy command_api on %I for all to command_api
         using (is_member(business_id, app_user_id()))
         with check (is_member(business_id, app_user_id()))', t);
  end loop;
end $$;

create policy command_api on businesses for all to command_api
  using (is_member(id, app_user_id()) or owner_id = app_user_id())
  with check (owner_id = app_user_id());
-- Managed by the Owner; a user adds only themselves, as the founder of a
-- business they own or with the role of an invite code they redeemed.
create policy command_api on memberships for all to command_api
  using (user_id = app_user_id() or is_owner(business_id, app_user_id()))
  with check (
    is_owner(business_id, app_user_id())
    or (user_id = app_user_id() and (
      (memberships.role = 'owner' and exists (
        select 1 from businesses b where b.id = memberships.business_id and b.owner_id = app_user_id()))
      or exists (
        select 1 from invite_codes i
        where i.business_id = memberships.business_id and i.role = memberships.role
          and i.used_by = app_user_id()))));
-- Any signed-in user may look up a code to join; only the Owner creates them.
create policy command_api_read on invite_codes for select to command_api using (true);
create policy command_api_use on invite_codes for update to command_api
  using (used_by is null) with check (used_by = app_user_id());
create policy command_api_create on invite_codes for insert to command_api
  with check (is_owner(business_id, app_user_id()));
create policy command_api on profiles for all to command_api
  using (id = app_user_id() or shares_business(id, app_user_id()))
  with check (id = app_user_id());
create policy command_api on consents for all to command_api
  using (user_id = app_user_id()) with check (user_id = app_user_id());
create policy command_api on device_tokens for all to command_api
  using (true) with check (user_id = app_user_id());
create policy command_api on command_log for all to command_api
  using (user_id = app_user_id()) with check (user_id = app_user_id());
