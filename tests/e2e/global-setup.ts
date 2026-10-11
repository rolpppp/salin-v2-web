import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type FullConfig } from "@playwright/test";
import { createTestUser, seedMobileShape, TEST_TIME_ZONE, type TestUser } from "./helpers/supabase";

export const AUTH_DIR = "tests/e2e/.auth";
export const SEEDED_STATE = `${AUTH_DIR}/seeded.json`;
export const EMPTY_STATE = `${AUTH_DIR}/empty.json`;

/**
 * Creates one user with mobile-shaped data and one with no rows, signs both in through the real
 * sign-in form once, and saves their sessions so most tests do not spend the auth rate limit.
 */
export default async function globalSetup(config: FullConfig) {
  mkdirSync(AUTH_DIR, { recursive: true });
  const baseURL = config.projects[0].use.baseURL ?? "http://localhost:3100";

  const seeded = await createTestUser("seeded");
  await seedMobileShape(seeded.id);
  const empty = await createTestUser("empty");
  writeFileSync(`${AUTH_DIR}/users.json`, JSON.stringify({ seeded, empty }));

  const browser = await chromium.launch();
  try {
    for (const [user, file] of [
      [seeded, SEEDED_STATE],
      [empty, EMPTY_STATE],
    ] as Array<[TestUser, string]>) {
      const context = await browser.newContext({ baseURL, timezoneId: TEST_TIME_ZONE });
      const page = await context.newPage();
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(user.email);
      await page.getByLabel("Password").fill(user.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL("**/today");
      await context.storageState({ path: file });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
