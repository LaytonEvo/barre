import { SiteHeader } from '@/components/site/site-header';
import { AnnouncementBanner } from '@/components/site/announcement-banner';
import { SiteFooter } from '@/components/site/site-footer';

/**
 * The public site: everything a visitor or member sees.
 *
 * Separate from the admin portal so the marketing header and footer are not
 * rendered around an operational screen. A route group changes no URLs.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <AnnouncementBanner />
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
