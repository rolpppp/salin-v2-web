import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { newAccountRow, newCategoryRow, newIncomeEntryRow } from "../../lib/domain/mobile";
import { adminClient, createTestUser, eventsFor, TEST_TIME_ZONE, type TestUser } from "./helpers/supabase";
import { signInAs } from "./helpers/money-in";

/**
 * Log spending (SPEC §8). Each test makes its own user (the four projects run in parallel and these tests write).
 * Seed: Living ₱9,500.00 (kept in Cash), Fun ₱2,000.00 (kept in GCash) so safe to spend is ₱11,500.00, payday in 4 days.
 */
const manilaDay = (offsetDays: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TEST_TIME_ZONE }).format(Date.now() + offsetDays * 86_400_000);

type Seed = { accountIds: { cash: string; gcash: string }; bucketIds: { living: string; fun: string }; categoryIds: { lunch: string; movies: string } };

async function seed(user: TestUser): Promise<Seed> {
  const db = adminClient();
  const userId = user.id;
  const nowMs = Date.now();
  const must = (label: string, error: { message: string } | null) => {
    if (error) throw new Error(`seed ${label}: ${error.message}`);
  };
  must("profile", (await db.from("user_profiles").upsert({ user_id: userId, firstName: "Maria", homeCurrency: "PHP", weekStartsOn: 1, nextPaydayDate: manilaDay(4) })).error);

  const cash = newAccountRow({ userId, nowMs, name: "Cash", type: "cash", displayOrder: 1, id: `cash-${randomUUID().slice(0, 8)}` });
  const gcash = newAccountRow({ userId, nowMs, name: "GCash", type: "eWallet", displayOrder: 2, id: `gcash-${randomUUID().slice(0, 8)}` });
  must("accounts", (await db.from("accounts").insert([cash, gcash])).error);

  const living = randomUUID();
  const fun = randomUUID();
  must(
    "buckets",
    (
      await db.from("buckets").insert([
        { id: living, user_id: userId, name: "Living", groupKey: "spend", hue: "living", keptInAccountId: cash.id, displayOrder: 1 },
        { id: fun, user_id: userId, name: "Fun money", groupKey: "spend", hue: "fun", keptInAccountId: gcash.id, displayOrder: 2 },
      ])
    ).error,
  );

  const lunch = newCategoryRow({ userId, nowMs, name: "Lunch", type: "expense" });
  const movies = newCategoryRow({ userId, nowMs, name: "Movies", type: "expense" });
  const pay = newCategoryRow({ userId, nowMs, name: "Pay", type: "income" });
  must("categories", (await db.from("categories").insert([lunch, movies, pay])).error);
  must(
    "category_buckets",
    (
      await db.from("category_buckets").insert([
        { user_id: userId, categoryId: lunch.id, bucketId: living, source: "auto" },
        { user_id: userId, categoryId: movies.id, bucketId: fun, source: "auto" },
      ])
    ).error,
  );

  // Confirmed money: one income split Living 9,500 / Fun 2,000 (the cycle is required for allocations).
  const income = newIncomeEntryRow({ userId, nowMs, accountId: cash.id, amountMinor: 1_150_000, occurredAt: nowMs - 86_400_000, categoryId: pay.id });
  must("income", (await db.from("ledger_entries").insert(income)).error);
  const cycle = randomUUID();
  must("cycle", (await db.from("transfer_cycles").insert({ id: cycle, user_id: userId })).error);
  must(
    "allocations",
    (
      await db.from("allocations").insert([
        { user_id: userId, ledgerEntryId: income.id, bucketId: living, amountMinor: 950_000, destAccountId: cash.id, planKey: "A", percentBp: 8000, transferCycleId: cycle },
        { user_id: userId, ledgerEntryId: income.id, bucketId: fun, amountMinor: 200_000, destAccountId: gcash.id, planKey: "A", percentBp: 2000, transferCycleId: cycle },
      ])
    ).error,
  );
  return { accountIds: { cash: cash.id, gcash: gcash.id }, bucketIds: { living, fun }, categoryIds: { lunch: lunch.id, movies: movies.id } };
}

async function setup(page: Page) {
  const user = await createTestUser("logspend");
  const s = await seed(user);
  await signInAs(page, user, "/today");
  return { user, seed: s };
}

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.use({ storageState: { cookies: [], origins: [] } });

test("opens as a dialog with Amount focused, groups categories by bucket, and Escape returns focus to + Log spending", async ({ page }) => {
  await setup(page);
  const launcher = page.getByRole("button", { name: "+ Log spending" });
  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "Log spending" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Amount")).toBeFocused();
  // A closed <select> flattens optgroups in the accessibility tree, so check the DOM grouping.
  await expect(dialog.locator('optgroup[label="Living"] > option', { hasText: "Lunch" })).toHaveCount(1);
  await expect(dialog.locator('optgroup[label="Fun money"] > option', { hasText: "Movies" })).toHaveCount(1);
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();
});

test("errors are inline, announced, and put focus on the field; nothing is written", async ({ page }) => {
  const { user } = await setup(page);
  await page.getByRole("button", { name: "+ Log spending" }).click();
  const dialog = page.getByRole("dialog", { name: "Log spending" });
  const amount = dialog.getByLabel("Amount");

  await dialog.getByRole("button", { name: "Log it" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Enter what you spent, above ₱0." })).toBeVisible();
  await expect(amount).toBeFocused();

  await amount.fill("99,999,999");
  await dialog.getByRole("button", { name: "Log it" }).click();
  await expect(dialog.getByText("That amount looks too large. Check the number of zeros.")).toBeVisible();

  await amount.fill("50");
  await dialog.getByRole("button", { name: "Log it" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Pick a category, so it comes out of the right bucket." })).toBeVisible();
  await expect(dialog.getByLabel("Category")).toBeFocused();

  await dialog.getByLabel("Category").selectOption({ label: "Lunch" });
  await dialog.getByLabel("Date").fill(manilaDay(1));
  await dialog.getByRole("button", { name: "Log it" }).click();
  await expect(dialog.getByText(/Pick today or an earlier date/)).toBeVisible();
  await expect(dialog.getByLabel("Date")).toBeFocused();

  const { count } = await adminClient().from("ledger_entries").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("direction", 1);
  expect(count).toBe(0);
});

test("impact line, Log it writes a mobile-valid outflow, the Logged flag shows, focus returns, and the flag clears when leaving Today", async ({ page }) => {
  const { user, seed: s } = await setup(page);
  await page.getByRole("button", { name: "+ Log spending" }).click();
  const dialog = page.getByRole("dialog", { name: "Log spending" });

  await dialog.getByLabel("Category").selectOption({ label: "Lunch" });
  await expect(dialog.getByLabel("Paid from")).toHaveValue(s.accountIds.cash);
  await dialog.getByLabel("Amount").fill("180");
  await expect(dialog.getByTestId("log-impact")).toContainText("From Living: ₱9,500.00 left → ₱9,320.00");
  await expect(dialog.getByTestId("log-impact")).toContainText("About ₱2,830 a day after this, for 4 days");
  await dialog.getByLabel("Amount").fill("12,000");
  await expect(dialog.getByTestId("log-impact")).toContainText("→ −₱2,500.00");
  await dialog.getByLabel("Amount").fill("180");

  await dialog.getByRole("button", { name: "Log it" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("logged-flag")).toHaveText("Logged ₱180.00 for Lunch. Living has ₱9,320.00 left. Safe to spend: about ₱2,830 a day.");
  await expect(page.getByRole("button", { name: "+ Log spending" })).toBeFocused();
  await expect(page.getByTestId("live-region")).toContainText("Logged ₱180.00 for Lunch. Living has ₱9,320.00 left.");

  const db = adminClient();
  const { data: rows } = await db.from("ledger_entries").select("*").eq("user_id", user.id).eq("direction", 1);
  expect(rows).toHaveLength(1);
  expect(rows?.[0]).toMatchObject({
    amountMinor: 18_000,
    direction: 1,
    origin: 0,
    accountId: s.accountIds.cash,
    categoryId: s.categoryIds.lunch,
    transferId: null,
    syncStatus: 2,
    deletedAt: null,
  });
  const { data: eb } = await db.from("entry_buckets").select("bucketId, source").eq("ledgerEntryId", rows?.[0]?.id ?? "").single();
  expect(eb).toMatchObject({ bucketId: s.bucketIds.living, source: "category" });
  expect(await eventsFor(user.id, "spending_logged")).toHaveLength(1);

  await page.getByRole("link", { name: /Money in/ }).first().click();
  await page.waitForURL("**/money-in");
  await page.goBack();
  await page.waitForURL("**/today");
  await expect(page.getByTestId("logged-flag")).toHaveCount(0);
});

test("Log and add another keeps the sheet, the category and the date, clears amount and note, and focuses Amount", async ({ page }) => {
  const { user, seed: s } = await setup(page);
  await page.getByRole("button", { name: "+ Log spending" }).click();
  const dialog = page.getByRole("dialog", { name: "Log spending" });
  await dialog.getByLabel("Category").selectOption({ label: "Movies" });
  await dialog.getByLabel("Paid from").selectOption({ label: "Cash" });
  await dialog.getByLabel("Date").fill(manilaDay(-1));
  await dialog.getByLabel("Amount").fill("350");
  await dialog.getByLabel(/What was it/).fill("Cinema");
  await dialog.getByRole("button", { name: "Log and add another" }).click();

  await expect(page.getByTestId("logged-flag")).toHaveText(/^Logged ₱350\.00 for Cinema\. Fun money has ₱1,650\.00 left\./);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Category")).toHaveValue(s.categoryIds.movies);
  await expect(dialog.getByLabel("Date")).toHaveValue(manilaDay(-1));
  await expect(dialog.getByLabel("Amount")).toHaveValue("");
  await expect(dialog.getByLabel(/What was it/)).toHaveValue("");
  await expect(dialog.getByLabel("Amount")).toBeFocused();

  await dialog.getByLabel("Amount").fill("100");
  await dialog.getByRole("button", { name: "Log it" }).click();
  await expect(dialog).toBeHidden();

  const { data: rows } = await adminClient().from("ledger_entries").select("amountMinor, note, accountId, occurredAt").eq("user_id", user.id).eq("direction", 1).order("amountMinor");
  expect(rows?.map((r) => r.amountMinor)).toEqual([10_000, 35_000]);
  expect(rows?.find((r) => r.amountMinor === 35_000)).toMatchObject({ note: "Cinema", accountId: s.accountIds.cash });
});

test("a failed write says so, keeps the sheet and what was typed, and shows no Logged flag", async ({ page }) => {
  const { user } = await setup(page);
  await page.getByRole("button", { name: "+ Log spending" }).click();
  const dialog = page.getByRole("dialog", { name: "Log spending" });
  await dialog.getByLabel("Category").selectOption({ label: "Lunch" });
  await dialog.getByLabel("Amount").fill("180");

  await page.route("**/today", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
  await dialog.getByRole("button", { name: "Log it" }).click();
  await expect(dialog.getByText("Couldn't save. Check your connection and try again.")).toBeVisible();
  await expect(dialog.getByLabel("Amount")).toHaveValue("180");
  await expect(page.getByTestId("logged-flag")).toHaveCount(0);

  const { count } = await adminClient().from("ledger_entries").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("direction", 1);
  expect(count).toBe(0);
});
