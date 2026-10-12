import { expect, test } from "@playwright/test";
import { newSpendingEntryRow } from "../../lib/domain/mobile";
import { TZ_COOKIE } from "../../lib/time";
import { signInAs } from "./helpers/money-in";
import { adminClient, createTestUser } from "./helpers/supabase";
import { seedSpending, seedToday } from "./helpers/today";

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Needs a local stack WITH realtime (`supabase start`, publication from migration 20261012000300).
 * CI's e2e job excludes realtime and builds with NEXT_PUBLIC_REALTIME=off, so it skips there.
 */
test("Today updates by itself when a spending entry arrives from the phone", async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_REALTIME === "off" || !!process.env.CI, "realtime is not running in this environment");
  const user = await createTestUser("live");
  const seed = await seedToday(user.id);
  await seedSpending(user.id, seed);
  await signInAs(page, user, "/today");
  await page.context().addCookies([{ name: TZ_COOKIE, value: "Asia/Manila", url: new URL(page.url()).origin }]);
  const socket = page.waitForEvent("websocket", { predicate: (w) => w.url().includes("/realtime/") });
  await page.goto("/today");
  await socket;
  await page.waitForTimeout(1_500); // let the channel join
  const safe = page.getByTestId("safe-amount");
  const before = await safe.getAttribute("data-safe-minor");

  const db = adminClient();
  const { data: cat } = await db.from("categories").select("id").eq("user_id", user.id).eq("name", "Groceries").single();
  const row = newSpendingEntryRow({ userId: user.id, nowMs: Date.now(), accountId: seed.accountIds.cash, amountMinor: 10_000, occurredAt: Date.now(), categoryId: cat!.id });
  const { error } = await db.from("ledger_entries").insert(row);
  expect(error).toBeNull();

  await expect(safe).not.toHaveAttribute("data-safe-minor", before ?? "", { timeout: 15_000 });
});
