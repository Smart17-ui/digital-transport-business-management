import { DomainError, type DomainEvent, type TripDay } from '@dt/domain';
import { maybeOne, str, type Db } from './db.ts';

/** Everything a handler needs about who is acting, where, and when. */
export interface CommandContext {
  db: Db;
  userId: string;
  businessId: string | null;
  /** The actor's role in the business, null outside one. */
  role: string | null;
  ownerId: string | null;
  /** Server time; the phone's clock is stored separately and never trusted. */
  now: string;
  deviceTime: string;
  /** Collected during the command and written to the outbox in the same transaction. */
  events: DomainEvent[];
}

export async function buildContext(
  db: Db,
  userId: string,
  businessId: string | null,
  now: string,
  deviceTime: string,
): Promise<CommandContext> {
  const ctx: CommandContext = { db, userId, businessId, role: null, ownerId: null, now, deviceTime, events: [] };
  if (businessId === null) return ctx;
  const membership = await maybeOne(
    db,
    `select m.role, b.owner_id from memberships m join businesses b on b.id = m.business_id
     where m.business_id = $1 and m.user_id = $2 and m.ended_at is null`,
    [businessId, userId],
  );
  // Also covers a member removed while their phone was offline (UC9 5d).
  if (membership === null) throw new DomainError('access.not_member');
  return { ...ctx, role: str(membership.role), ownerId: str(membership.owner_id) };
}

export function requireBusiness(ctx: CommandContext): { businessId: string; ownerId: string } {
  if (ctx.businessId === null || ctx.ownerId === null) throw new DomainError('access.not_member');
  return { businessId: ctx.businessId, ownerId: ctx.ownerId };
}

export function requireOwner(ctx: CommandContext): { businessId: string; ownerId: string } {
  const scope = requireBusiness(ctx);
  if (ctx.role !== 'owner') throw new DomainError('access.owner_only');
  return scope;
}

/** The day's Driver or the business Owner may act on a day. */
export function requireDayParty(ctx: CommandContext, day: TripDay): { businessId: string; ownerId: string } {
  const scope = requireBusiness(ctx);
  if (day.snapshot.businessId !== scope.businessId) throw new DomainError('day.not_found');
  if (ctx.userId !== day.snapshot.driverId && ctx.role !== 'owner') throw new DomainError('access.not_your_day');
  return scope;
}

export function emit(
  ctx: CommandContext,
  event: Omit<DomainEvent, 'actorId' | 'critical' | 'data'> & Partial<Pick<DomainEvent, 'critical' | 'data'>>,
): void {
  ctx.events.push({ critical: false, data: {}, ...event, actorId: ctx.userId });
}
