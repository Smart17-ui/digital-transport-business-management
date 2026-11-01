import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CelcomSms, handleSendSmsHook, SmsError, zambianMsisdn, type SmsProvider } from '../src/sms.ts';

const KEY = Buffer.from('test-hook-key-0123456789').toString('base64');
const SECRET = `v1,whsec_${KEY}`;

function signed(payload: unknown, secret = KEY, timestamp = Math.floor(Date.now() / 1000)) {
  const body = JSON.stringify(payload);
  const id = 'msg_1';
  const signature = createHmac('sha256', Buffer.from(secret, 'base64')).update(`${id}.${timestamp}.${body}`).digest('base64');
  return { secret: SECRET, headers: new Headers({ 'webhook-id': id, 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${signature}` }), body };
}

const payload = { user: { phone: '260971234567' }, sms: { otp: '483920' } };

function recorder(name = 'fake', fail = false) {
  const sent: { msisdn: string; text: string }[] = [];
  const provider: SmsProvider = {
    name,
    async send(msisdn, text) {
      if (fail) throw new SmsError(name, '1004', 'low bulk credits');
      sent.push({ msisdn, text });
    },
  };
  return { provider, sent };
}

function celcomReplying(status: number, body: unknown) {
  const calls: { url: string; body: Record<string, string> }[] = [];
  const sms = new CelcomSms({
    apiKey: 'key',
    partnerId: '42',
    senderId: 'DIGITRANS',
    fetch: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: status < 400, status, text: async () => JSON.stringify(body) };
    },
  });
  return { sms, calls };
}

describe('zambianMsisdn', () => {
  it('accepts Zambian mobile numbers in common forms', () => {
    expect(zambianMsisdn('260971234567')).toBe('260971234567');
    expect(zambianMsisdn('+260 97 123 4567')).toBe('260971234567');
    expect(zambianMsisdn('0761234567')).toBe('260761234567');
  });

  it('rejects other countries and malformed numbers', () => {
    expect(zambianMsisdn('254712345678')).toBeNull();
    expect(zambianMsisdn('26097123456')).toBeNull();
    expect(zambianMsisdn('260211123456')).toBeNull();
  });
});

describe('send SMS hook', () => {
  it('sends the code to the normalised number and never logs it', async () => {
    const { provider, sent } = recorder();
    const logs: string[] = [];
    const result = await handleSendSmsHook(signed(payload), [provider], (line) => logs.push(line));
    expect(result).toEqual({ status: 200, body: {} });
    expect(sent).toEqual([{ msisdn: '260971234567', text: expect.stringContaining('483920') }]);
    expect(logs.join('\n')).not.toContain('483920');
    expect(logs.join('\n')).not.toContain('260971234567');
  });

  it('refuses requests not signed by Supabase Auth', async () => {
    const { provider, sent } = recorder();
    const forged = signed(payload, Buffer.from('some-other-key').toString('base64'));
    expect((await handleSendSmsHook(forged, [provider], () => {})).status).toBe(401);
    const stale = signed(payload, KEY, Math.floor(Date.now() / 1000) - 600);
    expect((await handleSendSmsHook(stale, [provider], () => {})).status).toBe(401);
    expect(sent).toEqual([]);
  });

  it('refuses numbers outside Zambia without sending', async () => {
    const { provider, sent } = recorder();
    const result = await handleSendSmsHook(signed({ ...payload, user: { phone: '254712345678' } }), [provider], () => {});
    expect(result.status).toBe(400);
    expect(sent).toEqual([]);
  });

  it('falls back to the next provider, and reports failure when all fail', async () => {
    const backup = recorder('backup');
    const result = await handleSendSmsHook(signed(payload), [recorder('primary', true).provider, backup.provider], () => {});
    expect(result.status).toBe(200);
    expect(backup.sent).toHaveLength(1);

    const failed = await handleSendSmsHook(signed(payload), [recorder('primary', true).provider], () => {});
    expect(failed.status).toBe(502);
    expect(failed.body).toEqual({ error: { http_code: 502, message: expect.any(String) } });
  });
});

describe('Celcom adapter', () => {
  it('posts to the OTP endpoint with the documented field names', async () => {
    const { sms, calls } = celcomReplying(200, { responses: [{ 'respose-code': 200, 'response-description': 'Success' }] });
    await sms.send('260971234567', 'hello');
    expect(calls).toEqual([
      {
        url: 'https://isms.celcomafrica.com/api/services/sendotp/',
        body: { apikey: 'key', partnerID: '42', shortcode: 'DIGITRANS', mobile: '260971234567', message: 'hello' },
      },
    ]);
  });

  it('turns Celcom error codes into readable failures', async () => {
    const { sms } = celcomReplying(200, { responses: [{ 'response-code': 1001, 'response-description': 'Invalid sender id' }] });
    await expect(sms.send('260971234567', 'hello')).rejects.toThrow('Celcom 1001: invalid sender ID');
    const down = celcomReplying(503, 'unavailable');
    await expect(down.sms.send('260971234567', 'hello')).rejects.toThrow('HTTP 503');
  });
});
