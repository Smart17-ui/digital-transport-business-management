-- An Owner can reopen a day ended by mistake. The reason and what the day said
-- are kept for good, and settlements stay append-only: reopening adds a new version.
create table day_reopenings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  trip_day_id uuid not null references trip_days (id),
  driver_id uuid not null references profiles (id),
  reason text not null check (length(trim(reason)) > 0),
  previous_odometer_end integer not null,
  previous_ended_at timestamptz not null,
  previous_device_ended_at timestamptz,
  reopened_by uuid not null references profiles (id),
  reopened_at timestamptz not null default now(),
  -- One record for each time the day was closed.
  unique (trip_day_id, previous_ended_at)
);

create trigger day_reopenings_append_only before update or delete on day_reopenings
  for each row execute function reject_change();
create trigger day_reopenings_no_truncate before truncate on day_reopenings
  for each statement execute function reject_change();

revoke all on day_reopenings from anon, authenticated;
grant select on day_reopenings to authenticated;
grant select, insert on day_reopenings to command_api;
alter table day_reopenings enable row level security;

create policy owner_or_driver on day_reopenings for select to authenticated
  using (is_owner(business_id, auth.uid()) or driver_id = auth.uid());
create policy command_api on day_reopenings for all to command_api
  using (is_member(business_id, app_user_id()))
  with check (is_owner(business_id, app_user_id()) and reopened_by = app_user_id());

-- A closed day stays closed unless a reopening has been recorded for this very closure.
create or replace function guard_trip_day_update() returns trigger
language plpgsql as $$
begin
  if (new.id, new.business_id, new.vehicle_id, new.driver_id, new.arrangement_id, new.service_date,
      new.odometer_start, new.started_at, new.device_started_at)
     is distinct from
     (old.id, old.business_id, old.vehicle_id, old.driver_id, old.arrangement_id, old.service_date,
      old.odometer_start, old.started_at, old.device_started_at) then
    raise exception 'only the end of a trip day can be recorded' using errcode = 'P0001';
  end if;
  if old.ended_at is not null and not (
    new.ended_at is null and new.odometer_end is null and new.device_ended_at is null
    and exists (select 1 from day_reopenings r where r.trip_day_id = old.id and r.previous_ended_at = old.ended_at)
  ) then
    raise exception 'trip day % is closed', old.id using errcode = 'P0001';
  end if;
  return new;
end $$;
