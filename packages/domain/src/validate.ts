import { DomainError } from './errors.ts';

/**
 * Minimal runtime validation so the domain package stays dependency-free and
 * runs unchanged in React Native, Node and Deno.
 */
export type Reader<T> = (value: unknown, path: string) => T;

function fail(path: string, expected: string): never {
  throw new DomainError('command.invalid', `${path} must be ${expected}`);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const v = {
  string(max = 200): Reader<string> {
    return (value, path) =>
      typeof value === 'string' && value.length <= max ? value : fail(path, `text up to ${max} characters`);
  },
  nonEmpty(max = 200): Reader<string> {
    return (value, path) => {
      const s = v.string(max)(value, path).trim();
      return s.length > 0 ? s : fail(path, 'non-empty text');
    };
  },
  uuid(): Reader<string> {
    return (value, path) => (typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : fail(path, 'a UUID'));
  },
  date(): Reader<string> {
    return (value, path) =>
      typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fail(path, 'a YYYY-MM-DD date');
  },
  timestamp(): Reader<string> {
    return (value, path) =>
      typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fail(path, 'an ISO timestamp');
  },
  int(): Reader<number> {
    return (value, path) => (Number.isSafeInteger(value) ? (value as number) : fail(path, 'a whole number'));
  },
  number(): Reader<number> {
    return (value, path) =>
      typeof value === 'number' && Number.isFinite(value) ? value : fail(path, 'a number');
  },
  boolean(): Reader<boolean> {
    return (value, path) => (typeof value === 'boolean' ? value : fail(path, 'true or false'));
  },
  oneOf<const T extends string>(options: readonly T[]): Reader<T> {
    return (value, path) =>
      typeof value === 'string' && (options as readonly string[]).includes(value)
        ? (value as T)
        : fail(path, `one of ${options.join(', ')}`);
  },
  nullable<T>(reader: Reader<T>): Reader<T | null> {
    return (value, path) => (value === null || value === undefined ? null : reader(value, path));
  },
  any(): Reader<unknown> {
    return (value) => value;
  },
  object<S extends Record<string, Reader<unknown>>>(shape: S): Reader<{ [K in keyof S]: ReturnType<S[K]> }> {
    return (value, path) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'an object');
      const record = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, reader] of Object.entries(shape)) {
        out[key] = reader(record[key], `${path}.${key}`);
      }
      return out as { [K in keyof S]: ReturnType<S[K]> };
    };
  },
};
