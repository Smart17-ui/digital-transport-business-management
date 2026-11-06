// The Command API (design 8.1): every write from the app arrives here.
//
//   POST /command               { commands: Command[] }  -> { results: CommandResult[] }
//   POST /command/positions     PositionUpload           -> { accepted, dropped }
//   GET  /command/settlement?tripDayId=...               -> SettlementView
//
// Commands in a batch are applied in order, one transaction each, exactly as
// the offline queue made them (UC9 step 4). A failed command does not stop the
// rest; a command that depends on it fails with its own reason.
import { createClient } from '@supabase/supabase-js';
import { DomainError } from '@dt/domain';
import { handleCommand, recordPositions, viewSettlement } from '@dt/server';
import { corsHeaders, database, json, relay } from '../_shared/runtime.ts';

const MAX_BATCH = 100;

const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const { data, error } = token ? await auth.auth.getUser(token) : { data: null, error: true };
  if (error || !data?.user) return json({ error: 'unauthorised' }, 401);
  const userId = data.user.id;

  try {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname.endsWith('/settlement')) {
      const tripDayId = url.searchParams.get('tripDayId') ?? '';
      return json(await viewSettlement(database, userId, tripDayId));
    }

    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    const body = await req.json().catch(() => null);

    if (url.pathname.endsWith('/positions')) return json(await recordPositions(database, userId, body));

    const commands: unknown[] = Array.isArray(body?.commands) ? body.commands : [];
    if (commands.length === 0 || commands.length > MAX_BATCH) {
      return json({ error: `send 1 to ${MAX_BATCH} commands` }, 400);
    }

    const results = [];
    for (const command of commands) results.push(await handleCommand(database, userId, command));

    // Deliver notifications without making the phone wait; the scheduled relay
    // picks up anything this misses.
    // @ts-ignore EdgeRuntime is provided by Supabase Edge Functions.
    EdgeRuntime.waitUntil(relay().catch((e: unknown) => console.error('relay failed', e)));
    return json({ results });
  } catch (e) {
    if (e instanceof DomainError) return json({ error: e.code }, 400);
    console.error(e);
    return json({ error: 'server error' }, 500);
  }
});
