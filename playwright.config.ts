import { defineConfig } from "@playwright/test";

// Local runs read Supabase settings from .env.test.local (gitignored, see .env.example). CI sets real env vars.
try {
  process.loadEnvFile(".env.test.local");
} catch {
  // No file: rely on the environment.
}

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // "This week" is computed in the visitor's zone; pin it so seeded timestamps are deterministic.
    timezoneId: "Asia/Manila",
    // Most tests run signed in as a user with no data. Specs override this when they need another user.
    storageState: "tests/e2e/.auth/empty.json",
  },
  projects: [
    { name: "mobile-light", use: { viewport: { width: 390, height: 844 }, colorScheme: "light", hasTouch: true } },
    { name: "mobile-dark", use: { viewport: { width: 390, height: 844 }, colorScheme: "dark", hasTouch: true } },
    { name: "desktop-light", use: { viewport: { width: 1440, height: 900 }, colorScheme: "light" } },
    { name: "desktop-dark", use: { viewport: { width: 1440, height: 900 }, colorScheme: "dark" } },
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
