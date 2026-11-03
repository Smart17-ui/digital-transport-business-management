-- Undoing a confirmed payment, for a mistaken confirmation. Decisions are
-- append-only, so the undo is a new row and the history keeps both. A reversed
-- payment counts for nothing, because arrears only sum status = 'confirmed'.
create table payment_reversals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id),
  payment_id uuid not null unique references settlement_payments (id),
  reason text not null check (length(trim(reason)) > 0),
  reversed_by uuid not null references profiles (id),
  reversed_at timestamptz not null default now()
);

create trigger payment_reversals_append_only before update or delete on payment_reversals
  for each row execute function reject_change();
create trigger payment_reversals_no_truncate before truncate on payment_reversals
  for each statement execute function reject_change();

revoke all on payment_reversals from anon, authenticated;
grant select on payment_reversals to authenticated;
grant select, insert on payment_reversals to command_api;
alter table payment_reversals enable row level security;

create policy owner_or_driver on payment_reversals for select to authenticated
  using (is_owner(business_id, auth.uid()) or exists (
    select 1 from settlement_payments p join trip_days d on d.id = p.trip_day_id
    where p.id = payment_id and d.driver_id = auth.uid()));
create policy command_api on payment_reversals for all to command_api
  using (is_member(business_id, app_user_id()))
  with check (is_member(business_id, app_user_id()));

create or replace view settlement_payments_v with (security_invoker = true) as
select p.*,
       case when r.id is not null then 'reversed' else coalesce(d.decision, 'claimed') end as status,
       d.confirmed_amount_ngwee, d.reason as decision_reason, d.decided_by, d.decided_at,
       r.reason as reversal_reason, r.reversed_by, r.reversed_at
from settlement_payments p
left join payment_decisions d on d.payment_id = p.id
left join payment_reversals r on r.payment_id = p.id;
