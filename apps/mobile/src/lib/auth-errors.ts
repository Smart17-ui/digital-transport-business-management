import { isAuthRetryableFetchError, type AuthError } from '@supabase/supabase-js';
import type { PasswordProblem } from '@dt/domain';

export function codeErrorMessage(error: AuthError): string {
  if (isAuthRetryableFetchError(error)) return 'Could not reach the server. Check your signal and try again.';
  if (error.status === 429) return 'Too many tries. Please wait a few minutes and try again.';
  if (error.code === 'otp_expired') return 'That code is wrong or has expired. Check it, or ask for a new one.';
  // Asking for a reset code never creates an account, so an unknown number lands here.
  if (error.code === 'otp_disabled') return 'We could not find an account for this number. Create an account instead.';
  return 'Could not do that right now. Please try again in a few minutes.';
}

export function signInErrorMessage(error: AuthError): string {
  if (error.code === 'invalid_credentials') {
    return 'That phone number or password is wrong. If you have never set a password, tap Create an account.';
  }
  return codeErrorMessage(error);
}

export function setPasswordErrorMessage(error: AuthError): string {
  if (error.code === 'same_password') return 'This is your current password. Choose a different one.';
  if (error.code === 'weak_password') return 'That password is too easy to guess. Choose a stronger one.';
  return codeErrorMessage(error);
}

export const PASSWORD_PROBLEMS: Record<PasswordProblem, string> = {
  too_short: 'Use at least 8 characters.',
  too_common: 'That password is too easy to guess. Choose a stronger one.',
  matches_phone: 'Do not use your phone number as your password.',
};
