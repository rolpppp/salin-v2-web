import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../../lib/database.types";
import { formatPeso } from "../../lib/money";
import { adminClient, createTestUser, type TestUser } from "./helpers/supabase";

/**
 * Starting money (ticket 38), the owner's case: GCash keeps Spending + Fun, MariBank keeps Emergency + Buffer + Goals,
 * GoTrade keeps Investment, Cash keeps no bucket, and every account already holds money from before the plan.
 * Run with NEXT_PUBLIC_ONBOARDING_ENABLED=false like the other Today specs.
 */
test.use({ storageState: { cookies: [], origins: [] } });

type Seeded = { ids: Record<string, string>; k: (s: string) => string };

async function seed(user: TestUser, opts: { sort?: boolean } = {}): Promise<Seeded> {
  const db = adminClient();
  const now = Date.now();
  const k = (s: string) => `${s}-${user.id.slice(0, 8)}`;
  const mobile = { user_id: user.id, createdAt: now, updatedAt: now, syncStatus: 2, deletedAt: null };
  const must = (label: string, error: { message: string } | null) => {
    if (error) throw new Error(`seed ${label}: ${error.message}`);
  };
  must("profile", (await db.from("user_profiles").upsert({ user_id: user.id, firstName: "Sol", homeCurrency: "PHP", weekStartsOn: 1, planMode: "plan" })).error);
  const acct = (key: string, name: string, type: number, order: number, opening: number) => ({
    ...mobile,
    id: k(key),
    name,
    accountType: type,
    openingBalanceMinor: opening,
    currency: "PHP",
    icon: "wallet",
    color: null,
    displayOrder: order,
    isArchived: false,
  });
  must("accounts", (await db.from("accounts").insert([acct("gc", "GCash", 3, 1, 1_500_000), acct("bank", "MariBank", 1, 2, 2_000_000), acct("gt", "GoTrade", 6, 3, 500_000), acct("cash", "Cash", 0, 4, 300_000)])).error);
  const { data: buckets, error } = await db
    .from("buckets")
    .insert([
      { user_id: user.id, name: "Spending", groupKey: "spend", hue: "living", keptInAccountId: k("gc"), displayOrder: 1 },
      { user_id: user.id, name: "Fun money", groupKey: "spend", hue: "fun", keptInAccountId: k("gc"), displayOrder: 2 },
      { user_id: user.id, name: "Emergency fund", groupKey: "save", hue: "emergency", keptInAccountId: k("bank"), displayOrder: 3 },
      { user_id: user.id, name: "Buffer", groupKey: "set_aside", hue: "buffer", keptInAccountId: k("bank"), displayOrder: 4 },
      { user_id: user.id, name: "Goals", groupKey: "save", hue: "goals", keptInAccountId: k("bank"), displayOrder: 5 },
      { user_id: user.id, name: "Investment", groupKey: "save", hue: "invest", keptInAccountId: k("gt"), displayOrder: 6 },
    ])
    .select("id, name");
  must("buckets", error);
  const ids = Object.fromEntries((buckets ?? []).map((x) => [x.name, x.id]));

  // Plan A: Spending 40, Fun 10, Emergency 30, Buffer 5, Goals 5, Investment 10.
  const { data: plan, error: planErr } = await db.from("allocation_plans").insert({ user_id: user.id, key: "A", name: "Plan A" }).select("id").single();
  must("plan", planErr);
  must(
    "plan lines",
    (
      await db.from("allocation_plan_lines").insert([
        { user_id: user.id, planId: plan!.id, bucketId: ids["Spending"]!, percentBp: 4000 },
        { user_id: user.id, planId: plan!.id, bucketId: ids["Fun money"]!, percentBp: 1000 },
        { user_id: user.id, planId: plan!.id, bucketId: ids["Emergency fund"]!, percentBp: 3000 },
        { user_id: user.id, planId: plan!.id, bucketId: ids["Buffer"]!, percentBp: 500 },
        { user_id: user.id, planId: plan!.id, bucketId: ids["Goals"]!, percentBp: 500 },
        { user_id: user.id, planId: plan!.id, bucketId: ids["Investment"]!, percentBp: 1000 },
      ])
    ).error,
  );

  if (opts.sort) {
    const anon = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    must("sign in", (await anon.auth.signInWithPassword({ email: user.email, password: user.password })).error);
    const line = (bucket: string, account: string, amountMinor: number) => ({ bucketId: ids[bucket], accountId: k(account), amountMinor });
    must(
      "start_buckets",
      (
        await anon.rpc("start_buckets", {
          p_lines: [
            line("Spending", "gc", 1_200_000),
            line("Fun money", "gc", 300_000),
            line("Emergency fund", "bank", 1_500_000),
            line("Buffer", "bank", 250_000),
            line("Goals", "bank", 250_000),
            line("Investment", "gt", 500_000),
            line("Spending", "cash", 300_000),
          ],
        })
      ).error,
    );
  }
  return { ids, k };
}

async function signIn(page: Page, user: TestUser) {
  await page.goto("/sign-in?next=%2Ftoday");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/today");
}

const row = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByRole("textbox", { name: `Account name for ${name}` }) });
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("accounts show the real balance and the gap; the card is pre-filled by plan; edit, save, buckets fill, gaps close, undo restores", async ({ page }, info) => {
  const user = await createTestUser(`start-${info.project.name}`);
  await seed(user);
  await signIn(page, user);

  // Today: every bucket is at 0 while the accounts hold money.
  const card = page.getByTestId("start-money");
  await expect(card).toBeVisible();
  await expect(card).toContainText(`${formatPeso(4_300_000)} sits in your accounts but isn't in any bucket`);
  await expect(page.getByTestId("slot-emergency").getByTestId("slot-amount")).toHaveText(formatPeso(0));

  // Pre-filled per P-14.
  const gc = card.getByTestId("start-group-GCash");
  const bank = card.getByTestId("start-group-MariBank");
  const cash = card.getByTestId("start-group-Cash");
  await expect(gc.getByLabel("Spending")).toHaveValue("12,000");
  await expect(gc.getByLabel("Fun money")).toHaveValue("3,000");
  await expect(bank.getByLabel("Emergency fund")).toHaveValue("15,000");
  await expect(bank.getByLabel("Buffer")).toHaveValue("2,500");
  await expect(bank.getByLabel("Goals")).toHaveValue("2,500");
  await expect(card.getByTestId("start-group-GoTrade").getByLabel("Investment")).toHaveValue("5,000");
  await expect(cash.getByLabel("Spending")).toHaveValue("3,000"); // Cash keeps no bucket: all to Spending
  await expect(cash.getByTestId("start-left")).toHaveText(`${formatPeso(0)} left to sort`);
  expect(await noSideScroll(page)).toBe(true);

  // Plans -> Accounts: real balance, "by your buckets", and the gap chip.
  await page.goto("/plans/accounts");
  await expect(row(page, "GCash").getByTestId("holds")).toHaveText(formatPeso(1_500_000));
  await expect(row(page, "GCash").getByTestId("by-buckets")).toContainText(`${formatPeso(0)} by your buckets`);
  await expect(row(page, "GCash").getByTestId("gap-chip")).toHaveText(`${formatPeso(1_500_000)} not in a bucket yet`);
  await expect(row(page, "Cash").getByTestId("gap-chip")).toHaveText(`${formatPeso(300_000)} not in a bucket yet`);
  await expect(page.getByTestId("start-money")).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);

  // Edit one amount (GCash: Spending 11,000 + Fun 4,000), too much is caught, then fix and save.
  await page.goto("/today");
  const c2 = page.getByTestId("start-money");
  const gc2 = c2.getByTestId("start-group-GCash");
  await gc2.getByLabel("Spending").fill("11,000");
  await expect(gc2.getByTestId("start-left")).toHaveText(`${formatPeso(100_000)} left to sort`);
  await gc2.getByLabel("Fun money").fill("5,000");
  await expect(gc2.getByTestId("start-left")).toHaveText(`${formatPeso(100_000)} more than is in GCash`);
  await c2.getByTestId("start-submit").click();
  await expect(c2.getByRole("alert").filter({ hasText: "more than the" })).toContainText(`${formatPeso(1_500_000)} in GCash`);
  await gc2.getByLabel("Fun money").fill("4,000");
  await c2.getByTestId("start-submit").click();

  await expect(page.getByTestId("start-done")).toContainText(`Sorted ${formatPeso(4_300_000)} into your buckets.`);
  await expect(page.getByTestId("slot-living").getByTestId("slot-amount")).toHaveText(formatPeso(1_400_000)); // 11,000 + Cash 3,000
  await expect(page.getByTestId("slot-fun").getByTestId("slot-amount")).toHaveText(formatPeso(400_000));
  await expect(page.getByTestId("slot-emergency").getByTestId("slot-amount")).toHaveText(formatPeso(1_500_000));
  await expect(page.getByTestId("slot-invest").getByTestId("slot-amount")).toHaveText(formatPeso(500_000));

  // Gaps are gone on Accounts.
  await page.goto("/plans/accounts");
  await expect(row(page, "GCash").getByTestId("by-buckets")).toContainText(`${formatPeso(1_500_000)} by your buckets`);
  await expect(page.getByTestId("gap-chip")).toHaveCount(0);
  await expect(page.getByTestId("start-money")).toHaveCount(0);

});

test("Undo right after Save puts the money back", async ({ page }, info) => {
  const user = await createTestUser(`start-undo-${info.project.name}`);
  await seed(user);
  await signIn(page, user);
  await page.getByTestId("start-submit").click();
  await expect(page.getByTestId("start-done")).toBeVisible();
  await expect(page.getByTestId("slot-emergency").getByTestId("slot-amount")).toHaveText(formatPeso(1_500_000));
  await page.getByTestId("start-undo").click();
  await expect(page.getByTestId("start-done")).toHaveCount(0);
  await expect(page.getByTestId("start-money")).toBeVisible();
  await expect(page.getByTestId("slot-emergency").getByTestId("slot-amount")).toHaveText(formatPeso(0));
  await page.goto("/plans/accounts");
  await expect(row(page, "GCash").getByTestId("gap-chip")).toHaveText(`${formatPeso(1_500_000)} not in a bucket yet`);
});

test("move between buckets kept in different accounts: capped at what is left, reminds about the apps, Accounts shows the gap", async ({ page }, info) => {
  const user = await createTestUser(`start-move-${info.project.name}`);
  await seed(user, { sort: true });
  await signIn(page, user);
  await expect(page.getByTestId("start-money")).toHaveCount(0);
  await expect(page.getByTestId("slot-emergency").getByTestId("slot-amount")).toHaveText(formatPeso(1_500_000));

  await page.getByTestId("slot-emergency").click();
  const drawer = page.getByRole("dialog", { name: "Emergency fund" });
  await expect(drawer.getByTestId("drawer-lines")).toContainText("Money you already had in MariBank");
  await drawer.getByTestId("drawer-move").click();
  await drawer.getByTestId("move-target").selectOption({ label: "Fun money" });
  await drawer.getByLabel("Amount").fill("20,000");
  await drawer.getByTestId("move-submit").click();
  await expect(drawer.getByRole("alert").filter({ hasText: "Enter that or less" })).toContainText(`has ${formatPeso(1_500_000)} left`);
  await drawer.getByLabel("Amount").fill("1,000");
  await expect(drawer.getByTestId("move-reminder")).toHaveText("Also move ₱1,000.00 from MariBank to GCash in your apps. Accounts will show the difference until the balances match.");
  expect(await noSideScroll(page)).toBe(true);
  await drawer.getByTestId("move-submit").click();
  await expect(drawer.getByTestId("move-done")).toContainText("Moved ₱1,000.00 from Emergency fund to Fun money.");
  await expect(drawer.getByTestId("drawer-left")).toHaveText(formatPeso(1_400_000));
  await expect(drawer.getByTestId("drawer-lines")).toContainText("Moved to Fun money");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("slot-fun").getByTestId("slot-amount")).toHaveText(formatPeso(400_000));

  // Accounts: GCash is short of what its buckets say, MariBank has money no bucket counts.
  await page.goto("/plans/accounts");
  await expect(row(page, "GCash").getByTestId("gap-chip")).toHaveText(`${formatPeso(100_000)} less than your buckets say`);
  await expect(row(page, "MariBank").getByTestId("gap-chip")).toHaveText(`${formatPeso(100_000)} not in a bucket yet`);
});

test("Remove a starting-money line from the bucket's history says what it will do first", async ({ page }, info) => {
  const user = await createTestUser(`start-remove-${info.project.name}`);
  await seed(user, { sort: true });
  await signIn(page, user);
  await page.getByTestId("slot-invest").click();
  const drawer = page.getByRole("dialog", { name: "Investment" });
  await drawer.getByTestId("start-remove").click();
  await expect(drawer).toContainText(`This takes ${formatPeso(500_000)} out of Investment.`);
  await drawer.getByTestId("start-remove-confirm").click();
  await expect(page.getByTestId("slot-invest").getByTestId("slot-amount")).toHaveText(formatPeso(0));
  await page.goto("/plans/accounts");
  await expect(row(page, "GoTrade").getByTestId("gap-chip")).toHaveText(`${formatPeso(500_000)} not in a bucket yet`);
});
