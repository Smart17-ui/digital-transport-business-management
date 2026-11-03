import { ArrangementFactory, formatKwacha, parseKwacha, parsePercent, type ArrangementType, type Bearer } from '@dt/domain';

export interface ArrangementRecord {
  id: string;
  vehicleId: string;
  driverId: string;
  type: ArrangementType;
  terms: Record<string, number>;
  fuelBearer: Bearer;
  otherCostsBearer: Bearer;
  effectiveFrom: string;
  status: 'proposed' | 'active' | 'declined';
  declineReason: string | null;
}

export const ARRANGEMENT_OPTIONS: readonly { value: ArrangementType; title: string; detail: string }[] = [
  {
    value: 'fixed_target',
    title: 'Daily target',
    detail: 'The driver pays you a fixed amount each working day and keeps the rest.',
  },
  { value: 'revenue_share', title: 'Share of takings', detail: 'You and the driver split the takings by percentage.' },
  { value: 'salary', title: 'Daily pay', detail: 'All takings are yours, and you pay the driver a fixed amount each working day.' },
  {
    value: 'rent_to_own',
    title: 'Rent to own',
    detail: 'The driver pays a fixed amount each working day towards buying the bus.',
  },
];

export const AMOUNT_LABEL: Record<ArrangementType, string> = {
  fixed_target: 'Daily target (K)',
  revenue_share: "Owner's share (%)",
  salary: 'Daily pay (K)',
  rent_to_own: 'Daily payment (K)',
};

/** The terms for the entered values, or null while they are incomplete or not valid. */
export function buildTerms(type: ArrangementType, amount: string, totalPrice: string): Record<string, number> | null {
  try {
    const terms = termsFor(type, amount, totalPrice);
    ArrangementFactory.create(type, terms);
    return terms;
  } catch {
    return null;
  }
}

function termsFor(type: ArrangementType, amount: string, totalPrice: string): Record<string, number> {
  switch (type) {
    case 'fixed_target':
      return { dailyTarget: parseKwacha(amount) };
    case 'revenue_share':
      return { ownerShareBasisPoints: parsePercent(amount) };
    case 'salary':
      return { dailyPay: parseKwacha(amount) };
    case 'rent_to_own':
      return { dailyPayment: parseKwacha(amount), totalPrice: parseKwacha(totalPrice) };
  }
}

/** False if saved terms cannot be understood. Nobody should agree to, or see sums from, terms like that. */
export function termsAreReadable(type: ArrangementType, terms: unknown): boolean {
  try {
    ArrangementFactory.create(type, terms);
    return true;
  } catch {
    return false;
  }
}

/** Kwacha without the ".00" on whole amounts, which is how people say them. */
export function kwacha(amount: number): string {
  return formatKwacha(amount).replace(/\.00$/, '');
}

export function describeTerms(type: ArrangementType, terms: Record<string, number>, viewer: Bearer): string {
  if (!termsAreReadable(type, terms)) return 'These terms could not be read.';
  const owner = viewer === 'owner';
  switch (type) {
    case 'fixed_target': {
      const amount = kwacha(terms.dailyTarget!);
      return owner
        ? `The driver pays you ${amount} each working day and keeps the rest.`
        : `You pay the owner ${amount} each working day and keep the rest.`;
    }
    case 'revenue_share': {
      const ownerPercent = terms.ownerShareBasisPoints! / 100;
      const driverPercent = (10_000 - terms.ownerShareBasisPoints!) / 100;
      return owner
        ? `You get ${ownerPercent}% of the takings and the driver gets ${driverPercent}%.`
        : `The owner gets ${ownerPercent}% of the takings and you get ${driverPercent}%.`;
    }
    case 'salary': {
      const amount = kwacha(terms.dailyPay!);
      return owner
        ? `All takings are yours, and you pay the driver ${amount} each working day.`
        : `All takings go to the owner, and the owner pays you ${amount} each working day.`;
    }
    case 'rent_to_own': {
      const amount = kwacha(terms.dailyPayment!);
      const price = kwacha(terms.totalPrice!);
      return owner
        ? `The driver pays you ${amount} each working day towards buying the bus for ${price}, and keeps the rest.`
        : `You pay the owner ${amount} each working day towards buying the bus for ${price}, and keep the rest.`;
    }
  }
}

export function describeCosts(fuelBearer: Bearer, otherCostsBearer: Bearer, viewer: Bearer): string {
  const pays = (bearer: Bearer) => (bearer === viewer ? 'You pay' : `The ${bearer} pays`);
  return fuelBearer === otherCostsBearer
    ? `${pays(fuelBearer)} for fuel and other costs.`
    : `${pays(fuelBearer)} for fuel. ${pays(otherCostsBearer)} other costs.`;
}

export interface OfferSummary {
  /** The number that matters most, shown large. */
  headline: string;
  headlineLabel: string;
  rows: { label: string; value: string }[];
}

/** An offer as the driver reads it: the main number, then one short fact per line. */
export function offerSummary(offer: ArrangementRecord): OfferSummary {
  const { type, terms } = offer;
  const costs = [
    { label: 'Fuel', value: offer.fuelBearer === 'driver' ? 'You pay' : 'Owner pays' },
    { label: 'Other costs', value: offer.otherCostsBearer === 'driver' ? 'You pay' : 'Owner pays' },
    { label: 'Starts', value: formatDay(offer.effectiveFrom) },
  ];
  switch (type) {
    case 'fixed_target':
      return {
        headline: kwacha(terms.dailyTarget!),
        headlineLabel: 'You pay the owner each working day',
        rows: [{ label: 'You keep', value: 'The rest' }, ...costs],
      };
    case 'revenue_share':
      return {
        headline: `${(10_000 - terms.ownerShareBasisPoints!) / 100}%`,
        headlineLabel: 'Your share of the takings',
        rows: [{ label: "Owner's share", value: `${terms.ownerShareBasisPoints! / 100}%` }, ...costs],
      };
    case 'salary':
      return {
        headline: kwacha(terms.dailyPay!),
        headlineLabel: 'The owner pays you each working day',
        rows: [{ label: 'Takings', value: 'All go to the owner' }, ...costs],
      };
    case 'rent_to_own':
      return {
        headline: kwacha(terms.dailyPayment!),
        headlineLabel: 'You pay the owner each working day',
        rows: [
          { label: 'Towards buying the bus for', value: kwacha(terms.totalPrice!) },
          { label: 'You keep', value: 'The rest' },
          ...costs,
        ],
      };
  }
}

export function formatDay(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

/** Today on the phone's calendar, as the server expects it. */
export function localDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
