import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { path } from '@/lib/routes';

/**
 * Site-wide announcement, editable from admin (M6).
 *
 * Renders nothing at all when there is no live announcement, so the header does
 * not reserve empty space. Scheduling is handled by starts_at / ends_at in the
 * database rather than by somebody remembering to switch it off — a banner
 * about a cancelled class is actively harmful the day after.
 */
export async function AnnouncementBanner() {
  const supabase = await createClient();

  const now = new Date().toISOString();
  const { data } = await supabase
    .from('announcements')
    .select('id, body, link_href, link_label')
    .eq('active', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return (
    <div className="bg-inverse text-on-inverse" role="status">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm md:px-8">
        <p>{data.body}</p>
        {data.link_href && data.link_label ? (
          <Link href={path(data.link_href)} className="font-medium underline underline-offset-2">
            {data.link_label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
