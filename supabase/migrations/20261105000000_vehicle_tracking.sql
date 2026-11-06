-- Where each bus is while a day is running. A device reports positions for a
-- vehicle: a driver's phone for now, a GPS tracker later, with no change to what
-- reads them. These are not money records, so they are not append-only: old
-- positions can be deleted once a retention period is agreed.
create table devices (
  id uuid primary key,
  business_id uuid not null references businesses (id),
  vehicle_id uuid references vehicles (id),
  driver_id uuid references profiles (id),
  type text not null check (type in ('phone', 'gps_tracker')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table positions (
  id bigint generated always as identity primary key,
  business_id uuid not null references businesses (id),
  vehicle_id uuid not null references vehicles (id),
  trip_day_id uuid not null references trip_days (id),
  driver_id uuid not null references profiles (id),
  device_id uuid not null references devices (id),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  speed_kmh real,
  heading real,
  accuracy_m real,
  recorded_at timestamptz not null,
  received_at timestamptz not null default now()
);
-- A resent batch adds nothing.
create unique index positions_once on positions (trip_day_id, device_id, recorded_at);
create index positions_vehicle_time on positions (vehicle_id, recorded_at desc);
create index positions_day_time on positions (trip_day_id, recorded_at);

-- One row per vehicle, so the live map stays quick however long positions grows.
create table vehicle_last_positions (
  vehicle_id uuid primary key references vehicles (id),
  business_id uuid not null references businesses (id),
  trip_day_id uuid not null references trip_days (id),
  driver_id uuid not null references profiles (id),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  speed_kmh real,
  heading real,
  accuracy_m real,
  recorded_at timestamptz not null,
  received_at timestamptz not null
);
create index vehicle_last_positions_business on vehicle_last_positions (business_id);

do $$
declare
  t text;
begin
  foreach t in array array['devices', 'positions', 'vehicle_last_positions'] loop
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('grant select on %I to authenticated', t);
    execute format('grant select, insert on %I to command_api', t);
    execute format('alter table %I enable row level security', t);
    -- The Owner sees the whole business; a Driver sees only what they reported.
    execute format(
      'create policy owner_or_driver on %I for select to authenticated
         using (is_owner(business_id, auth.uid()) or driver_id = auth.uid())', t);
    -- A person can only ever report as themselves.
    execute format(
      'create policy command_api on %I for all to command_api
         using (is_member(business_id, app_user_id()))
         with check (is_member(business_id, app_user_id()) and driver_id = app_user_id())', t);
  end loop;
end $$;

grant update on vehicle_last_positions to command_api;
