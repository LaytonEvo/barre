import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { SiteHeader } from '@/components/site/site-header';
import { AnnouncementBanner } from '@/components/site/announcement-banner';
import { SiteFooter } from '@/components/site/site-footer';
import { CookieConsent } from '@/components/site/cookie-consent';
import { IS_PRODUCTION_SITE } from '@/lib/seo/site';

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  axes: ['SOFT', 'WONK'],
});

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'Barre By Kelly — barre classes in Ringwood',
    template: '%s | Barre By Kelly',
  },
  description:
    'Barre classes for all levels and all bodies. Ballet-inspired strength, Pilates and conditioning.',
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
    : undefined,
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    siteName: 'Barre By Kelly',
    // app/opengraph-image.jpg is picked up automatically by Next.
  },
  twitter: { card: 'summary_large_image' },
  // noindex on anything that is not the real site. robots.txt asks a crawler not
  // to fetch; this tag is what actually keeps a page out of the index when
  // somebody links to it, so both are needed.
  robots: IS_PRODUCTION_SITE
    ? { index: true, follow: true }
    : { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: '#FAF6F0',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <AnnouncementBanner />
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <CookieConsent plausibleDomain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN} />
      </body>
    </html>
  );
}
