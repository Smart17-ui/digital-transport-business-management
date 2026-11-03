# Digital Transport Business Management System

A mobile app for small and medium bus operators in Zambia to manage daily collections, expenses, settlements, maintenance and compliance. The design is in *Analysis and Design, Revision 3*; use case numbers (UC1 to UC47) below refer to it.

**Status: Version 0 (cash pilot), backend.** The shared domain package, the database schema and the Command API are built and tested. The Expo app is next.

## Layout

```
packages/
  domain/      Pure TypeScript business rules, shared by the app and the server.
               No React Native, Node or Deno imports; runs in all three.
  server/      Application services: the Command API, settlement service and
               notification chain. Depends only on a small `Db` interface.
  db-tests/    Runs the real migrations in PGlite (Postgres in WASM) to test
               RLS, append-only triggers and constraints without Docker.
supabase/
  migrations/  Schema, row level security, triggers, outbox.
  functions/   Thin Deno Edge Functions wrapping packages/server.
scripts/
  sync-shared.mjs  Copies packages/domain and packages/server into
                   supabase/functions/_shared before serving or deploying.
```

## The trust boundary

The phone captures intent; the server decides (design 8.1).

- Phones **read** through Postgres row level security as `authenticated` and hold no write rights on any table.
- Every **write** is a command (`packages/domain/src/commands.ts`) with a phone-generated `clientId`, sent to the `command` Edge Function. It validates the command, runs the domain rules and writes in one transaction.
- That transaction runs as the `command_api` role with `app.user_id` set, so RLS also confines the server's writes to the acting user's businesses. A missed membership check in a handler still cannot write into another business.
- Money tables are append-only (triggers reject `UPDATE`, `DELETE` and `TRUNCATE`). Confirmations, approvals, payment decisions and corrections are new rows.
- Domain events go to the `outbox` table in the same transaction and are delivered by a relay to subscribers (currently notifications).

## Money rules

- All money is whole **ngwee** (`bigint` in Postgres, safe integers in TypeScript). Kwacha appear only on screen.
- A settlement works out what the Owner should end the day holding (`ownerShare`, from the arrangement strategy) against what the Owner already holds from the day (handovers received, less costs the Owner paid). The difference is what the Driver owes, or is owed.
- **Arrears** are never stored as a running balance. They are derived from the latest statement of each earlier day less confirmed payments (`day_balances` view), so a correction to an old day flows through automatically.

## Developing

Requires Node 22+.

```sh
npm install
npm test            # domain, database and Command API tests
npm run typecheck
npm run check:functions   # Deno type check of the Edge Functions (via npx)
```

## Deploying to Supabase

1. Create a Supabase project. Choose the region only after the data-location question in Open points is answered.
2. Install the Supabase CLI and link the project: `npx supabase link --project-ref <ref>`.
3. Sync and deploy the functions, one command at a time. Each function has its own `deno.json`, which server-side bundling needs in order to find the shared code:
   ```sh
   npm run sync:functions
   npx supabase functions deploy command --use-api
   npx supabase functions deploy outbox-relay --no-verify-jwt --use-api
   npx supabase secrets set RELAY_SECRET=<random> EXPO_ACCESS_TOKEN=<optional>
   ```
4. Apply migrations: `npx supabase db push --remote`. Deploy functions first when a migration tightens what they may write.
5. Enable phone sign-in (Authentication → Providers → Phone) and set OTP rate limits. Codes are sent through Celcom Africa by the `send-sms-hook` function (below), so no Twilio details are needed.

### Sign-in codes by SMS (Celcom Africa)

Supabase Auth generates each code and calls `send-sms-hook`, which checks the webhook signature, accepts only Zambian mobile numbers (`260` then 9 digits starting 7 or 9) and sends through Celcom's OTP endpoint. The code is never logged. Providers are tried in order, so a second gateway can be added to the list in `supabase/functions/send-sms-hook/index.ts` as a fallback.

1. Deploy: `npm run sync:functions && npx supabase functions deploy send-sms-hook --no-verify-jwt --use-api`.
2. In the dashboard, open Authentication → Hooks → Send SMS hook, choose HTTPS, set the URL to `https://<project-ref>.supabase.co/functions/v1/send-sms-hook` and generate a secret.
3. Set the secrets:
   ```sh
   npx supabase secrets set SEND_SMS_HOOK_SECRET="v1,whsec_..." CELCOM_API_KEY=... CELCOM_PARTNER_ID=... CELCOM_SENDER_ID=...
   ```
4. Test with real numbers on MTN, Airtel and Zamtel (Supabase test numbers skip the hook). `npx supabase functions logs send-sms-hook` shows each send or Celcom's error, for example `1001` (sender ID not approved) or `1004` (low credits).

### Scheduling the relay

The `command` function delivers notifications right after each request. A scheduled run of `outbox-relay` catches anything missed. Enable `pg_cron` and `pg_net`, store the secret in Vault, then:

```sql
select cron.schedule('outbox-relay', '* * * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/outbox-relay',
    headers := jsonb_build_object('x-relay-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'relay_secret'))
  )
$$);
```

## Assumptions to confirm with pilot owners

These are isolated so that changing one touches one class or one row of data:

- **Arrangement maths** (`packages/domain/src/arrangement/strategies.ts`): fixed target and rent-to-own owe a fixed daily amount to the Owner; salary owes a fixed daily amount to the Driver; revenue share splits gross takings by percentage. In all four, each side then bears its own costs.
- **Off-road days**: no fixed amount applies, including salary pay. A vehicle off-road at any moment of a day has no target that day.
- **Who confirms takings**: the Driver records takings for the Conductor, so the Owner confirms them.
- **Late entries**: an entry that arrives after its day closed is accepted, counted and flagged `late`.
- **Payments**: only one unconfirmed payment claim per day at a time; a claim cannot exceed what is owed.
- **Bemba and Nyanja**: the app accepts `bem` and `nya` as languages, but notification text is English only until a native speaker writes those catalogues (`packages/server/src/messages.ts`).

## Not yet built in Version 0

- The Expo app: screens, the SQLite offline queue, the provisional ledger and push registration.
- UC23 document expiry dates (Version 0 scope is expiry dates only).
- Telling the Owner when a removed member's queued commands are refused (UC9 5d). They are refused, but no one is notified yet.
- A second SMS provider as a fallback to Celcom.
- "Sign out all other devices" (UC45 1a), which uses the Supabase Auth admin API.
