import {
  AcceptAllPolicy,
  ArrangementFactory,
  calculateSettlement,
  DomainError,
  parseKwacha,
  TripDay,
  type ArrangementType,
  type SettlementStatement,
} from '@dt/domain';

export interface PreviewInput {
  type: Extract<ArrangementType, 'fixed_target' | 'revenue_share' | 'salary'>;
  /** Daily target or daily pay in kwacha, or the Owner's percentage for revenue share. */
  term: string;
  takings: string;
  fuelFromCash: string;
  ownerBearsFuel: boolean;
  handedToOwner: string;
}

export type PreviewResult = { ok: true; statement: SettlementStatement } | { ok: false; reason: string };

const DRIVER = 'preview-driver';

/**
 * Runs one day through the same domain code the server uses, as the app will
 * offline to show provisional totals (UC16 1a).
 */
export function previewDay(input: PreviewInput): PreviewResult {
  try {
    const arrangement = ArrangementFactory.create(input.type, termsFor(input));
    const day = TripDay.start(
      {
        id: 'preview-day',
        businessId: 'preview',
        vehicleId: 'preview-vehicle',
        driverId: DRIVER,
        serviceDate: '2026-11-02',
        odometerStart: 0,
        at: new Date().toISOString(),
      },
      { openDayOnVehicle: false, vehicleStatus: 'active', activeArrangementId: 'preview-arrangement' },
    );

    const confirmHandover = (kind: 'takings' | 'remittance', amount: number) => {
      if (amount <= 0) return;
      const entry = day.recordHandover(
        {
          id: `preview-${kind}`,
          kind,
          amount,
          method: 'cash',
          giver: { kind: kind === 'takings' ? 'conductor' : 'driver', userId: null },
          receiver: { kind: kind === 'takings' ? 'driver' : 'owner', userId: null },
          recordedBy: DRIVER,
        },
        ['cash'],
      );
      entry.status = 'confirmed';
    };
    confirmHandover('takings', amount(input.takings));
    confirmHandover('remittance', amount(input.handedToOwner));

    const fuel = amount(input.fuelFromCash);
    if (fuel > 0) {
      const bearer = input.ownerBearsFuel ? 'owner' : 'driver';
      day.recordExpense(
        {
          id: 'preview-fuel',
          vehicleId: 'preview-vehicle',
          category: 'fuel',
          kind: 'fuel',
          amount: fuel,
          litres: null,
          paidBy: 'driver_cash',
          note: '',
          receiptPath: null,
          recordedBy: DRIVER,
          borneByOverride: null,
        },
        { fuelBearer: bearer, otherCostsBearer: 'owner', fuelFloat: null },
        new AcceptAllPolicy(),
        false,
      );
    }
    day.end(0, new Date().toISOString());
    return { ok: true, statement: calculateSettlement(day, arrangement, { targetApplies: true, arrearsBroughtForward: 0 }) };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, reason: reasonFor(error.code) };
    throw error;
  }
}

function amount(text: string): number {
  return text.trim() === '' ? 0 : parseKwacha(text);
}

function termsFor(input: PreviewInput): Record<string, number> {
  switch (input.type) {
    case 'fixed_target':
      return { dailyTarget: amount(input.term) };
    case 'salary':
      return { dailyPay: amount(input.term) };
    case 'revenue_share': {
      const percent = Number(input.term);
      return { ownerShareBasisPoints: Number.isFinite(percent) ? Math.round(percent * 100) : -1 };
    }
  }
}

// English for now; these move to translation files with the rest of the app text.
function reasonFor(code: string): string {
  if (code === 'money.invalid' || code === 'money.not_integer') return 'Enter amounts like 150 or 150.50';
  if (code === 'arrangement.invalid_terms') return 'Enter the arrangement terms above';
  if (code === 'money.invalid_basis_points') return 'Percentage must be between 0 and 100';
  return 'Check the amounts entered';
}
