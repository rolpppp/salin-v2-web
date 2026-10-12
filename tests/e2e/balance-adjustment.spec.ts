import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { TZ_COOKIE } from "../../lib/time";
import { adminClient, createTestUser } from "./helpers/supabase";
import { signInAs } from "./helpers/money-in";
import { confirmAllAndSend, seedToday } from "./helpers/today";

// Each test makes its own user: the projects run in parallel and this test writes.
test.use({ storageState: { cookies: [], origins: [] } });

// A phone "Update balances" row (origin adjustment, no category, no transfer), bigger than what Living has left.
// Living holds ₱1,213.03 after the G1 payday; a ₱2,000.00 outflow adjustment is untracked spending that overdraws it by ₱786.97.
test("an outflow balance adjustment is untracked Living spending: 'Needs', named in the slip, never income", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  const user = await createTestUser("adjust");
  const seed = await seedToday(user.id);
  await signInAs(page, user, "/money-in");
  await confirmAllAndSend(page);

  const db = adminClient();
  const id = randomUUID();
  const now = Date.now();
  const ins = await db.from("ledger_entries").insert({
    id,
    user_id: user.id,
    accountId: seed.accountIds.mari,
    categoryId: null,
    recurringInstanceId: null,
    debtId: null,
    splitId: null,
    transferId: null,
    amountMinor: 200_000,
    direction: 1,
    origin: 6,
    occurredAt: now,
    note: "Balance adjustment",
    metadataJson: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncStatus: 2,
  });
  expect(ins.error).toBeNull();
  // The local test run maps it with the entry_buckets trigger (pgTAP covers that); upsert so this spec stands on the screens alone.
  const eb = await db.from("entry_buckets").upsert({ user_id: user.id, ledgerEntryId: id, bucketId: seed.bucketIds.living, source: "category" }, { onConflict: "user_id,ledgerEntryId" });
  expect(eb.error).toBeNull();

  await page.context().addCookies([{ name: TZ_COOKIE, value: "Asia/Manila", url: new URL(page.url()).origin }]);
  await page.goto("/today");

  const living = page.getByTestId("slot-living");
  await expect(living).toContainText("−₱786.97");
  await expect(living).toContainText("Needs ₱786.97");
  await expect(page.getByTestId("next-heading")).toHaveText("Living needs ₱786.97");

  // the drawer's slip names the line
  const slot = page.getByTestId("slot-living");
  await expect.poll(() => slot.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")))).toBe(true);
  await slot.click();
  const drawer = page.getByRole("dialog", { name: "Living" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId("drawer-lines")).toContainText("Balance adjustment");
  await expect(drawer.getByTestId("drawer-lines")).toContainText("−₱2,000.00");
  await expect(drawer.getByTestId("drawer-lines")).not.toContainText("Uncategorised");
  await page.keyboard.press("Escape");

  // never income: nothing waits on Money in
  await page.goto("/money-in");
  await expect(page.getByRole("heading", { level: 1, name: "Every peso has a home" })).toBeVisible();
  await expect(page.getByText("All money in has a home.")).toBeVisible();
  await expect(page.getByTestId("confirm-all")).toHaveCount(0);

  expect(errors).toEqual([]);
});
