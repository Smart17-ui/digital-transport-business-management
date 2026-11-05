import type { CostTerms } from '../arrangement/index.ts';
import type { ExpenseKind, PaidBy } from '../ledger/expense.ts';
import type { Ngwee } from '../money.ts';

export type ApprovalDecision = 'approved' | 'pending';

export interface ApprovalCandidate {
  kind: ExpenseKind;
  amount: Ngwee;
  paidBy: PaidBy;
}

/** Strategy: decides whether a new expense needs the Owner's approval. */
export interface ApprovalPolicy {
  decide(expense: ApprovalCandidate, costs: CostTerms): ApprovalDecision;
}

/**
 * Version 0: every expense is accepted; the Owner challenges a wrong one
 * through a correction (UC13 5a, UC10).
 */
export class AcceptAllPolicy implements ApprovalPolicy {
  decide(): ApprovalDecision {
    return 'approved';
  }
}

/**
 * What pilot owners asked for: a driver may spend from the day's cash without
 * asking first, but the cost waits for the Owner, who can reject it. Owner-paid
 * costs never wait.
 */
export class OwnerApprovesPolicy implements ApprovalPolicy {
  decide(expense: ApprovalCandidate): ApprovalDecision {
    return expense.paidBy === 'owner' ? 'approved' : 'pending';
  }
}

/**
 * Version 1: fuel paid from the Driver's cash or an advance is approved
 * automatically within the float, per purchase; above it the Owner decides
 * (UC15). Owner-paid costs never wait.
 */
export class FloatApprovalPolicy implements ApprovalPolicy {
  decide(expense: ApprovalCandidate, costs: CostTerms): ApprovalDecision {
    if (expense.paidBy === 'owner' || expense.kind !== 'fuel') return 'approved';
    if (costs.fuelFloat !== null && expense.amount <= costs.fuelFloat) return 'approved';
    return 'pending';
  }
}
