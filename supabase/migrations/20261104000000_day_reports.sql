-- A driver reports why a day went badly: a breakdown, sickness and so on. If the
-- Owner accepts it, nothing more is owed for that day, and whatever was handed over
-- stands. Reports are matched to a day by driver and date, because a driver who is
-- sick may never start a day at all. Both tables are append-only, like other money records.
create table day_reports (
  id uuid primary key,
  business_id uuid not null references businesses (id),
  vehicle_id uuid not null references vehicles (id),
  driver_id uuid not null references profiles (id),
  service_date date not null,
  kind text not null check (kind in ('breakdown', 'off_road', 'sick', 'other')),
  reason text not null check (length(trim(reason)) > 0),
  device_time timestamptz,
  created_at timestamptz not null default now()
);
create index day_reports_driver_date on day_reports (driver_id, service_date);
create index day_reports_business on day_reports (business_id, service_date);

create table day_report_decisions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  report_id uuid not null unique references day_reports (id),
  decision text not null check (decision in ('accepted', 'rejected')),
  reason text,
  decided_by uuid not null references profiles (id),
  decided_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['day_reports', 'day_report_decisions'] loop
    execute format('create trigger %I_append_only before update or delete on %I
                    for each row execute function reject_change()', t, t);
    execute format('create trigger %I_no_truncate before truncate on %I
                    for each statement execute function reject_change()', t, t);
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('grant select on %I to authenticated', t);
    execute format('grant select, insert on %I to command_api', t);
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy command_api on %I for all to command_api
         using (is_member(business_id, app_user_id()))
         with check (is_member(business_id, app_user_id()))', t);
  end loop;
end $$;

create policy owner_or_driver on day_reports for select to authenticated
  using (is_owner(business_id, auth.uid()) or driver_id = auth.uid());
create policy owner_or_driver on day_report_decisions for select to authenticated
  using (is_owner(business_id, auth.uid()) or exists (
    select 1 from day_reports r where r.id = report_id and r.driver_id = auth.uid()));

create view day_reports_v with (security_invoker = true) as
select r.*,
       coalesce(d.decision, 'pending') as status,
       d.reason as decision_reason, d.decided_by, d.decided_at
from day_reports r
left join day_report_decisions d on d.report_id = r.id;

revoke all on day_reports_v from anon, authenticated;
grant select on day_reports_v to authenticated, command_api;
