'use client';

import { useCallback, useSyncExternalStore } from 'react';
import Script from 'next/script';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'bbk-analytics-consent';

type Consent = 'pending' | 'undecided' | 'granted' | 'denied';

/**
 * `localStorage` is an external store, so it is read with useSyncExternalStore
 * rather than mirrored into state inside an effect. Three things fall out of
 * that: no synchronous setState in an effect, a clean server snapshot for SSR,
 * and a choice made in another tab is reflected here without a reload.
 */
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // 'storage' only fires in *other* tabs, so same-tab writes notify directly.
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot(): Consent {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'granted' || stored === 'denied' ? stored : 'undecided';
  } catch {
    // Private browsing or blocked site data: treat as undecided and ask again.
    return 'undecided';
  }
}

/** The server cannot know, and must render the same markup for everyone. */
const getServerSnapshot = (): Consent => 'pending';

/**
 * Cookie consent, UK PECR style: analytics loads only after a positive choice.
 *
 * Plausible is cookieless and arguably needs no consent, but it is still a
 * third-party request, so asking is both safer and more honest.
 */
export function CookieConsent({ plausibleDomain }: { plausibleDomain: string | undefined }) {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const decide = useCallback((next: 'granted' | 'denied') => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage refused. Nothing to do: the notify below still updates this view.
    }
    notify();
  }, []);

  // Nothing to consent to if analytics is not configured.
  if (!plausibleDomain) return null;

  return (
    <>
      {consent === 'granted' ? (
        <Script
          defer
          data-domain={plausibleDomain}
          src="https://plausible.io/js/script.js"
          strategy="afterInteractive"
        />
      ) : null}

      {consent === 'undecided' ? (
        <div
          role="region"
          aria-label="Cookie choices"
          className="border-subtle bg-surface fixed inset-x-0 bottom-0 z-90 border-t shadow-lg"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-5 py-4 md:px-8">
            <p className="text-secondary min-w-0 flex-1 text-sm">
              We would like to count visits so we know which pages are useful. No adverts, and no
              tracking you around the internet.{' '}
              <a href="/policies/cookies" className="text-link underline">
                More detail
              </a>
              .
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => decide('denied')}>
                No thanks
              </Button>
              <Button size="sm" onClick={() => decide('granted')}>
                That&rsquo;s fine
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
