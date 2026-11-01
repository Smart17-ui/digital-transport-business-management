/**
 * A rule in the domain was broken. `code` is stable and maps to a translation
 * key in the app, so the user sees the reason in their own language (UC9 5c).
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ? `${code}: ${message}` : code);
    this.name = 'DomainError';
  }
}

export function invariant(condition: unknown, code: string, message?: string): asserts condition {
  if (!condition) throw new DomainError(code, message);
}
