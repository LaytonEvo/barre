import type { Metadata } from 'next';
import { loadPolicy } from '@/lib/policy';
import { localSuffix, SITE } from '@/lib/seo/site';
import { EnquiryForm } from '@/components/site/enquiry-form';

export const metadata: Metadata = {
  title: `Contact — ${localSuffix}`,
  description: `Get in touch with Barre By Kelly about classes in ${SITE.town}, St Leonards and St Ives.`,
  alternates: { canonical: '/contact' },
};

export default async function ContactPage() {
  const policy = await loadPolicy();

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 md:px-8">
      <h1 className="text-[length:var(--text-4xl)]">Get in touch</h1>
      <p className="text-secondary mt-4 max-w-[60ch] text-lg">
        Questions about a class, an injury, or whether barre is right for you? Ask away — Kelly
        would rather you checked first.
      </p>

      {/* Contact details come from settings. Empty means not supplied yet, and
          the page hides the row rather than printing a placeholder. */}
      {policy.contact_email || policy.contact_phone ? (
        <div className="mt-8 grid gap-2">
          {policy.contact_email ? (
            <a href={`mailto:${policy.contact_email}`} className="text-link underline">
              {policy.contact_email}
            </a>
          ) : null}
          {policy.contact_phone ? (
            <a href={`tel:${policy.contact_phone}`} className="text-link underline">
              {policy.contact_phone}
            </a>
          ) : null}
        </div>
      ) : (
        <p className="text-muted mt-8 text-sm">
          Kelly&rsquo;s email and phone number will appear here shortly. In the meantime the form
          below reaches her, or message{' '}
          <a
            href={policy.facebook_url || 'https://www.facebook.com/barrebykelly'}
            className="text-link underline"
            rel="noreferrer noopener"
          >
            Barre By Kelly on Facebook
          </a>
          .
        </p>
      )}

      <div className="border-subtle mt-10 border-t pt-8">
        <EnquiryForm kind="contact" />
      </div>
    </div>
  );
}
