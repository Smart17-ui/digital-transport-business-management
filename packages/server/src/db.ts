import { DomainError } from '@dt/domain';

export type Row = Record<string, unknown>;

/** The only database surface the application services use (Dependency Inversion). */
export interface Db {
  query<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Opens a transaction as the `command_api` role acting for a user, so row
 * level security confines every read and write to that user's businesses.
 */
export interface Database {
  asUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T>;
}

export async function maybeOne<T = Row>(db: Db, sql: string, params: unknown[] = []): Promise<T | null> {
  const { rows } = await db.query<T>(sql, params);
  return rows[0] ?? null;
}

export async function one<T = Row>(db: Db, sql: string, params: unknown[], notFoundCode: string): Promise<T> {
  const row = await maybeOne<T>(db, sql, params);
  if (row === null) throw new DomainError(notFoundCode);
  return row;
}

// Drivers differ in how they return bigint, date and timestamp columns; these
// normalise them.
export function num(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value);
}

export function numOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function isoTime(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

export function isoTimeOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : isoTime(value);
}

export function isoDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export function str(value: unknown): string {
  return String(value);
}

export function strOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}
