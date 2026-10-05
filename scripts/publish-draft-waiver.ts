/**
 * Publish the DRAFT waiver so the onboarding flow is usable in development.
 *
 *   npm run waiver:publish-draft
 *
 * ⚠️  DEVELOPMENT ONLY. The text in lib/onboarding/waiver-text.ts has not been
 *     reviewed against Kelly's insurance policy or by a legal professional, and
 *     it says so on its face. Publishing it in production would mean members
 *     signing an unreviewed agreement.
 *
 * It refuses to run against anything that does not look like a local database.
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { WAIVER_DRAFT_MARKDOWN, WAIVER_DRAFT_VERSION } from '../lib/onboarding/waiver-text';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1/.test(url);
if (!isLocal && process.env.ALLOW_DRAFT_WAIVER_PUBLISH !== 'yes-i-have-had-it-reviewed') {
  console.error(
    'Refusing to publish the DRAFT waiver to a non-local database.\n' +
      'This text has not been reviewed by a legal professional or checked against\n' +
      "Kelly's insurance policy. If it genuinely has been, set\n" +
      'ALLOW_DRAFT_WAIVER_PUBLISH=yes-i-have-had-it-reviewed',
  );
  process.exit(1);
}

async function main() {
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const hash = createHash('sha256').update(WAIVER_DRAFT_MARKDOWN, 'utf8').digest('hex');

  const { data: existing } = await supabase
    .from('waiver_versions')
    .select('id, body_sha256')
    .eq('version_label', WAIVER_DRAFT_VERSION)
    .maybeSingle();

  if (existing?.body_sha256 === hash) {
    console.warn(`${WAIVER_DRAFT_VERSION} is already published and unchanged.`);
    return;
  }

  await supabase.from('waiver_versions').update({ is_current: false }).eq('is_current', true);

  const { error } = await supabase.from('waiver_versions').insert({
    version_label: existing ? `${WAIVER_DRAFT_VERSION}-${Date.now()}` : WAIVER_DRAFT_VERSION,
    body_markdown: WAIVER_DRAFT_MARKDOWN,
    body_sha256: hash,
    is_current: true,
    published_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);

  console.warn(`Published ${WAIVER_DRAFT_VERSION}.`);
  console.warn('Remember: this is DRAFT text and must be reviewed before launch.');
}

main().catch((error) => {
  console.error('Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
