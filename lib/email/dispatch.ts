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
