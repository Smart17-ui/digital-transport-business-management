/**
 * Normalises a Zambian mobile number to 260XXXXXXXXX. Auth sends E.164 without
 * the plus; local forms are accepted too. Returns null for anything else, so
 * the pilot never pays for texts to other countries.
 */
export function zambianMsisdn(phone: string): string | null {
  const digits = phone.replace(/[\s+()-]/g, '');
  const local = digits.startsWith('260') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits;
  return /^[79]\d{8}$/.test(local) ? `260${local}` : null;
}
