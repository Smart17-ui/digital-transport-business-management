import { ArrangementFactory, DomainError, invariant, type CommandPayload } from '@dt/domain';
import { emit, requireBusiness, requireOwner, type CommandContext } from '../context.ts';
import { isoTime, maybeOne, one, str } from '../db.ts';

const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I/L
const INVITE_DAYS = 7;

export async function createBusiness(ctx: CommandContext, p: CommandPayload<'create_business'>) {
  await ctx.db.query('insert into businesses (id, name, owner_id) values ($1, $2, $3)', [p.businessId, p.name, ctx.userId]);
  await ctx.db.query(`insert into memberships (business_id, user_id, role) values ($1, $2, 'owner')`, [
    p.businessId,
    ctx.userId,
  ]);
  return { businessId: p.businessId };
}

/** UC2: a short code the Owner reads out or shares; single use, expires in a week. */
export async function createInvite(ctx: CommandContext, p: CommandPayload<'create_invite'>) {
  const { businessId } = requireOwner(ctx);
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const code = Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
  const expiresAt = new Date(Date.parse(ctx.now) + INVITE_DAYS * 86_400_000).toISOString();
  await ctx.db.query(
    'insert into invite_codes (code, business_id, role, created_by, expires_at) values ($1, $2, $3, $4, $5)',
    [code, businessId, p.role, ctx.userId, expiresAt],
  );
  return { code, expiresAt };
}

/** UC3 */
export async function joinBusiness(ctx: CommandContext, p: CommandPayload<'join_business'>) {
  const invite = await maybeOne(ctx.db, 'select * from invite_codes where code = $1 for update', [
    p.code.toUpperCase(),
  ]);
  if (invite === null || invite.used_by !== null || Date.parse(isoTime(invite.expires_at)) < Date.parse(ctx.now)) {
    throw new DomainError('invite.invalid_or_expired');
  }
  const businessId = str(invite.business_id);
  const already = await maybeOne(
    ctx.db,
    'select 1 from memberships where business_id = $1 and user_id = $2 and ended_at is null',
    [businessId, ctx.userId],
  );
  invariant(already === null, 'invite.already_member');
  await ctx.db.query('update invite_codes set used_by = $1, used_at = $2 where code = $3', [
    ctx.userId,
    ctx.now,
    invite.code,
  ]);
  await ctx.db.query('insert into memberships (business_id, user_id, role) values ($1, $2, $3)', [
    businessId,
    ctx.userId,
    invite.role,
  ]);
  emit(ctx, {
    type: 'MemberJoined',
    businessId,
    subjectUserId: str(invite.created_by),
    entityId: ctx.userId,
    link: '/crew',
  });
  return { businessId, role: str(invite.role) };
}

/** UC5 (no templates in Version 0) */
export async function registerVehicle(ctx: CommandContext, p: CommandPayload<'register_vehicle'>) {
  const { businessId } = requireOwner(ctx);
  await ctx.db.query('insert into vehicles (id, business_id, plate, vehicle_type) values ($1, $2, $3, $4)', [
    p.vehicleId,
    businessId,
    p.plate.toUpperCase(),
    p.vehicleType,
  ]);
  return { vehicleId: p.vehicleId };
}

export async function addConductor(ctx: CommandContext, p: CommandPayload<'add_conductor'>) {
  const { businessId } = requireOwner(ctx);
  await one(ctx.db, 'select 1 from vehicles where id = $1', [p.vehicleId], 'vehicle.not_found');
  await ctx.db.query('insert into conductors (id, business_id, vehicle_id, name) values ($1, $2, $3, $4)', [
    p.conductorId,
    businessId,
    p.vehicleId,
    p.name,
  ]);
  return { conductorId: p.conductorId };
}

/** UC6 steps 1-5 */
export async function proposeArrangement(ctx: CommandContext, p: CommandPayload<'propose_arrangement'>) {
  const { businessId } = requireOwner(ctx);
  ArrangementFactory.create(p.type, p.terms); // validates the terms
  invariant(p.fuelFloat === null || p.fuelFloat > 0, 'arrangement.invalid_float');
  await one(ctx.db, 'select 1 from vehicles where id = $1', [p.vehicleId], 'vehicle.not_found');
  await one(
    ctx.db,
    `select 1 from memberships where business_id = $1 and user_id = $2 and role = 'driver' and ended_at is null`,
    [businessId, p.driverId],
    'arrangement.driver_not_in_business',
  );
  await ctx.db.query(
    `insert into arrangements (id, business_id, vehicle_id, driver_id, type, terms, fuel_bearer,
       other_costs_bearer, fuel_float_ngwee, effective_from, proposed_by, proposed_at)
     values ($1, $2, $3, $4, $5, $6::text::jsonb, $7, $8, $9, $10, $11, $12)`,
    [
      p.arrangementId, businessId, p.vehicleId, p.driverId, p.type, JSON.stringify(p.terms), p.fuelBearer,
      p.otherCostsBearer, p.fuelFloat, p.effectiveFrom, ctx.userId, ctx.now,
    ],
  );
  emit(ctx, {
    type: 'ArrangementProposed',
    businessId,
    subjectUserId: p.driverId,
    entityId: p.arrangementId,
    link: `/arrangements/${p.arrangementId}`,
  });
  return { arrangementId: p.arrangementId };
}

/** UC6 steps 6-7 and 6a */
export async function respondArrangement(ctx: CommandContext, p: CommandPayload<'respond_arrangement'>) {
  const { businessId, ownerId } = requireBusiness(ctx);
  const row = await one(ctx.db, 'select * from arrangements where id = $1 for update', [p.arrangementId], 'arrangement.not_found');
  invariant(str(row.driver_id) === ctx.userId, 'arrangement.not_yours');
  invariant(row.status === 'proposed', 'arrangement.already_decided');

  if (p.accept) {
    // A bus has one driver, so taking it needs any other driver's day on it to have ended first.
    const running = await maybeOne(
      ctx.db,
      'select 1 from trip_days where vehicle_id = $1 and driver_id <> $2 and ended_at is null',
      [row.vehicle_id, row.driver_id],
    );
    invariant(running === null, 'arrangement.bus_in_use');
    // UC6 1a: whoever had the bus, the old arrangement ends and stays in history.
    const { rows: ended } = await ctx.db.query(
      `update arrangements set status = 'ended', ended_on = $1
       where vehicle_id = $2 and status = 'active' returning driver_id`,
      [row.effective_from, row.vehicle_id],
    );
    for (const driverId of new Set(ended.map((r) => str(r.driver_id)))) {
      if (driverId === str(row.driver_id)) continue;
      emit(ctx, {
        type: 'ArrangementEnded',
        businessId,
        subjectUserId: driverId,
        entityId: p.arrangementId,
        link: '/',
      });
    }
    await ctx.db.query(
      `update arrangements set status = 'declined', decided_at = $1, decline_reason = 'Another offer on this bus was accepted.'
       where vehicle_id = $2 and status = 'proposed' and id <> $3`,
      [ctx.now, row.vehicle_id, p.arrangementId],
    );
    await ctx.db.query(`update arrangements set status = 'active', decided_at = $1 where id = $2`, [
      ctx.now,
      p.arrangementId,
    ]);
  } else {
    await ctx.db.query(
      `update arrangements set status = 'declined', decided_at = $1, decline_reason = $2 where id = $3`,
      [ctx.now, p.reason, p.arrangementId],
    );
  }
  emit(ctx, {
    type: p.accept ? 'ArrangementAccepted' : 'ArrangementDeclined',
    businessId,
    subjectUserId: ownerId,
    entityId: p.arrangementId,
    link: `/arrangements/${p.arrangementId}`,
  });
  return { arrangementId: p.arrangementId, status: p.accept ? 'active' : 'declined' };
}

/** UC45: history stays; access ends at once, including queued offline commands. */
export async function removeMember(ctx: CommandContext, p: CommandPayload<'remove_member'>) {
  const { businessId } = requireOwner(ctx);
  invariant(p.userId !== ctx.userId, 'member.cannot_remove_self');
  const today = ctx.now.slice(0, 10);
  await ctx.db.query(
    `update arrangements set status = 'ended', ended_on = $1
     where business_id = $2 and driver_id = $3 and status = 'active'`,
    [today, businessId, p.userId],
  );
  // Proposed arrangements are simply never accepted; the driver can no longer act on them.
  const { rows } = await ctx.db.query(
    `update memberships set ended_at = $1, ended_by = $2
     where business_id = $3 and user_id = $4 and ended_at is null returning id`,
    [ctx.now, ctx.userId, businessId, p.userId],
  );
  invariant(rows.length > 0, 'member.not_found');
  emit(ctx, { type: 'MemberRemoved', businessId, subjectUserId: p.userId, entityId: p.userId, link: '/earnings' });
  return { userId: p.userId };
}

/** UC1 step 5 and UC33 (consent only in Version 0). */
export async function recordConsent(ctx: CommandContext, p: CommandPayload<'record_consent'>) {
  await ctx.db.query('insert into consents (user_id, scope, notice_version, granted_at) values ($1, $2, $3, $4)', [
    ctx.userId,
    p.scope,
    p.noticeVersion,
    ctx.now,
  ]);
  return {};
}

export async function setProfile(ctx: CommandContext, p: CommandPayload<'set_profile'>) {
  await ctx.db.query('update profiles set display_name = $1, language = $2 where id = $3', [
    p.displayName,
    p.language,
    ctx.userId,
  ]);
  return {};
}

export async function registerDevice(ctx: CommandContext, p: CommandPayload<'register_device'>) {
  await ctx.db.query(
    `insert into device_tokens (token, user_id, platform, updated_at) values ($1, $2, $3, $4)
     on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform,
       updated_at = excluded.updated_at`,
    [p.token, ctx.userId, p.platform, ctx.now],
  );
  return {};
}
