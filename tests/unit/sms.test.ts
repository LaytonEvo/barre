import { describe, expect, it } from 'vitest';
import { SMS_TEMPLATES, toE164 } from '@/lib/sms/send';

/**
 * Members type phone numbers however they like, and an unparsed one either fails
 * silently at Twilio or texts the wrong person. Both cost money.
 */
describe('toE164', () => {
  it('accepts the way a UK mobile is normally written', () => {
    expect(toE164('07700 900123')).toBe('+447700900123');
    expect(toE164('07700900123')).toBe('+447700900123');
  });

  it('accepts international forms', () => {
    expect(toE164('+44 7700 900123')).toBe('+447700900123');
    expect(toE164('0044 7700 900123')).toBe('+447700900123');
    expect(toE164('447700900123')).toBe('+447700900123');
  });

  it('strips brackets, dashes and dots', () => {
    expect(toE164('(07700) 900-123')).toBe('+447700900123');
    expect(toE164('07700.900.123')).toBe('+447700900123');
  });

  it('refuses a landline rather than texting it', () => {
    // A text to a landline fails at the carrier, silently, and is still billed.
    expect(toE164('01425 123456')).toBeNull();
    expect(toE164('020 7946 0958')).toBeNull();
  });

  it('refuses a number that is the wrong length', () => {
    expect(toE164('0770090012')).toBeNull();
    expect(toE164('077009001234')).toBeNull();
  });

  it('refuses nonsense and empty input', () => {
    expect(toE164('')).toBeNull();
    expect(toE164('not a number')).toBeNull();
    expect(toE164('+1 555 0100')).toBeNull();
  });
});

describe('SMS bodies', () => {
  it('fit in a single 160-character segment, because each one costs money', () => {
    const long = 'Barre Foundations Express';
    const when = 'Monday 12 October, 18:30';

    for (const [name, build] of Object.entries(SMS_TEMPLATES)) {
      const body = build(long, when);
      expect(body.length, `${name} is ${body.length} chars`).toBeLessThanOrEqual(160);
    }
  });

  it('names the sender, since the number will be unknown to the member', () => {
    for (const build of Object.values(SMS_TEMPLATES)) {
      expect(build('Barre', '18:30')).toContain('Barre By Kelly');
    }
  });

  it('uses only GSM-7 characters, so one message stays one segment', () => {
    // A single curly apostrophe or en dash switches the whole message to UCS-2,
    // which halves the per-segment limit to 70 characters and doubles the cost.
    for (const [name, build] of Object.entries(SMS_TEMPLATES)) {
      const body = build('Barre', '18:30');
      expect(body, name).not.toMatch(/[^\x00-\x7F]/);
    }
  });
});
