'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { EQUIPMENT, LENGTHS, LEVELS } from '@/lib/videos/filters';
import { path } from '@/lib/routes';
import { cn } from '@/lib/utils';

type Category = { name: string; slug: string };

/**
 * Filters as links, not as a form.
 *
 * Every state is a URL, which means the back button works, a filtered library can
 * be bookmarked, and the whole thing keeps working with JavaScript still loading.
 * The only client-side logic here is reading the current query to decide what
 * looks selected and what the next URL should be.
 */
function Chip({
  href,
  active,
  children,
  title,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <Link
      href={path(href)}
      title={title}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'focus-visible:outline-focus rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
        active
          ? 'border-strong bg-accent-soft text-primary font-medium'
          : 'border-subtle text-secondary hover:border-strong',
      )}
    >
      {children}
    </Link>
  );
}

export function LibraryFilters({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const params = useSearchParams();

  /** Toggle one single-valued filter, clearing it when it is already on. */
  const toggle = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (next.get(key) === value) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  /** Equipment is additive: a member owns several things at once. */
  const toggleEquipment = (value: string) => {
    const next = new URLSearchParams(params.toString());
    const current = (next.get('equipment') ?? '').split(',').filter(Boolean);
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    if (updated.length > 0) next.set('equipment', updated.join(','));
    else next.delete('equipment');
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const equipment = (params.get('equipment') ?? '').split(',').filter(Boolean);
  const anyFilter = ['category', 'length', 'level', 'equipment', 'favourites', 'pregnancy'].some(
    (key) => params.has(key),
  );

  return (
    <div className="mt-6 space-y-4">
      <Group label="Type of class">
        {categories.map((category) => (
          <Chip
            key={category.slug}
            href={toggle('category', category.slug)}
            active={params.get('category') === category.slug}
          >
            {category.name}
          </Chip>
        ))}
      </Group>

      <Group label="How long have you got?">
        {LENGTHS.map((length) => (
          <Chip
            key={length.value}
            href={toggle('length', length.value)}
            active={params.get('length') === length.value}
            title={length.hint}
          >
            {length.label}
          </Chip>
        ))}
      </Group>

      <Group label="Level">
        {LEVELS.map((level) => (
          <Chip
            key={level.value}
            href={toggle('level', level.value)}
            active={params.get('level') === level.value}
          >
            {level.label}
          </Chip>
        ))}
      </Group>

      {/* Phrased as what the member HAS, because that is the filter's actual
          semantic: picking "mat" shows what can be done with a mat and nothing
          more, not every video that happens to mention one. */}
      <Group label="What have you got to hand?">
        {EQUIPMENT.map((item) => (
          <Chip
            key={item.value}
            href={toggleEquipment(item.value)}
            active={equipment.includes(item.value)}
          >
            {item.label}
          </Chip>
        ))}
      </Group>

      <Group label="Show me">
        <Chip href={toggle('favourites', '1')} active={params.get('favourites') === '1'}>
          Saved
        </Chip>
        <Chip
          href={toggle('pregnancy', '1')}
          active={params.get('pregnancy') === '1'}
          title="Only classes marked safe for pregnancy"
        >
          Pregnancy safe
        </Chip>
        {anyFilter ? (
          <Link
            href={path(pathname)}
            className="text-link focus-visible:outline-focus self-center px-2 text-sm underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Clear all
          </Link>
        ) : null}
      </Group>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="text-muted text-xs font-semibold tracking-wide uppercase">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}
