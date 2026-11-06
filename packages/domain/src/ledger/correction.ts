import type { Bearer } from '../arrangement/index.ts';
import { assertAmountWithinLimit } from '../entry-checks.ts';
import { invariant } from '../errors.ts';
import { ngwee, type Ngwee } from '../money.ts';
import { ApprovedState, type Expense } from './expense.ts';
import type { IncomeEntry } from './income-entry.ts';

export interface CorrectionRequest {
  reversalId: string;
  /** Id for the replacement entry; unused when the corrected amount is zero. */
  replacementId: string;
  /** The right amount. Zero removes the entry's effect entirely. */
  amount: Ngwee;
  reason: string;
  actorId: string;
}

export interface Correction<T> {
  reversal: T;
  replacement: T | null;
}

/**
 * UC10: the original is never changed. A reversing entry cancels it and a
 * replacement carries the right values, both linked to the original.
 */
export function correctIncome(
  original: IncomeEntry,
  request: CorrectionRequest,
  alreadyCorrected: boolean,
): Correction<IncomeEntry> {
  // A disputed entry can be corrected too: that is how a dispute is resolved. Its
  // reversal cancels nothing, because a disputed entry was never counted (TripDay).
  assertAmountWithinLimit(request.amount);
  assertCorrectable(original.status !== 'pending', original.reversesId, alreadyCorrected, request);
  const base = {
    ...original,
    recordedBy: request.actorId,
    source: 'correction' as const,
    late: false,
    status: 'confirmed' as const,
  };
  return {
    reversal: { ...base, id: request.reversalId, amount: -original.amount, reversesId: original.id, replacesId: null },
    replacement:
      request.amount === 0
        ? null
        : { ...base, id: request.replacementId, amount: request.amount, reversesId: null, replacesId: original.id },
  };
}

export function correctExpense(
  original: Expense,
  request: CorrectionRequest & { borneBy: Bearer },
  alreadyCorrected: boolean,
): Correction<Expense> {
  assertAmountWithinLimit(request.amount);
  assertCorrectable(original.state.status !== 'pending', original.reversesId, alreadyCorrected, request);
  const counted = original.state.approvedAmount ?? 0;
  const base = { ...original, recordedBy: request.actorId, late: false, note: request.reason.trim() };
  return {
    // A declined expense counted for nothing, so its reversal is zero-effect.
    reversal: {
      ...base,
      id: request.reversalId,
      amount: -original.amount,
      state: new ApprovedState(0 - counted),
      reversesId: original.id,
      replacesId: null,
    },
    replacement:
      request.amount === 0
        ? null
        : {
            ...base,
            id: request.replacementId,
            amount: request.amount,
            borneBy: request.borneBy,
            state: new ApprovedState(request.amount),
            reversesId: null,
            replacesId: original.id,
          },
  };
}

function assertCorrectable(
  locked: boolean,
  reversesId: string | null,
  alreadyCorrected: boolean,
  request: CorrectionRequest,
): void {
  invariant(request.reason.trim().length > 0, 'correction.reason_required');
  invariant(locked, 'correction.entry_not_locked');
  invariant(reversesId === null, 'correction.cannot_correct_reversal');
  invariant(!alreadyCorrected, 'correction.already_corrected');
  invariant(ngwee(request.amount) >= 0, 'correction.amount_negative');
}
