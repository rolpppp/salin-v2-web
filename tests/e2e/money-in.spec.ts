import { expect, test, type Page } from "@playwright/test";
import { formatPeso } from "../../lib/money";
import { adminClient, createTestUser, eventsFor, type TestUser } from "./helpers/supabase";
import { G2, G5, allocationsByHue, seedMoneyIn, signInAs, type MoneyInSeed } from "./helpers/money-in";

// Each test makes its own user: the four projects (390/1440 x light/dark) run in parallel and these tests write.
async function setup(page: Page): Promise<{ user: TestUser; seed: MoneyInSeed }> {
  const user = await createTestUser("moneyin");
  const seed = await seedMoneyIn(user.id);
  await signInAs(page, user);
  return { user, seed };
}

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.use({ storageState: { cookies: [], origins: [] } });

test("queue: oldest first, each job spelled out, Needs a job flagged, no overflow, no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page);

  await expect(page.getByRole("heading", { level: 1, name: "Give your money a job" })).toBeVisible();
  const rows = page.getByTestId("queue-item");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Work");
  await expect(rows.nth(0)).toContainText(formatPeso(2_300_000));
  await expect(rows.nth(0).getByTestId("job-text")).toHaveText("Split by Plan A");
  await expect(rows.nth(1).getByTestId("job-text")).toHaveText("Own split: Tax 10 · Sinking funds 40 · Fun money 50");
  await expect(rows.nth(2).getByTestId("job-text")).toHaveText("Needs a job");
  await expect(page.getByTestId("confirm-all")).toHaveText(`Confirm 2 · ${formatPeso(2_650_000)}`);
  await expect(page.getByText("Gift needs a job first.")).toBeVisible();

  // the slip for the open row, then the total once the open row is collapsed
  await page.getByRole("button", { name: /Work/ }).click();
  const slip = page.getByRole("group", { name: "Money in slip" });
  await expect(slip).toContainText(formatPeso(G2.emergency));
  await page.getByRole("button", { name: /Work/ }).click();
  await expect(slip).toContainText("All waiting income");

  expect(await noHorizontalScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("Add income validates inline, writes a mobile-shaped inflow, then a picked job is confirmed with snapshots", async ({ page }) => {
  const { user, seed } = await setup(page);

  await page.getByTestId("add-income-button").click();
  const amount = page.getByLabel("Amount received");
  await expect(amount).toBeFocused();
  await amount.fill("0");
  await page.getByRole("button", { name: "Add to Money in" }).click();
  await expect(page.getByText("Enter the amount you received, above ₱0.")).toBeVisible();
  await expect(amount).toBeFocused();

  await amount.fill("5,000");
  await page.getByLabel("Source").selectOption({ label: "Gift" });
  await page.getByRole("button", { name: "Add to Money in" }).click();

  // the new income is in the queue, selected, with focus on its row
  const rows = page.getByTestId("queue-item");
  await expect(rows).toHaveCount(4);
  const mine = rows.filter({ hasText: formatPeso(500_000) });
  await expect(mine.getByRole("button", { expanded: true })).toBeFocused();
  await expect(mine.getByTestId("job-text")).toHaveText("Needs a job");

  const db = adminClient();
  const { data: entry } = await db.from("ledger_entries").select("*").eq("user_id", user.id).eq("amountMinor", 500_000).single();
  expect(entry).toMatchObject({ direction: 0, origin: 0, categoryId: seed.categoryIds.gift, accountId: seed.accountIds.mari, syncStatus: 2, deletedAt: null, transferId: null });
  const { data: meta } = await db.from("income_meta").select("sourceId, job").eq("ledgerEntryId", entry?.id ?? "").single();
  expect(meta?.job).toBeNull();
  expect(await eventsFor(user.id, "income_added")).toHaveLength(1);

  // pick a job, confirm just this one
  await mine.getByRole("radio", { name: /Split by my plan/ }).check();
  await expect(mine.getByTestId("job-text")).toHaveText("Split by Plan A");
  await mine.getByRole("button", { name: "Confirm just this one" }).click();
  await expect(rows).toHaveCount(3);
  await expect(page.getByRole("list", { name: "Confirmed" })).toContainText(formatPeso(500_000));

  const { rows: allocs } = await allocationsByHue(entry?.id ?? "", seed.bucketIds);
  expect(allocs.reduce((t, r) => t + r.amountMinor, 0)).toBe(500_000);
  expect(allocs.every((r) => r.planKey === "A" && r.destAccountId !== null && r.transferCycleId !== null)).toBe(true);
  expect(await eventsFor(user.id, "income_confirmed")).toHaveLength(1);
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("Confirm all writes the golden split (G2, G5), skips the income with no job, and focuses the next waiting row", async ({ page }) => {
  const { user, seed } = await setup(page);

  await page.getByTestId("confirm-all").click();
  await expect(page.getByTestId("queue-item")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Gift/ })).toBeFocused();
  await expect(page.getByText("2 of 3 done")).toBeVisible();

  expect((await allocationsByHue(seed.incomeIds.g2, seed.bucketIds)).byHue).toEqual(G2);
  expect((await allocationsByHue(seed.incomeIds.g5, seed.bucketIds)).byHue).toEqual(G5);
  expect((await allocationsByHue(seed.incomeIds.gift, seed.bucketIds)).rows).toHaveLength(0);

  // Step 2 is the ticket 11 placeholder, now enabled
  await expect(page.getByTestId("move-money-placeholder")).toContainText("Placeholder");
  // the page keeps working after a reload: nothing left waiting but the gift, and the done list survives
  await page.reload();
  await expect(page.getByTestId("queue-item")).toHaveCount(1);
  await expect(page.getByRole("list", { name: "Confirmed" })).toContainText("Work");
  expect(await eventsFor(user.id, "income_confirmed")).toHaveLength(2);
});

test("a user with no income sees the honest empty state and can open Add income", async ({ page }) => {
  const user = await createTestUser("moneyin-empty");
  await signInAs(page, user);
  await expect(page.getByRole("heading", { level: 1, name: "Nothing waiting" })).toBeVisible();
  await expect(page.getByText("Money from any source shows up here: salary, scholarship, side hustle, allowance.")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("₱");
  await page.goto("/money-in?add=1");
  await expect(page.getByLabel("Amount received")).toBeFocused();
});
