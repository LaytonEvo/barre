import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The dispatcher is the last thing between the queue and somebody's inbox, and the
 * decision it makes that matters most is whether to send marketing to a member who
 * has not consented. That is worth testing directly rather than inferring from the
 * SQL, because the SQL and this both have to agree.
 *
 * Resend is mocked: the point is which rows it is asked to send, not the HTTP call.
 */
const sent: {
  to: string;
  subject: string;
  headers?: Record<string, string>;
  replyTo?: string | string[];
}[] = [];
let sendResult: { error: { message: string } | null } = { error: null };

/**
 * The working email client. A function declaration so it is hoisted alongside
 * vi.mock, and named so beforeEach can put it back: one test below replaces this
 * with vi.doMock, which persists for the rest of the file.
 */
function clientMock() {
  return {
    isEmailConfigured: () => true,
    emailFrom: () => 'Barre By Kelly <hello@test>',
    resend: () => ({
      emails: {
        send: async (args: {
          to: string;
          subject: string;
          headers?: Record<string, string>;
          replyTo?: string | string[];
        }) => {
          if (sendResult.error) return { error: sendResult.error, data: null };
          sent.push({
            to: args.to,
            subject: args.subject,
            headers: args.headers,
            replyTo: args.replyTo,
          });
          return { error: null, data: { id: 'msg_test' } };
        },
      },
    }),
  };
}

vi.mock('@/lib/email/client', clientMock);

type Row = {
  id: string;
  user_id: string | null;
  to_email: string | null;
  template: string;
  payload: Record<string, unknown>;
};

type Profile = {
  email: string;
  first_name: string | null;
  marketing_consent: boolean;
  anonymised_at: string | null;
};

/** Settled outcomes, keyed by row id, so assertions read as intent. */
const settled: Record<string, { kind: 'sent' | 'failed' | 'skipped'; reason?: string }> = {};

function fakeDb(
  rows: Row[],
  profiles: Record<string, Profile>,
  settings: Record<string, unknown> = {},
) {
  let claimed = false;

  return {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      if (name === 'release_stranded_notifications') return { data: 0, error: null };
      if (name === 'claim_notifications') {
        if (claimed) return { data: [], error: null };
        claimed = true;
        return { data: rows, error: null };
      }
      if (name === 'settle_notification') {
        settled[args!.p_id as string] = {
          kind: args!.p_sent ? 'sent' : 'failed',
          reason: args!.p_error as string | undefined,
        };
        return { data: null, error: null };
      }
      if (name === 'skip_notification') {
        settled[args!.p_id as string] = {
          kind: 'skipped',
          reason: args!.p_reason as string,
        };
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, value: string) => ({
          maybeSingle: async () =>
            table === 'settings'
              ? { data: value in settings ? { value: settings[value] } : null, error: null }
              : { data: profiles[value] ?? null, error: null },
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const SITE = 'https://barre.test';
const MEMBER = '11111111-1111-4111-8111-111111111111';

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: `n-${Math.random().toString(36).slice(2, 8)}`,
    user_id: MEMBER,
    to_email: 'jo@example.com',
    template: 'welcome',
    payload: {},
    ...overrides,
  };
}

const consenting: Profile = {
  email: 'jo@example.com',
  first_name: 'Jo',
  marketing_consent: true,
  anonymised_at: null,
};

let dispatchEmails: typeof import('@/lib/email/dispatch').dispatchEmails;

beforeEach(async () => {
  sent.length = 0;
  for (const key of Object.keys(settled)) delete settled[key];
  sendResult = { error: null };

  process.env.NEXT_PUBLIC_SITE_URL = SITE;
  process.env.EMAIL_LINK_SECRET = 'test-secret';

  // Put the working client back before re-importing. A test below swaps it for
  // an unconfigured one with vi.doMock, which persists for the rest of the file,
  // so without this every test written after it silently inherits a client that
  // refuses to send and fails for a reason nothing in it explains.
  vi.doMock('@/lib/email/client', clientMock);
  vi.resetModules();
  ({ dispatchEmails } = await import('@/lib/email/dispatch'));
});

describe('transactional email', () => {
  it('sends a welcome email and settles the row as sent', async () => {
    const r = row();
    const outcome = await dispatchEmails(fakeDb([r], { [MEMBER]: consenting }));

    expect(outcome.sent).toBe(1);
    expect(sent[0]?.to).toBe('jo@example.com');
    expect(settled[r.id]?.kind).toBe('sent');
  });

  it('sends it even to a member with no marketing consent', async () => {
    // A booking confirmation is not marketing. Requiring consent for one would
    // mean not sending it.
    const r = row({ template: 'booking_confirmed' });
    const payload = {
      className: 'Barre',
      when: 'Monday, 18:30',
      venueName: 'Village Hall',
      cancellationHours: 24,
    };
    const outcome = await dispatchEmails(
      fakeDb([{ ...r, payload }], {
        [MEMBER]: { ...consenting, marketing_consent: false },
      }),
    );

    expect(outcome.sent).toBe(1);
  });

  it('adds no unsubscribe header to transactional email', async () => {
    await dispatchEmails(fakeDb([row()], { [MEMBER]: consenting }));
    expect(sent[0]?.headers).toBeUndefined();
  });
});

describe('marketing email and consent', () => {
  const winBack = () =>
    row({ template: 'win_back', payload: { weeksAway: 6, creditsLeft: 1, firstName: 'Jo' } });

  it('sends a win-back to a member who consented', async () => {
    const r = winBack();
    const outcome = await dispatchEmails(fakeDb([r], { [MEMBER]: consenting }));

    expect(outcome.sent).toBe(1);
    expect(settled[r.id]?.kind).toBe('sent');
  });

  it('SKIPS a win-back to a member who did not consent, and says why', async () => {
    // The assertion this whole file exists for.
    const r = winBack();
    const outcome = await dispatchEmails(
      fakeDb([r], { [MEMBER]: { ...consenting, marketing_consent: false } }),
    );

    expect(outcome.sent).toBe(0);
    expect(outcome.skipped).toBe(1);
    expect(sent).toHaveLength(0);
    expect(settled[r.id]).toEqual({ kind: 'skipped', reason: 'no marketing consent' });
  });

  it('adds List-Unsubscribe headers so Gmail shows a one-click button', async () => {
    await dispatchEmails(fakeDb([winBack()], { [MEMBER]: consenting }));

    expect(sent[0]?.headers?.['List-Unsubscribe']).toContain('/unsubscribe');
    expect(sent[0]?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('skips marketing entirely when there is no link-signing secret', async () => {
    // Under PECR a marketing email needs a working opt-out, so "no secret" has to
    // mean "no marketing", not "marketing with a dead link".
    process.env.EMAIL_LINK_SECRET = '';
    vi.resetModules();
    ({ dispatchEmails } = await import('@/lib/email/dispatch'));

    const r = winBack();
    const outcome = await dispatchEmails(fakeDb([r], { [MEMBER]: consenting }));

    expect(outcome.skipped).toBe(1);
    expect(sent).toHaveLength(0);
    expect(settled[r.id]?.reason).toContain('EMAIL_LINK_SECRET');
  });

  it('skips marketing addressed to an address with no member behind it', async () => {
    // Nobody whose consent could have been recorded.
    const r = row({
      user_id: null,
      template: 'win_back',
      payload: { weeksAway: 6, creditsLeft: 0 },
    });
    const outcome = await dispatchEmails(fakeDb([r], {}));

    expect(outcome.skipped).toBe(1);
    expect(settled[r.id]?.reason).toContain('no member attached');
  });

  it('still sends a gift voucher to a recipient with no account', async () => {
    // Not marketing: the purchaser gave us this address for this one delivery.
    const r = row({
      user_id: null,
      to_email: 'sam@example.com',
      template: 'voucher_gift',
      payload: {
        code: 'BARRE-ACDE-FGHJ',
        description: 'six classes',
        expiresAt: '31 December 2027',
      },
    });
    const outcome = await dispatchEmails(fakeDb([r], {}));

    expect(outcome.sent).toBe(1);
    expect(sent[0]?.to).toBe('sam@example.com');
  });
});

describe('suppression', () => {
  it('never emails an erased member, whatever is still queued', async () => {
    const r = row();
    const outcome = await dispatchEmails(
      fakeDb([r], { [MEMBER]: { ...consenting, anonymised_at: '2026-01-01T00:00:00Z' } }),
    );

    expect(sent).toHaveLength(0);
    expect(settled[r.id]?.reason).toContain('erased');
    expect(outcome.skipped).toBe(1);
  });

  it('skips a row whose member has been deleted since it was queued', async () => {
    const r = row();
    const outcome = await dispatchEmails(fakeDb([r], {}));

    expect(outcome.skipped).toBe(1);
    expect(settled[r.id]?.reason).toContain('no profile');
  });
});

describe('failures', () => {
  it('fails a row whose payload the template cannot render, naming the field', async () => {
    const r = row({ template: 'booking_confirmed', payload: { className: 'Barre' } });
    const outcome = await dispatchEmails(fakeDb([r], { [MEMBER]: consenting }));

    expect(outcome.failed).toBe(1);
    expect(sent).toHaveLength(0);
    expect(settled[r.id]?.reason).toContain('when');
  });

  it('fails an unknown template rather than silently sending nothing', async () => {
    const r = row({ template: 'no_such_template' });
    const outcome = await dispatchEmails(fakeDb([r], { [MEMBER]: consenting }));

    expect(outcome.failed).toBe(1);
    expect(settled[r.id]?.reason).toContain('no_such_template');
  });

  it('fails a row with no address', async () => {
    const r = row({ to_email: null });
    const outcome = await dispatchEmails(fakeDb([r], { [MEMBER]: consenting }));

    expect(outcome.failed).toBe(1);
    expect(settled[r.id]?.reason).toContain('no email address');
  });

  it('records the provider’s reason when the send is rejected', async () => {
    sendResult = { error: { message: 'domain not verified' } };
    const r = row();
    const outcome = await dispatchEmails(fakeDb([r], { [MEMBER]: consenting }));

    expect(outcome.failed).toBe(1);
    expect(settled[r.id]?.reason).toBe('domain not verified');
  });

  it('one bad row does not abandon the rest of the batch', async () => {
    const bad = row({ template: 'no_such_template' });
    const good = row();
    const outcome = await dispatchEmails(fakeDb([bad, good], { [MEMBER]: consenting }));

    expect(outcome.failed).toBe(1);
    expect(outcome.sent).toBe(1);
  });
});

describe('when email is not configured', () => {
  it('claims nothing, so the queue is left intact for when it is', async () => {
    vi.resetModules();
    vi.doMock('@/lib/email/client', () => ({
      isEmailConfigured: () => false,
      emailFrom: () => '',
      resend: () => {
        throw new Error('should not be called');
      },
    }));
    const { dispatchEmails: dispatch } = await import('@/lib/email/dispatch');

    const outcome = await dispatch(fakeDb([row()], { [MEMBER]: consenting }));
    expect(outcome).toEqual({ claimed: 0, sent: 0, skipped: 0, failed: 0 });
  });
});

describe('reply-to', () => {
  /**
   * The From address is the sending domain, which need not have a mailbox behind
   * it. Without a Reply-To, a member answering a booking confirmation gets a
   * bounce for doing the obvious thing.
   */
  it('replies go to the published contact address', async () => {
    const db = fakeDb(
      [row({ template: 'welcome' })],
      { [MEMBER]: consenting },
      {
        contact_email: 'kelly@example.com',
      },
    );

    await dispatchEmails(db);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.replyTo).toBe('kelly@example.com');
  });

  it('omits reply-to rather than inventing one when the setting is unset', async () => {
    const db = fakeDb([row({ template: 'welcome' })], { [MEMBER]: consenting });

    await dispatchEmails(db);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.replyTo).toBeUndefined();
  });

  it('ignores a setting that is not an address, so a typo cannot break every send', async () => {
    const db = fakeDb(
      [row({ template: 'welcome' })],
      { [MEMBER]: consenting },
      {
        contact_email: 'TODO',
      },
    );

    await dispatchEmails(db);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.replyTo).toBeUndefined();
  });
});
