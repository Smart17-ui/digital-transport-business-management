import type { CommandPayload, CommandType } from '@dt/domain';
import { randomUUID } from 'expo-crypto';
import { openDatabaseSync } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { sendBatch } from '@/lib/commands';
import { supabase } from '@/lib/supabase';

/**
 * The offline queue (UC9): a driver's entries are written to the phone first and
 * sent when there is signal, in the order they were made. The server's clientId
 * check makes a resend harmless. Rows belong to one user, so a shared phone never
 * sends one person's entries under another person's account.
 */
const db = openDatabaseSync('digital-transport.db');
db.execSync(`
  create table if not exists queued_commands (
    seq integer primary key autoincrement,
    client_id text not null unique,
    user_id text not null,
    type text not null,
    business_id text not null,
    payload text not null,
    device_time text not null,
    refused_code text
  );
`);

const BATCH_SIZE = 20;
const RETRY_MS = 20_000;

interface Row {
  seq: number;
  client_id: string;
  type: string;
  business_id: string;
  payload: string;
  device_time: string;
  refused_code: string | null;
}

export interface QueuedCommand {
  clientId: string;
  type: string;
  payload: unknown;
  deviceTime: string;
  /** Set when the server refused this command. It stays until the user has seen why. */
  refusedCode: string | null;
}

/** Told when the queue changes; `sent` means the server's data changed too. */
type Listener = (sent: boolean) => void;
const listeners = new Set<Listener>();
const notify = (sent: boolean) => listeners.forEach((listener) => listener(sent));

export async function enqueue<T extends CommandType>(
  userId: string,
  type: T,
  businessId: string,
  payload: CommandPayload<T>,
  clientId: string = randomUUID(),
): Promise<void> {
  await db.runAsync(
    `insert or ignore into queued_commands (client_id, user_id, type, business_id, payload, device_time)
     values (?, ?, ?, ?, ?, ?)`,
    [clientId, userId, type, businessId, JSON.stringify(payload), new Date().toISOString()],
  );
  notify(false);
  void flush(userId);
}

async function listQueued(userId: string): Promise<QueuedCommand[]> {
  const rows = await db.getAllAsync<Row>('select * from queued_commands where user_id = ? order by seq', [userId]);
  return rows.map((row) => ({
    clientId: row.client_id,
    type: row.type,
    payload: JSON.parse(row.payload),
    deviceTime: row.device_time,
    refusedCode: row.refused_code,
  }));
}

let flushing: Promise<void> | null = null;

/** Sends what is waiting. Stops quietly at the first sign of no signal, and tries again later. */
export function flush(userId: string): Promise<void> {
  flushing ??= sendWaiting(userId).finally(() => {
    flushing = null;
  });
  return flushing;
}

async function sendWaiting(userId: string): Promise<void> {
  for (;;) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id !== userId) return;

    const rows = await db.getAllAsync<Row>(
      'select * from queued_commands where user_id = ? and refused_code is null order by seq limit ?',
      [userId, BATCH_SIZE],
    );
    if (rows.length === 0) return;

    const results = await sendBatch(
      rows.map((row) => ({
        type: row.type,
        clientId: row.client_id,
        deviceTime: row.device_time,
        businessId: row.business_id,
        payload: JSON.parse(row.payload),
      })),
    ).catch(() => null);
    if (results?.length !== rows.length) return;

    for (const [i, result] of results.entries()) {
      const clientId = rows[i]!.client_id;
      if (result.ok) {
        await db.runAsync('delete from queued_commands where client_id = ?', [clientId]);
      } else {
        await db.runAsync('update queued_commands set refused_code = ? where client_id = ?', [result.code, clientId]);
      }
    }
    notify(true);
  }
}

async function dismissRefused(clientId: string): Promise<void> {
  await db.runAsync('delete from queued_commands where client_id = ? and refused_code is not null', [clientId]);
  notify(false);
}

/**
 * The user's queue, kept sending while the screen is mounted. `onSent` should read
 * the server's data again; the queue only updates afterwards, so a day that has
 * just been sent does not vanish from the screen in between.
 */
export function useCommandQueue(userId: string, onSent: () => Promise<void>) {
  const [queued, setQueued] = useState<QueuedCommand[]>([]);
  const [loaded, setLoaded] = useState(false);
  const latestOnSent = useRef(onSent);
  latestOnSent.current = onSent;

  useEffect(() => {
    let mounted = true;
    const refresh = async (sent: boolean) => {
      if (sent) await latestOnSent.current();
      const next = await listQueued(userId);
      if (mounted) {
        setQueued(next);
        setLoaded(true);
      }
    };

    listeners.add(refresh);
    void refresh(false);
    void flush(userId);
    const timer = setInterval(() => void flush(userId), RETRY_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flush(userId);
    });
    return () => {
      mounted = false;
      listeners.delete(refresh);
      clearInterval(timer);
      appState.remove();
    };
  }, [userId]);

  return {
    /** False until the phone's queue has been read, when `waiting` cannot be relied on yet. */
    loaded,
    /** Everything still on the phone that the server has not accepted. */
    waiting: queued.filter((c) => c.refusedCode === null),
    refused: queued.filter((c) => c.refusedCode !== null),
    dismissRefused,
  };
}
