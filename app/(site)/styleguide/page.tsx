import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { availabilityState } from '@/lib/policy/rules';

export const metadata: Metadata = {
  title: 'Styleguide',
  robots: { index: false, follow: false },
};

const SWATCHES = [
  { name: 'page', className: 'bg-page text-primary' },
  { name: 'surface', className: 'bg-surface text-primary' },
  { name: 'surface-sunk', className: 'bg-surface-sunk text-primary' },
  { name: 'accent-soft', className: 'bg-accent-soft text-primary' },
  { name: 'calm-soft', className: 'bg-calm-soft text-primary' },
  { name: 'action-primary', className: 'bg-action-primary text-white' },
  { name: 'action-accent', className: 'bg-action-accent text-white' },
  { name: 'inverse', className: 'bg-inverse text-on-inverse' },
] as const;

const CONTRAST = [
  ['ink 900 on cream 100', '15.68', 'body copy'],
  ['plum 700 on cream 100', '12.50', 'display headings'],
  ['ink 700 on cream 100', '10.83', 'secondary text'],
  ['white on plum 600', '10.51', 'primary button'],
  ['plum 600 on cream 100', '9.62', 'links, focus ring'],
  ['white on error 600', '7.14', 'destructive button'],
  ['ink 500 on cream 100', '5.88', 'muted text'],
  ['white on blush 600', '4.73', 'booking CTA'],
] as const;

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-subtle mt-16 border-t pt-6">
      <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-[length:var(--text-2xl)]">{title}</h2>
        {note ? <p className="text-muted text-sm">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  // Proves the availability logic and the badge tones agree with one another.
  const examples = [
    { spacesLeft: 11, capacity: 14 },
    { spacesLeft: 2, capacity: 14 },
    { spacesLeft: 0, capacity: 14 },
  ];

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 md:px-8">
      <p className="text-muted text-xs font-semibold tracking-[0.12em] uppercase">
        Barre By Kelly · Direction A
      </p>
      <h1 className="font-display mt-2 text-[length:var(--text-4xl)]">Warm Studio</h1>
      <p className="text-secondary mt-4 max-w-[68ch]">
        Live render of the design tokens. Every colour below resolves through a semantic token in{' '}
        <code className="font-mono text-xs">design/tokens.css</code>, so swapping in Kelly&rsquo;s
        real palette changes one file and no component.
      </p>

      <Section title="Surfaces" note="Semantic tokens, not primitives">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SWATCHES.map((swatch) => (
            <div
              key={swatch.name}
              className={`border-subtle flex min-h-20 flex-col justify-end rounded-lg border p-3 ${swatch.className}`}
            >
              <span className="font-mono text-xs">{swatch.name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Contrast" note="Verified with npm run check:contrast">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-muted text-xs tracking-[0.08em] uppercase">
                <th className="border-subtle border-b py-2 text-left font-semibold">Pair</th>
                <th className="border-subtle border-b py-2 text-left font-semibold">Ratio</th>
                <th className="border-subtle border-b py-2 text-left font-semibold">Used for</th>
              </tr>
            </thead>
            <tbody>
              {CONTRAST.map(([pair, ratio, use]) => (
                <tr key={pair}>
                  <td className="border-subtle border-b py-2">{pair}</td>
                  <td className="border-subtle tabular border-b py-2 font-medium">{ratio}</td>
                  <td className="border-subtle text-muted border-b py-2">{use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted mt-4 max-w-[68ch] text-sm">
          One token fails AA deliberately:{' '}
          <code className="font-mono text-xs">--text-disabled</code> at 3.40:1, scoped to disabled
          controls where WCAG exempts contrast, and barred from prose.
        </p>
      </Section>

      <Section title="Buttons" note="44px minimum target; booking CTA 48px">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="accent" size="lg">
            Book · 1 credit
          </Button>
          <Button variant="primary">Buy a 5-class pack</Button>
          <Button variant="secondary">Join waitlist</Button>
          <Button variant="ghost">View timetable</Button>
          <Button variant="destructive">Cancel booking</Button>
          <Button disabled>Class full</Button>
        </div>
      </Section>

      <Section title="Session status" note="availabilityState() drives the tone">
        <div className="flex flex-wrap items-center gap-3">
          {examples.map((example) => {
            const state = availabilityState(example.spacesLeft, example.capacity);
            return (
              <Badge
                key={state}
                tone={state === 'full' ? 'full' : state === 'nearly_full' ? 'nearly' : 'open'}
              >
                {example.spacesLeft === 0
                  ? 'Full'
                  : `${example.spacesLeft} space${example.spacesLeft === 1 ? '' : 's'} left`}
              </Badge>
            );
          })}
          <Badge tone="waitlist">Waitlist · you&rsquo;re 3rd</Badge>
          <Badge tone="cancelled">Cancelled</Badge>
        </div>
        <p className="text-muted mt-4 max-w-[68ch] text-sm">
          Status always carries text as well as colour. The tones come from the same function the
          timetable uses, so the styleguide cannot drift from the product.
        </p>
      </Section>

      <Section title="Forms" note="16px inputs, so iOS does not zoom on focus">
        <Card className="max-w-sm">
          <CardTitle>Log in</CardTitle>
          <CardContent className="mt-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sg-email">Email</Label>
              <Input id="sg-email" type="email" placeholder="you@example.com" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sg-password">Password</Label>
              <Input id="sg-password" type="password" />
            </div>
            <Button block className="mt-2">
              Log in
            </Button>
          </CardContent>
        </Card>
      </Section>

      <Section title="Typography">
        <div className="grid gap-5">
          <div>
            <p className="text-muted mb-1 text-xs tracking-[0.06em] uppercase">Display · hero</p>
            <p className="font-display text-heading text-[length:var(--text-4xl)] leading-[1.05]">
              Your first class
            </p>
          </div>
          <div>
            <p className="text-muted mb-1 text-xs tracking-[0.06em] uppercase">Body</p>
            <p className="max-w-[68ch]">
              Written for someone who is slightly nervous about walking into their first class.
              Warm, encouraging, never preachy. British English throughout.
            </p>
          </div>
          <div>
            <p className="text-muted mb-1 text-xs tracking-[0.06em] uppercase">
              Tabular figures · why Inter
            </p>
            <p className="tabular text-lg">
              09:30 · 45 mins · 2 spaces left
              <br />
              18:15 · 45 mins · 11 spaces left
              <br />
              19:00 · 60 mins · 7 spaces left
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
