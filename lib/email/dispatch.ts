import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/database.types';
import { clientEnv } from '@/lib/env';
import { emailFrom, isEmailConfigured, resend } from '@/lib/email/client';
import { isMarketing, renderTemplate } from '@/lib/email/registry';
import { unsubscribeUrl } from '@/lib/email/links';

type Db = SupabaseClient<Database>;

export type DispatchOutcome = {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
};

/**
 * Drain the email queue.
 *
 * Extracted from the route so it can be reasoned about and tested on its own. The
 * route's job is authentication; this is the part with the rules.
 *
 * Order matters. Consent is checked BEFORE rendering, and rendering before
 * sending, so the expensive and the irreversible steps only happen for rows that
 * are definitely going out.
 */

/**
 * Domains that can never receive mail.
 *
 * RFC 2606 and RFC 6761 reserve these so they can be used in tests and examples
 * without ever resolving. Sending to one is not a slow failure — it is a hard
 * bounce, and hard bounces are the single most damaging thing for a young
 * sending domain's reputation. Twenty-one of them went out from here before this
 * existed, because seeding demo accounts queued a welcome for each and the
 * dispatcher reached them first.
 */
// RFC 2606 reserves both forms: the four TLDs, and example.com/net/org at the
// second level. Matching only the TLDs lets example.com through, which is the
// address people actually reach for when inventing one.
const UNDELIVERABLE_DOMAIN = /\.(test|invalid|example|localhost)$|(^|\.)example\.(com|net|org)$/i;

/**
 * Where a reply should go.
 *
 * The From address is the sending domain, and a sending domain does not
 * necessarily have a mailbox behind it — ours did not for most of its life. A
 * member answering a booking confirmation with "sorry, can I move to Thursday?"
 * would then get a bounce, having done the most reasonable thing possible.
 *
 * `contact_email` is the address already published on the contact page, so it
 * is the one Kelly is expecting to hear on, and she can change it in
 * /admin/settings without a deploy.
 *
 * Read directly rather than through loadPolicy(): that uses the request-scoped
 * client this has no access to, and throws when any setting is malformed, which
 * would stop the entire queue over an unrelated key.
 */
async function replyToAddress(db: Db): Promise<string | null> {
  const { data } = await db
    .from('settings')
    .select('value')
    .eq('key', 'contact_email')
    .maybeSingle();

  const value = data?.value;
  return typeof value === 'string' && value.includes('@') ? value : null;
}

export async function dispatchEmails(db: Db, batchSize = 25): Promise<DispatchOutcome> {
  const outcome: DispatchOutcome = { claimed: 0, sent: 0, skipped: 0, failed: 0 };

  if (!isEmailConfigured()) return outcome;

  // Recover anything a previous run abandoned mid-flight before claiming more.
  await db.rpc('release_stranded_notifications');

  const { data: rows, error } = await db.rpc('claim_notifications', {
    p_limit: batchSize,
    p_channel: 'email',
  });

  if (error || !rows) return outcome;
  outcome.claimed = rows.length;

  const siteUrl = clientEnv.NEXT_PUBLIC_SITE_URL;
  const replyTo = await replyToAddress(db);

  for (const row of rows) {
    const skip = async (reason: string) => {
      await db.rpc('skip_notification', { p_id: row.id, p_reason: reason });
      outcome.skipped += 1;
    };
    const fail = async (reason: string) => {
      await db.rpc('settle_notification', { p_id: row.id, p_sent: false, p_error: reason });
      outcome.failed += 1;
    };

    // --- Consent and suppression --------------------------------------------
    const marketing = isMarketing(row.template);
    let unsubscribe: string | null = null;

    if (row.user_id) {
      const { data: profile } = await db
        .from('profiles')
        .select('email, first_name, marketing_consent, anonymised_at')
        .eq('id', row.user_id)
        .maybeSingle();

      if (!profile) {
        await skip('no profile — member deleted since this was queued');
        continue;
      }

      // An erased member must not be emailed, whatever is in the queue. This is
      // the backstop; erasure also deletes unsent rows.
      if (profile.anonymised_at) {
        await skip('member has been erased');
        continue;
      }

      if (marketing) {
        if (!profile.marketing_consent) {
          await skip('no marketing consent');
          continue;
        }

        unsubscribe = unsubscribeUrl(row.user_id, siteUrl);
        if (!unsubscribe) {
          // Refusing rather than sending without a working opt-out: under PECR a
          // marketing email must carry one, so a missing signing secret has to
          // mean no marketing, not marketing with a dead link.
          await skip('no EMAIL_LINK_SECRET configured, so no valid unsubscribe link');
          continue;
        }
      }
    } else if (marketing) {
      // Marketing to an address with no account behind it: there is nobody whose
      // consent could have been recorded.
      await skip('marketing email with no member attached');
      continue;
    }

    const to = row.to_email;
    if (!to) {
      await fail('no email address');
      continue;
    }

    // Skipped rather than failed: there is nothing wrong with the row, and a
    // failure would retry it, which is three bounces instead of one.
    if (UNDELIVERABLE_DOMAIN.test(to.split('@')[1] ?? '')) {
      await skip('reserved domain that can never receive mail');
      continue;
    }

    // --- Render --------------------------------------------------------------
    const payload = {
      ...(row.payload as Record<string, unknown>),
      siteUrl,
      ...(unsubscribe ? { unsubscribeUrl: unsubscribe } : {}),
    };

    const rendered = await renderTemplate(row.template, payload);
    if (!rendered.ok) {
      await fail(rendered.error);
      continue;
    }

    // --- Send ----------------------------------------------------------------
    try {
      const result = await resend().emails.send({
        from: emailFrom(),
        to,
        subject: rendered.email.subject,
        html: rendered.email.html,
        text: rendered.email.text,
        ...(replyTo ? { replyTo } : {}),
        ...(unsubscribe
          ? {
              // One-click unsubscribe. Gmail and Outlook surface this as a button
              // next to the sender, and honouring it is what keeps a small
              // sender's domain out of the spam folder.
              headers: {
                'List-Unsubscribe': `<${unsubscribe}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            }
          : {}),
      });

      if (result.error) {
        await fail(result.error.message ?? 'provider rejected the send');
        continue;
      }

      await db.rpc('settle_notification', {
        p_id: row.id,
        p_sent: true,
        p_message_id: result.data?.id ?? null,
      });
      outcome.sent += 1;
    } catch (error) {
      await fail(error instanceof Error ? error.message : 'send threw');
    }
  }

  return outcome;
}
