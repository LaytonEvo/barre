import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// eslint-config-next 16 ships flat configs, so they spread in directly — no
// FlatCompat wrapper.
const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // The mistake that matters most here: reaching for the service-role
      // Supabase client in code that runs anywhere near a request. It bypasses
      // RLS entirely.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/lib/supabase/admin',
              message:
                'createAdminClient bypasses RLS. Import it only in Stripe and Mux webhook handlers, cron routes and the seed script.',
            },
          ],
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Where the service-role client legitimately belongs, and why:
    //
    //   app/api/stripe/**  webhook handlers — the member has no session, and
    //                      Stripe is the authority for what was paid
    //   app/api/cron/**    scheduled jobs — session generation, credit expiry
    //   lib/stripe/**      fulfilment, product sync, customer creation
    //   lib/credits/**     the free intro offer, granted with no payment
    //   scripts/, supabase/  seeding and one-off maintenance
    //
    // Everything else goes through the member's own client so RLS applies.
    files: [
      'app/api/stripe/**',
      'app/api/cron/**',
      'app/api/webhooks/**',
      // The Mux webhook, like Stripe's, runs with no signed-in user: Mux is the
      // caller. Its own authority is the verified signature, not a session.
      'app/api/mux/**',
      // One-click unsubscribe from an email. The person clicking is in their
      // inbox, not logged in, so there is no session to act under — the signed
      // token in the link is the authority. It writes one boolean on one row.
      'app/unsubscribe/**',
      'lib/stripe/**',
      'lib/credits/**',
      'scripts/**',
      'supabase/**',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // The contrast checker is a standalone Node script, not part of the app.
    files: ['design/*.mjs'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
