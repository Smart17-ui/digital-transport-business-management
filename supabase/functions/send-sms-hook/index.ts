// Supabase Auth "Send SMS" hook: delivers sign-in codes through Celcom Africa.
// Deploy with --no-verify-jwt; Auth calls it directly and it checks the
// webhook signature instead. Add a second provider to the list as a fallback.
import { CelcomSms, handleSendSmsHook, type SmsProvider } from '@dt/server';

const env = (name: string) => Deno.env.get(name) ?? '';

const providers: SmsProvider[] = [
  new CelcomSms({
    apiKey: env('CELCOM_API_KEY'),
    partnerId: env('CELCOM_PARTNER_ID'),
    senderId: env('CELCOM_SENDER_ID'),
  }),
];

Deno.serve(async (req) => {
  const result = await handleSendSmsHook(
    { secret: env('SEND_SMS_HOOK_SECRET'), headers: req.headers, body: await req.text() },
    providers,
  );
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
});
