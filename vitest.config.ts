import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/components/**/*.test.tsx'],

    /**
     * Fixed placeholders rather than whatever is in a developer's .env.local.
     *
     * lib/env.ts validates on import, and lib/seo/site.ts reads the site URL at
     * module scope, so the unit tests need these to exist. Pinning them here
     * means the suite behaves identically on a laptop and in CI, and that a test
     * asserting a canonical URL is asserting a known value.
     */
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      NEXT_PUBLIC_SITE_URL: 'https://barrebykelly.test',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
});
