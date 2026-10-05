import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';
import { EMAIL_COLORS as C, EMAIL_FONT } from '@/lib/email/brand';

/**
 * The shell every email sits in.
 *
 * Tables and inline styles, because that is what email clients support — Outlook
 * in particular still lays out with tables. React Email's components compile to
 * exactly that, which is the reason for using it rather than writing JSX that
 * looks right in a browser and collapses in a mail client.
 *
 * `preview` is the line shown in the inbox list next to the subject. Left unset,
 * clients fill it with whatever text comes first, which is usually the word
 * "Hello" followed by boilerplate.
 */
export function EmailLayout({
  preview,
  heading,
  children,
  footerNote,
  unsubscribeUrl,
}: {
  preview: string;
  heading: string;
  children: ReactNode;
  footerNote?: string;
  unsubscribeUrl?: string;
}) {
  return (
    <Html lang="en-GB">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: C.background, fontFamily: EMAIL_FONT, margin: 0 }}>
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '32px 20px' }}>
          <Section
            style={{
              backgroundColor: C.mint,
              borderRadius: '12px 12px 0 0',
              padding: '20px 24px',
            }}
          >
            {/* Wordmark as text, not an image: images are blocked by default in
                most clients, and a brand that only appears after someone clicks
                "show images" is not a brand that appears. */}
            <Text
              style={{
                margin: 0,
                color: C.heading,
                fontSize: '18px',
                fontWeight: 700,
                letterSpacing: '0.01em',
              }}
            >
              Barre By Kelly
            </Text>
          </Section>

          <Section
            style={{
              backgroundColor: C.surface,
              border: `1px solid ${C.border}`,
              borderTop: 'none',
              borderRadius: '0 0 12px 12px',
              padding: '28px 24px',
            }}
          >
            <Text
              style={{
                margin: '0 0 16px',
                color: C.heading,
                fontSize: '22px',
                lineHeight: '1.3',
                fontWeight: 700,
              }}
            >
              {heading}
            </Text>

            {children}
          </Section>

          <Hr style={{ borderColor: C.border, margin: '24px 0 16px' }} />

          <Text style={{ margin: 0, color: C.muted, fontSize: '12px', lineHeight: '1.6' }}>
            {footerNote ? `${footerNote} ` : ''}
            Barre By Kelly, St Leonards &amp; St Ives Village Hall, near Ringwood.
          </Text>

          {unsubscribeUrl ? (
            <Text style={{ margin: '8px 0 0', color: C.muted, fontSize: '12px' }}>
              <Link href={unsubscribeUrl} style={{ color: C.muted }}>
                Unsubscribe from marketing emails
              </Link>
            </Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}

/** Body copy, so every template does not repeat the same inline style. */
export function P({ children }: { children: ReactNode }) {
  return (
    <Text style={{ margin: '0 0 14px', color: C.text, fontSize: '15px', lineHeight: '1.6' }}>
      {children}
    </Text>
  );
}

/** A primary action. `accent` is reserved for booking, matching the site. */
export function CTA({
  href,
  children,
  tone = 'primary',
}: {
  href: string;
  children: ReactNode;
  tone?: 'primary' | 'accent';
}) {
  return (
    <Section style={{ margin: '20px 0 8px' }}>
      <Link
        href={href}
        style={{
          backgroundColor: tone === 'accent' ? C.accent : C.primary,
          color: '#ffffff',
          borderRadius: '8px',
          display: 'inline-block',
          fontSize: '15px',
          fontWeight: 600,
          padding: '12px 22px',
          textDecoration: 'none',
        }}
      >
        {children}
      </Link>
    </Section>
  );
}

/** A box of facts: class, time, venue. */
export function Details({ rows }: { rows: [string, string][] }) {
  return (
    <Section
      style={{
        backgroundColor: C.background,
        border: `1px solid ${C.border}`,
        borderRadius: '8px',
        margin: '4px 0 18px',
        padding: '14px 16px',
      }}
    >
      {rows.map(([label, value]) => (
        <Text
          key={label}
          style={{ margin: '0 0 6px', color: C.text, fontSize: '14px', lineHeight: '1.5' }}
        >
          <span style={{ color: C.muted }}>{label}: </span>
          <strong>{value}</strong>
        </Text>
      ))}
    </Section>
  );
}
