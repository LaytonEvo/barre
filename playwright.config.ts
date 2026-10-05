import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a real stack.
 *
 * These run against local Supabase (`supabase start`) and a real Next build —
 * not mocks. That is the point: everything else in this repo tests a layer, and
 * these test that the layers are wired to each other.
 *
 * Chromium only, deliberately. The brief's acceptance tests are about behaviour,
 * not rendering engines, and three browsers would triple the wall-clock for no
 * extra signal on a site with no exotic CSS. The accessibility suite is where
 * cross-browser concerns would actually surface, and axe is engine-independent.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  // Booking is a concurrency-sensitive system and several specs share the one
  // local database, so they run in series. The genuinely concurrent case
  // (acceptance test 5) is covered against Postgres directly, where 20 real
  // connections can be fired at once.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Kelly's half of the product is used on a phone, so that is the default
    // viewport rather than a desktop one nobody uses for the register.
    ...devices['Desktop Chrome'],
    launchOptions: {
      // This container ships Chromium at a fixed path rather than in Playwright's
      // own cache, so an unset executablePath means "browser not found".
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    },
  },

  projects: [
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    {
      name: 'e2e',
      dependencies: ['setup'],
      testIgnore: /global\.setup\.ts/,
    },
  ],

  // Production build, not `next dev`: dev-only overlays and slower compiles make
  // for flaky tests that pass or fail on timing rather than behaviour.
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
