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
                'createAdminClient bypasses RLS. Import it only in Stripe webhook handlers, cron routes and the seed script.',
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
    // The webhook, cron and seed paths are exactly where the service-role client
    // belongs, so the rule above is lifted for them.
    files: [
      'app/api/stripe/**',
      'app/api/cron/**',
      'app/api/webhooks/**',
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
