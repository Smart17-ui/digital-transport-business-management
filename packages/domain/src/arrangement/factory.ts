import { DomainError, invariant } from '../errors.ts';
import { ngwee, type Ngwee } from '../money.ts';
import { ARRANGEMENT_TYPES, type Arrangement, type ArrangementType, type Bearer } from './arrangement.ts';
import {
  FixedTargetArrangement,
  RentToOwnArrangement,
  RevenueShareArrangement,
  SalaryArrangement,
} from './strategies.ts';

/**
 * Simple Factory: the only place, with the strategy classes, that knows the
 * four arrangement types. Terms arrive as stored JSON and are validated here.
 */
export const ArrangementFactory = {
  create(type: string, terms: unknown): Arrangement {
    const t = asRecord(terms);
    switch (type as ArrangementType) {
      case 'fixed_target':
        return new FixedTargetArrangement({ dailyTarget: positiveAmount(t, 'dailyTarget') });
      case 'revenue_share': {
        const bp = t['ownerShareBasisPoints'];
        invariant(
          typeof bp === 'number' && Number.isInteger(bp) && bp >= 0 && bp <= 10_000,
          'arrangement.invalid_terms',
          'ownerShareBasisPoints must be a whole number from 0 to 10000',
        );
        return new RevenueShareArrangement({ ownerShareBasisPoints: bp });
      }
      case 'salary':
        return new SalaryArrangement({ dailyPay: positiveAmount(t, 'dailyPay') });
      case 'rent_to_own':
        return new RentToOwnArrangement({
          dailyPayment: positiveAmount(t, 'dailyPayment'),
          totalPrice: positiveAmount(t, 'totalPrice'),
        });
      default:
        throw new DomainError('arrangement.unknown_type', `Unknown arrangement type: ${type}`);
    }
  },

  isKnownType(type: string): type is ArrangementType {
    return (ARRANGEMENT_TYPES as readonly string[]).includes(type);
  },
};

/** Who bears costs under an arrangement, set by the Owner in UC6 step 4. */
export interface CostTerms {
  fuelBearer: Bearer;
  otherCostsBearer: Bearer;
  /** Fuel float per purchase; null in Version 0 (no float, AcceptAllPolicy). */
  fuelFloat: Ngwee | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  invariant(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'arrangement.invalid_terms',
    'Terms must be an object',
  );
  return value as Record<string, unknown>;
}

function positiveAmount(terms: Record<string, unknown>, key: string): Ngwee {
  const value = terms[key];
  invariant(typeof value === 'number', 'arrangement.invalid_terms', `${key} is required`);
  invariant(ngwee(value) > 0, 'arrangement.invalid_terms', `${key} must be greater than zero`);
  return value;
}
