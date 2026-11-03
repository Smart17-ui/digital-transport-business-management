import { isAuthRetryableFetchError, type AuthError } from '@supabase/supabase-js';

export function codeErrorMessage(error: AuthError): string {
  if (isAuthRetryableFetchError(error)) return 'Could not reach the server. Check your signal and try again.';
  if (error.status === 429) return 'Too many tries. Please wait a few minutes and try again.';
  if (error.code === 'otp_expired') return 'That code is wrong or has expired. Check it, or ask for a new one.';
  return 'Could not do that right now. Please try again in a few minutes.';
}
