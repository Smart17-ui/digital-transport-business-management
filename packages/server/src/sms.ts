/**
 * Supabase Auth "Send SMS" hook: Auth generates the one-time code and posts it
 * here; we verify the request came from Auth and send the code by SMS.
 * Runs in Node (tests) and Deno (Edge Function), so it uses only Web APIs.
 */

/** Strategy: one SMS gateway. Throws SmsError when a send fails. */
export interface SmsProvider {
  readonly name: string;
  send(msisdn: string, text: string): Promise<void>;
}

export class SmsError extends Error {
  constructor(
    readonly provider: string,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export interface CelcomConfig {
  apiKey: string;
  partnerId: string;
  senderId: string;
  url?: string;
  fetch?: Fetch;
}

const CELCOM_ERRORS: Record<string, string> = {
  '1001': 'invalid sender ID',
  '1002': 'network not allowed',
  '1003': 'invalid mobile number',
  '1004': 'low bulk credits',
  '1005': 'system error',
  '1006': 'invalid credentials',
  '1007': 'system error',
  '4090': 'internal error, retry after 5 minutes',
  '4091': 'no partner ID set',
  '4092': 'no API key provided',
  '4093': 'details not found',
};

/** Adapter: Celcom Africa's dedicated OTP endpoint (celcomafrica.com/developers). */
export class CelcomSms implements SmsProvider {
  readonly name = 'celcom';
  constructor(private readonly config: CelcomConfig) {}

  async send(msisdn: string, text: string): Promise<void> {
    const { apiKey, partnerId, senderId } = this.config;
    const doFetch = this.config.fetch ?? (globalThis.fetch as unknown as Fetch);
    const res = await doFetch(this.config.url ?? 'https://isms.celcomafrica.com/api/services/sendotp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: apiKey, partnerID: partnerId, shortcode: senderId, mobile: msisdn, message: text }),
    });
    const raw = await res.text();
    if (!res.ok) throw new SmsError(this.name, `http_${res.status}`, `HTTP ${res.status}: ${raw.slice(0, 200)}`);

    let first: Record<string, unknown> | undefined;
    try {
      const body = JSON.parse(raw) as { responses?: Record<string, unknown>[] } & Record<string, unknown>;
      first = body.responses?.[0] ?? body;
    } catch {
      throw new SmsError(this.name, 'bad_response', `unreadable response: ${raw.slice(0, 200)}`);
    }
    // Celcom's documented sample spells the key "respose-code"; accept both.
    const code = String(first['response-code'] ?? first['respose-code'] ?? '');
    if (code !== '200') {
      const reason = CELCOM_ERRORS[code] ?? String(first['response-description'] ?? 'unknown error');
      throw new SmsError(this.name, code || 'unknown', `Celcom ${code}: ${reason}`);
    }
  }
}

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

export function otpMessage(otp: string): string {
  return `Your Digital Transport Business Management System code is ${otp}. Do not share it with anyone.`;
}

const TOLERANCE_SECONDS = 5 * 60;

function base64Bytes(value: string): ArrayBuffer {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0)).buffer as ArrayBuffer;
}

/**
 * Verifies a Standard Webhooks signature, as Supabase Auth hooks use.
 * `secret` is the dashboard value, "v1,whsec_<base64>".
 */
export async function verifyWebhook(
  secret: string,
  headers: { get(name: string): string | null },
  body: string,
  now = Date.now(),
): Promise<boolean> {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatures = headers.get('webhook-signature');
  if (!id || !timestamp || !signatures) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    base64Bytes(secret.replace(/^v1,/, '').replace(/^whsec_/, '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  for (const entry of signatures.split(' ')) {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) continue;
    try {
      if (await crypto.subtle.verify('HMAC', key, base64Bytes(signature), signed)) return true;
    } catch {
      // Not valid base64; try the next signature.
    }
  }
  return false;
}

export interface HookResult {
  status: number;
  body: Record<string, unknown>;
}

const hookError = (status: number, message: string): HookResult => ({
  status,
  body: { error: { http_code: status, message } },
});

/**
 * Handles one hook call. Providers are tried in order, so a second gateway can
 * take over when the first fails. The code itself is never logged.
 */
export async function handleSendSmsHook(
  request: { secret: string; headers: { get(name: string): string | null }; body: string },
  providers: readonly SmsProvider[],
  log: (line: string) => void = console.log,
): Promise<HookResult> {
  if (!(await verifyWebhook(request.secret, request.headers, request.body))) {
    return hookError(401, 'Invalid signature.');
  }

  let phone: string | undefined;
  let otp: string | undefined;
  try {
    const payload = JSON.parse(request.body) as { user?: { phone?: string }; sms?: { otp?: string } };
    phone = payload.user?.phone;
    otp = payload.sms?.otp;
  } catch {
    // Falls through to the check below.
  }
  if (!phone || !otp) return hookError(400, 'Missing phone number or code.');

  const msisdn = zambianMsisdn(phone);
  if (!msisdn) return hookError(400, 'Enter a Zambian mobile number.');

  const masked = `${msisdn.slice(0, 6)}***${msisdn.slice(-2)}`;
  for (const provider of providers) {
    try {
      await provider.send(msisdn, otpMessage(otp));
      log(`sms sent to ${masked} via ${provider.name}`);
      return { status: 200, body: {} };
    } catch (error) {
      log(`sms to ${masked} failed via ${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return hookError(502, 'We could not send your code. Please try again in a few minutes.');
}
