// Infrastructure for the Edge Functions: the Postgres connection, the Expo
// push adapter and the relay wiring. Everything that decides anything lives in
// @dt/server and @dt/domain.
import postgres from 'postgres';
import {
  catalogues,
  notificationService,
  relayOutbox,
  type Database,
  type Db,
  type PushGateway,
} from '@dt/server';

// SUPABASE_DB_URL is provided to Edge Functions and connects as `postgres`.
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3 });

function asDb(runner: postgres.Sql): Db {
  return {
    async query(text, params = []) {
      const rows = (await runner.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown[];
      return { rows: rows as never[] };
    },
  };
}

/** Each command runs in a transaction as `command_api`, so RLS scopes it to the user's businesses. */
export const database: Database = {
  asUser: (userId, fn) =>
    sql.begin(async (tx) => {
      await tx`select set_config('app.user_id', ${userId}, true)`;
      await tx.unsafe('set local role command_api');
      return fn(asDb(tx));
    }) as Promise<never>,
};

/** Adapter: our PushGateway over the Expo push service. */
export class ExpoPushAdapter implements PushGateway {
  async send(token: string, message: { title: string; body: string; data: Record<string, unknown> }) {
    const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ to: token, sound: 'default', ...message }),
    });
    if (!res.ok) return false;
    const json = await res.json().catch(() => null);
    return json?.data?.status === 'ok';
  }
}

const subscribers = [notificationService(new ExpoPushAdapter(), catalogues)];

/** Delivers pending outbox events. The relay acts as `postgres`, outside any user's scope. */
export async function relay(): Promise<number> {
  let total = 0;
  for (let batch = await relayOutbox(asDb(sql), subscribers); batch > 0; batch = await relayOutbox(asDb(sql), subscribers)) {
    total += batch;
  }
  return total;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });
}

export const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};
