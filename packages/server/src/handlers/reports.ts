import { invariant, type CommandPayload } from '@dt/domain';
import { emit, requireBusiness, requireOwner, type CommandContext } from '../context.ts';
import { isoDate, maybeOne, one, str } from '../db.ts';
import { refreshSettlement } from '../settlement-service.ts';

/** A driver says why a day went badly. It changes nothing until the Owner accepts it. */
export async function reportDay(ctx: CommandContext, p: CommandPayload<'report_day'>) {
  const { businessId, ownerId } = requireBusiness(ctx);
  invariant(ctx.role === 'driver', 'report.only_driver_reports');
  // A phone's date may be a little ahead of the server's, but a problem cannot be reported in advance.
  const latest = new Date(Date.parse(ctx.now) + 86_400_000).toISOString().slice(0, 10);
  invariant(p.serviceDate <= latest, 'report.date_in_future');
  await one(
    ctx.db,
    `select 1 from arrangements where vehicle_id = $1 and driver_id = $2 and status = 'active'`,
    [p.vehicleId, ctx.userId],
    'report.not_your_bus',
  );
  const open = await maybeOne(
    ctx.db,
    `select 1 from day_reports_v where driver_id = $1 and service_date = $2 and status <> 'rejected'`,
    [ctx.userId, p.serviceDate],
  );
  invariant(open === null, 'report.already_reported');

  await ctx.db.query(
    `insert into day_reports (id, business_id, vehicle_id, driver_id, service_date, kind, reason, device_time, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [p.reportId, businessId, p.vehicleId, ctx.userId, p.serviceDate, p.kind, p.reason.trim(), ctx.deviceTime, ctx.now],
  );
  await refreshDaysOn(ctx, ctx.userId, p.serviceDate);
  emit(ctx, { type: 'DayReported', businessId, subjectUserId: ownerId, entityId: p.reportId, link: '/calendar' });
  return { reportId: p.reportId, status: 'pending' };
}

/** The Owner's answer. Accepting leaves nothing more owed for the day, whatever was handed over. */
export async function decideReport(ctx: CommandContext, p: CommandPayload<'decide_report'>) {
  const { businessId } = requireOwner(ctx);
  const report = await one(ctx.db, 'select * from day_reports_v where id = $1', [p.reportId], 'report.not_found');
  invariant(report.status === 'pending', 'report.already_decided');
  const reason = p.reason?.trim() ?? '';
  invariant(p.accept || reason.length > 0, 'report.reason_required');

  await ctx.db.query(
    `insert into day_report_decisions (business_id, report_id, decision, reason, decided_by, decided_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [businessId, p.reportId, p.accept ? 'accepted' : 'rejected', p.accept ? null : reason, ctx.userId, ctx.now],
  );
  const driverId = str(report.driver_id);
  await refreshDaysOn(ctx, driverId, isoDate(report.service_date));
  emit(ctx, {
    type: p.accept ? 'DayReportAccepted' : 'DayReportRejected',
    businessId,
    subjectUserId: driverId,
    entityId: p.reportId,
    link: '/calendar',
  });
  return { reportId: p.reportId, status: p.accept ? 'accepted' : 'rejected' };
}

/** Keeps stored settlements in step, because earlier days feed the arrears of later ones. */
async function refreshDaysOn(ctx: CommandContext, driverId: string, serviceDate: string): Promise<void> {
  const { rows } = await ctx.db.query('select id from trip_days where driver_id = $1 and service_date = $2', [driverId, serviceDate]);
  for (const row of rows) await refreshSettlement(ctx.db, str(row.id));
}
