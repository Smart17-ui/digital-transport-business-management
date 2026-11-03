import type { CommandPayload, CommandResult, CommandType } from '@dt/domain';
import { randomUUID } from 'expo-crypto';
import { supabase } from '@/lib/supabase';

/** A refusal by the server, or `network` when the phone could not reach it. */
export class CommandError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CommandError';
  }
}

/**
 * Sends one command to the Command API. Pass the same clientId when retrying
 * something that may already have worked, so it is only applied once.
 */
export async function sendCommand<T extends CommandType>(
  type: T,
  businessId: string | null,
  payload: CommandPayload<T>,
  clientId: string = randomUUID(),
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke<{ results: CommandResult[] }>('command', {
    body: { commands: [{ type, clientId, deviceTime: new Date().toISOString(), businessId, payload }] },
  });
  const result = data?.results[0];
  if (error || !result) throw new CommandError('network');
  if (!result.ok) throw new CommandError(result.code);
  return result.data;
}

const REASONS: Record<string, string> = {
  network: 'Could not reach the server. Check your signal and try again.',
  'invite.invalid_or_expired': 'That invite code is wrong, used or expired. Ask the owner for a new one.',
  'invite.already_member': 'You are already part of this business.',
};

export function reasonFor(error: unknown): string {
  const code = error instanceof CommandError ? error.code : 'network';
  return REASONS[code] ?? 'Something went wrong. Please try again.';
}
