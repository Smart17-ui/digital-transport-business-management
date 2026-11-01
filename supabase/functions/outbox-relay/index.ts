// Scheduled relay: delivers any outbox events the Command API's inline relay
// missed. Invoked every minute by pg_cron (see README, "Scheduling the relay").
// Deploy with --no-verify-jwt; it checks a shared secret instead.
import { json, relay } from '../_shared/runtime.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('RELAY_SECRET');
  if (!secret || req.headers.get('x-relay-secret') !== secret) return json({ error: 'unauthorised' }, 401);
  return json({ delivered: await relay() });
});
