import type { Metadata } from 'next';
import Link from 'next/link';
import { listFaqs } from '@/lib/queries/catalogue';
import { bookingWindowText, cancellationPolicyText, loadPolicy } from '@/lib/policy';
import { FaqJsonLd } from '@/lib/seo/json-ld';
import { localSuffix } from '@/lib/seo/site';

export const metadata: Metadata = {
  title: `FAQs — ${localSuffix}`,
  description:
    'Booking, cancellations, class packs, and what to expect at a barre class. The answers about booking are generated from the live policy settings.',
  alternates: { canonical: '/faq' },
};

export default async function FaqPage() {
  const [stored, policy] = await Promise.all([listFaqs(), loadPolicy()]);

  /**
   * Policy answers are generated rather than stored, so they cannot fall out of
   * step with what the booking engine enforces. Editable content comes from the
   * database; anything with a number in it comes from settings.
   */
  const generated = [
    {
      id: 'generated-booking-window',
      question: 'How far ahead can I book?',
      answer: bookingWindowText(policy),
      category: 'booking',
    },
    {
      id: 'generated-cancellation',
      question: 'What happens if I need to cancel?',
      answer: cancellationPolicyText(policy).slice(0, 2).join(' '),
      category: 'booking',
    },
    {
      id: 'generated-waitlist',
      question: 'The class I want is full. What now?',
      answer: cancellationPolicyText(policy).find((p) => p.includes('waitlist')) ?? '',
      category: 'booking',
    },
    {
      id: 'generated-first-class',
      question: 'Is the first class really free?',
      answer:
        'Yes — one free class per person, with no card needed. After that you can pay per class or buy a pack.',
      category: 'booking',
    },
  ].filter((faq) => faq.answer.length > 0);

  const all = [...generated, ...stored];

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:px-8">
      <FaqJsonLd faqs={all} />

      <h1 className="text-[length:var(--text-4xl)]">Frequently asked questions</h1>
      <p className="text-secondary mt-4 max-w-[60ch] text-lg">
        If your question is not here,{' '}
        <Link href="/contact" className="text-link underline">
          ask Kelly
        </Link>
        .
      </p>

      <dl className="mt-12 grid gap-8">
        {all.map((faq) => (
          <div key={faq.id} className="border-subtle border-t pt-6">
            <dt className="font-display text-heading text-[length:var(--text-xl)]">
              {faq.question}
            </dt>
            <dd className="text-secondary mt-3 max-w-[62ch]">{faq.answer}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
