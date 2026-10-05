import type { Metadata } from 'next';
import Link from 'next/link';
import { createPublicClient } from '@/lib/supabase/public';
import { getSessionUser } from '@/lib/supabase/auth';
import { GiftForm } from '@/components/gift/gift-form';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Gift vouchers',
  description:
    'Give someone barre classes near Ringwood. Choose the amount, add a message, and we will email it on the day you choose.',
};

export default async function GiftPage() {
  const user = await getSessionUser();
  const supabase = createPublicClient();

  // Packs and single classes can be gifted. Memberships cannot: a gifted
  // subscription would keep billing the buyer, which is not what a present is.
  const { data: products } = await supabase
    .from('products')
    .select('slug, name, price_pence, credits, kind')
    .in('kind', ['pack', 'drop_in'])
    .eq('active', true)
    .gt('price_pence', 0)
    .order('sort_order');

  const options = (products ?? []).map((p) => ({
    slug: p.slug,
    name: p.name,
    pricePence: p.price_pence,
    credits: p.credits,
  }));

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 md:px-8">
      <h1 className="text-[length:var(--text-3xl)]">Give someone barre</h1>
      <p className="text-secondary mt-3">
        A nice present for somebody who keeps saying they should do something for themselves. They
        get a code by email, they book whichever class suits them, and there is nothing to post.
      </p>

      {options.length === 0 ? (
        <div className="border-subtle mt-8 rounded-xl border border-dashed p-6">
          <p className="text-primary font-medium">Gift vouchers are not on sale just yet</p>
          <p className="text-secondary mt-1 text-sm">
            Prices are still being finalised. In the meantime,{' '}
            <Link href="/contact" className="text-link underline">
              get in touch
            </Link>{' '}
            and Kelly will sort something out directly.
          </p>
        </div>
      ) : !user ? (
        <div className="border-strong bg-accent-soft mt-8 rounded-xl border p-6">
          <p className="text-primary font-medium">Log in first</p>
          <p className="text-secondary mt-1 text-sm">
            Buying a gift needs an account, so the receipt has somewhere to go and you can check
            whether it has been used.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/login?next=/gift">
              <Button>Log in</Button>
            </Link>
            <Link href="/signup?next=/gift">
              <Button variant="secondary">Create an account</Button>
            </Link>
          </div>
        </div>
      ) : (
        <GiftForm options={options} />
      )}

      <div className="border-subtle mt-12 border-t pt-6">
        <h2 className="text-[length:var(--text-lg)]">How it works</h2>
        <ol className="text-secondary mt-3 grid gap-2 text-sm">
          <li>1. Choose what to give and who it is for.</li>
          <li>2. Pay — you get a receipt straight away.</li>
          <li>3. We email them the code on the date you picked, with your message.</li>
          <li>4. They enter it on the site and the classes land on their account.</li>
        </ol>
        <p className="text-muted mt-4 text-sm">
          Vouchers are valid for 18 months, so there is no rush on them. Already been given one?{' '}
          <Link href="/redeem" className="text-link underline">
            Redeem it here
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
