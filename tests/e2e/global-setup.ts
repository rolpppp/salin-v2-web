import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type FullConfig } from "@playwright/test";
import { createTestUser, seedMobileShape, TEST_TIME_ZONE, type TestUser } from "./helpers/supabase";

export const AUTH_DIR = "tests/e2e/.auth";
export const SEEDED_STATE = `${AUTH_DIR}/seeded.json`;
export const EMPTY_STATE = `${AUTH_DIR}/empty.json`;
export const FRESH_STATE = `${AUTH_DIR}/fresh.json`;

/**
 * Creates one user with mobile-shaped data, one with no data, and one who hasn't started onboarding; signs each in
 * through the real sign-in form once and saves the sessions so most tests do not spend the auth rate limit.
 * The app is built with onboarding on (like production), so the first two are marked onboarded.
 */
export default async function globalSetup(config: FullConfig) {
  mkdirSync(AUTH_DIR, { recursive: true });
  const baseURL = config.projects[0].use.baseURL ?? "http://localhost:3100";

  const seeded = await createTestUser("seeded");
  await seedMobileShape(seeded.id);
  const empty = await createTestUser("empty");
  const fresh = await createTestUser("fresh", { onboarded: false });
  writeFileSync(`${AUTH_DIR}/users.json`, JSON.stringify({ seeded, empty, fresh }));

  const browser = await chromium.launch();
  try {
    for (const [user, file, lands] of [
      [seeded, SEEDED_STATE, "**/today"],
      [empty, EMPTY_STATE, "**/today"],
      [fresh, FRESH_STATE, "**/welcome"],
    ] as Array<[TestUser, string, string]>) {
      const context = await browser.newContext({ baseURL, timezoneId: TEST_TIME_ZONE });
      const page = await context.newPage();
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(user.email);
      await page.getByLabel("Password").fill(user.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL(lands);
      await context.storageState({ path: file });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
