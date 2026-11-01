import {
  invariant,
  paymentPosition,
  validatePaymentClaim,
  validatePaymentConfirmation,
  type CommandPayload,
} from '@dt/domain';
import { emit, requireBusiness, requireDayParty, type CommandContext } from '../context.ts';
import { one } from '../db.ts';
import { enabledPaymentMethods, loadTripDay, paymentsForDay, toPayment } from '../repositories.ts';
import { computeStatement } from '../settlement-service.ts';

/** UC17 steps 2-3: the paying side says "I paid". Nothing moves in the app. */
export async function claimPayment(ctx: CommandContext, p: CommandPayload<'claim_payment'>) {
  const day = await loadTripDay(ctx.db, p.tripDayId);
  const { businessId, ownerId } = requireDayParty(ctx, day);
  invariant(day.status === 'closed', 'payment.day_not_closed');
  invariant((await enabledPaymentMethods(ctx.db)).includes(p.method), 'payment.method_not_available');

  const statement = await computeStatement(ctx.db, day);
  const payments = await paymentsForDay(ctx.db, p.tripDayId);
  invariant(!payments.some((x) => x.status === 'claimed'), 'payment.claim_pending');
  const payer = ctx.userId === day.snapshot.driverId ? 'driver' : 'owner';
  validatePaymentClaim(paymentPosition(statement.netBalance, payments).remaining, payer, p.amount);

  await ctx.db.query(
    `insert into settlement_payments (id, business_id, trip_day_id, payer, amount_ngwee, method, claimed_by,
       claimed_at, device_time)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [p.paymentId, businessId, p.tripDayId, payer, p.amount, p.method, ctx.userId, ctx.now, ctx.deviceTime],
  );
  emit(ctx, {
    type: 'PaymentClaimed',
    businessId,
    subjectUserId: payer === 'driver' ? ownerId : day.snapshot.driverId,
    entityId: p.paymentId,
    link: `/days/${p.tripDayId}/settlement`,
  });
  return { paymentId: p.paymentId, status: 'claimed' };
}

/** UC17 steps 4-6 and 4a/4b: the payee confirms all or part, or rejects the claim. */
export async function decidePayment(ctx: CommandContext, p: CommandPayload<'decide_payment'>) {
  const { businessId, ownerId } = requireBusiness(ctx);
  const payment = toPayment(
    await one(ctx.db, 'select * from settlement_payments_v where id = $1', [p.paymentId], 'payment.not_found'),
  );
  const day = await loadTripDay(ctx.db, payment.tripDayId);
  const payee = payment.payer === 'driver' ? ownerId : day.snapshot.driverId;
  invariant(ctx.userId === payee, 'payment.only_payee_decides');

  const confirmedAmount = p.accept ? (p.confirmedAmount ?? payment.amount) : null;
  if (confirmedAmount !== null) validatePaymentConfirmation(payment, confirmedAmount);
  else invariant(payment.status === 'claimed', 'payment.already_decided');

  await ctx.db.query(
    `insert into payment_decisions (business_id, payment_id, decision, confirmed_amount_ngwee, reason,
       decided_by, decided_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [businessId, p.paymentId, p.accept ? 'confirmed' : 'rejected', confirmedAmount, p.reason, ctx.userId, ctx.now],
  );
  const statement = await computeStatement(ctx.db, day);
  const position = paymentPosition(statement.netBalance, await paymentsForDay(ctx.db, payment.tripDayId));
  emit(ctx, {
    type: p.accept ? 'PaymentConfirmed' : 'PaymentDisputed',
    businessId,
    subjectUserId: payment.payer === 'driver' ? day.snapshot.driverId : ownerId,
    entityId: p.paymentId,
    link: `/days/${payment.tripDayId}/settlement`,
  });
  return { paymentId: p.paymentId, state: position.state, remaining: position.remaining };
}
