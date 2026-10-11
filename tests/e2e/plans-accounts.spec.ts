import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../../lib/database.types";
import { formatPeso } from "../../lib/money";
import { adminClient, createTestUser, eventsFor, type TestUser } from "./helpers/supabase";

/**
 * Plans -> Accounts, Categories, Goals (ticket 13). Needs the local Supabase stack, like the other specs.
 * Each project (390/1440, light/dark) gets its own user and runs this file serially, because the tests change data.
 */
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "serial" });

let user: TestUser;
const ids = (key: string) => `${key}-${user.id.slice(0, 8)}`;

async function seed(userId: string) {
  const db = adminClient();
  const now = Date.now();
  const base = { user_id: userId, createdAt: now, updatedAt: now };
  const mobile = { ...base, syncStatus: 2, deletedAt: null };
  const must = (label: string, error: { message: string } | null) => {
    if (error) throw new Error(`seed ${label}: ${error.message}`);
  };
  must("profile", (await db.from("user_profiles").upsert({ user_id: userId, firstName: "Plans", homeCurrency: "PHP", weekStartsOn: 1 })).error);
  const acct = (key: string, name: string, type: number, order: number) => ({
    ...mobile,
    id: ids(key),
    name,
    accountType: type,
    openingBalanceMinor: 0,
    currency: "PHP",
    icon: "wallet",
    color: null,
    displayOrder: order,
    isArchived: false,
  });
  must("accounts", (await db.from("accounts").insert([acct("main", "Main bank", 1, 0), acct("spare", "Spare wallet", 3, 1)])).error);

  // let the database pick bucket ids and read them back
  const { data: buckets, error } = await db
    .from("buckets")
    .insert([
      { user_id: userId, name: "Living", groupKey: "spend", hue: "living", keptInAccountId: ids("main"), displayOrder: 1 },
      { user_id: userId, name: "Fun", groupKey: "spend", hue: "fun", keptInAccountId: ids("main"), displayOrder: 2 },
      { user_id: userId, name: "Emergency fund", groupKey: "save", hue: "emergency", keptInAccountId: ids("main"), displayOrder: 3 },
    ])
    .select("id, name");
  must("buckets", error);
  const b = Object.fromEntries((buckets ?? []).map((x) => [x.name, x.id]));

  const cat = (key: string, name: string, order: number) => ({ ...mobile, id: ids(key), name, categoryType: 1, icon: "tag", color: "#f08a6c", displayOrder: order, isSystem: false });
  must("categories", (await db.from("categories").insert([cat("groc", "Groceries", 0), cat("stream", "Streaming", 1)])).error);
  // map BEFORE the entry so the trigger snapshots it into Living
  must(
    "category_buckets",
    (
      await db.from("category_buckets").insert([
        { user_id: userId, categoryId: ids("groc"), bucketId: b["Living"], source: "user" },
        { user_id: userId, categoryId: ids("stream"), bucketId: b["Fun"], source: "user" },
      ])
    ).error,
  );
  must(
    "entry",
    (
      await db.from("ledger_entries").insert({
        ...mobile,
        id: ids("e1"),
        accountId: ids("main"),
        categoryId: ids("groc"),
        amountMinor: 15_000,
        direction: 1,
        origin: 0,
        occurredAt: now,
        note: null,
        metadataJson: null,
        debtId: null,
        splitId: null,
        transferId: null,
        recurringInstanceId: null,
      })
    ).error,
  );
  must(
    "rule",
    (await db.from("allocation_rules").insert({ user_id: userId, kind: "switch_on_goal", params: { fromPlan: "A", toPlan: "B", bucketId: b["Emergency fund"], targetMinor: 5_000_000 } })).error,
  );
  must(
    "goals",
    (
      await db.from("goals").insert([
        { user_id: userId, name: "Emergency fund", targetMinor: 5_000_000, linkedBucketId: b["Emergency fund"], isPlanSwitch: true },
        { user_id: userId, name: "PC Build", targetMinor: 8_000_000 },
      ])
    ).error,
  );
}

async function signIn(page: Page) {
  await page.goto("/sign-in?next=%2Fplans%2Faccounts");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/plans\/accounts$/);
}

test.beforeAll(async ({}, info) => {
  user = await createTestUser(`plans-${info.project.name}`);
  await seed(user.id);
});

test.beforeEach(async ({ page }) => signIn(page));

test("accounts: in-use accounts say why and have no Archive; free ones archive and restore", async ({ page }) => {
  const main = page.getByRole("listitem").filter({ hasText: "Main bank" });
  await expect(main).toContainText("Living is kept here");
  await expect(main.getByRole("button", { name: /Archive/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Archive Spare wallet" }).click();
  await expect(page.getByTestId("accounts-rows")).not.toContainText("Spare wallet");
  const archived = page.getByTestId("archived-accounts");
  await expect(archived).toContainText("Spare wallet");
  await archived.getByRole("button", { name: "Restore Spare wallet" }).click();
  await expect(page.getByTestId("accounts-rows")).toContainText("Spare wallet");
});

test("accounts: add with a duplicate name is refused inline, then a new account is added", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add account" }).click();
  await page.getByLabel("Name").fill("main bank");
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText(/already have an account called main bank/)).toBeVisible();
  await page.getByLabel("Name").fill("AUD savings");
  await page.getByLabel("Currency").selectOption("AUD");
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "AUD savings" })).toContainText("AUD");
});

test("accounts: renaming keeps references (the bucket chip still shows under the renamed account)", async ({ page }) => {
  const name = page.getByRole("textbox", { name: "Account name for Main bank" });
  await name.fill("Main bank (renamed)");
  await name.blur();
  await expect(page.getByRole("textbox", { name: "Account name for Main bank (renamed)" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Main bank (renamed)" })).toContainText("Living");
});

test("archive is refused by the database even when the UI is bypassed", async () => {
  const anon = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const signed = await anon.auth.signInWithPassword({ email: user.email, password: user.password });
  expect(signed.error).toBeNull();
  const r = await anon.rpc("archive_account", { p_account: ids("main") });
  expect(r.error?.code).toBe("P0001");
  expect(r.error?.message).toMatch(/^in use:/);
  const row = await adminClient().from("accounts").select("isArchived").eq("id", ids("main")).single();
  expect(row.data?.isArchived).toBe(false);
});

test("categories: grouped by bucket, 'Has entries' blocks Remove, an empty one can be added and removed", async ({ page }) => {
  await page.goto("/plans/categories");
  const living = page.getByTestId("cat-group-Living");
  await expect(living.getByTestId("group-spent")).toContainText(`${formatPeso(15_000)} spent in`);
  await expect(living).toContainText("Has entries");
  await expect(living.getByRole("button", { name: "Remove Groceries" })).toHaveCount(0);

  const fun = page.getByTestId("cat-group-Fun");
  await fun.getByRole("textbox", { name: "New category in Fun" }).fill("Games");
  await fun.getByRole("button", { name: "Add category to Fun" }).click();
  await expect(fun.getByRole("textbox", { name: "Category name for Games" })).toBeVisible();
  await fun.getByRole("button", { name: "Remove Games" }).click();
  await expect(fun.getByRole("textbox", { name: "Category name for Games" })).toHaveCount(0);
});

test("categories: moving one leaves old spending behind with a 'logged before the move' line", async ({ page }) => {
  await page.goto("/plans/categories");
  await page.getByRole("combobox", { name: "Move Groceries to" }).selectOption({ label: "Move to Fun" });
  const living = page.getByTestId("cat-group-Living");
  await expect(living.getByTestId("moved-line")).toContainText(`${formatPeso(15_000)} from Groceries (now in Fun), logged before the move`);
  await expect(page.getByTestId("cat-group-Fun")).toContainText("Groceries");
  // nothing from before the move jumped to Fun
  await expect(page.getByTestId("cat-group-Fun").getByTestId("group-spent")).not.toContainText(formatPeso(15_000));
});

test("goals: retarget Emergency (it is the Plan B switch too), add, archive, restore", async ({ page }) => {
  await page.goto("/plans/goals");
  const em = page.getByRole("listitem").filter({ hasText: "Emergency fund" }).first();
  await expect(em.getByTestId("goal-saved")).toContainText(`${formatPeso(0)} saved`);
  await expect(page.getByRole("button", { name: "Archive Emergency fund" })).toHaveCount(0);

  const target = page.getByLabel("Emergency fund target");
  await target.fill("60,000");
  await target.blur();
  await expect(em.getByTestId("goal-saved")).toContainText(`of ${formatPeso(6_000_000)}`);
  const rule = await adminClient().from("allocation_rules").select("params").eq("user_id", user.id).eq("kind", "switch_on_goal").single();
  expect((rule.data?.params as { targetMinor: number }).targetMinor).toBe(6_000_000);
  expect((await eventsFor(user.id, "plan_edited")).some((e) => (e.props as { field?: string }).field === "target")).toBe(true);

  await page.getByRole("button", { name: "+ Add a goal" }).click();
  await page.getByLabel("Name").fill("Trip");
  await page.getByLabel("Target").fill("30,000");
  await page.getByRole("button", { name: "Add goal" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Trip" })).toContainText(`of ${formatPeso(3_000_000)}`);

  await page.getByRole("button", { name: "Archive Trip" }).click();
  await page.getByTestId("archived-goals").getByRole("button", { name: "Restore Trip" }).click();
  await expect(page.getByTestId("goal-rows")).toContainText("Trip");
});

for (const path of ["/plans/accounts", "/plans/categories", "/plans/goals"]) {
  test(`${path}: no horizontal overflow and no console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(scroll).toBeLessThanOrEqual(inner);
    expect(errors).toEqual([]);
  });
}
