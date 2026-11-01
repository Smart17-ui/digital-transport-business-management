// Copies the shared TypeScript packages into supabase/functions/_shared so the
// Edge Functions bundle the same domain and server code the tests run.
// Run before `supabase functions serve` or `supabase functions deploy`.
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
for (const pkg of ['domain', 'server']) {
  const target = join(root, 'supabase/functions/_shared', pkg);
  rmSync(target, { recursive: true, force: true });
  cpSync(join(root, 'packages', pkg, 'src'), target, { recursive: true });
  console.log(`synced packages/${pkg}/src -> supabase/functions/_shared/${pkg}`);
}
