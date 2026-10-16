import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../../lib/database.types";
import { isoDateIn } from "../../lib/data/money-in-model";
import { TZ_COOKIE } from "../../lib/time";
import { adminClient, createTestUser, eventsFor, TEST_PASSWORD, TEST_TIME_ZONE, type TestUser } from "./helpers/supabase";
import { signInAs } from "./helpers/money-in";

/**
 * Settings (ticket 37, P-13). Needs the 20261016000200 migration on the local database.
 * The user finishes the real allowance onboarding (just tracking, Simple view) through `finish_onboarding`, so
 * the amount and rhythm are stored the way the app stores them.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const DAY = 86_400_000;
const inDays = (n: number) => isoDateIn(Date.now() + n * DAY, TEST_TIME_ZONE);
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

function allowanceDraft(uid: string, nextDate: string) {
  const cash = `${uid}-cash`;
  return {
    v: 1,
    path: "web",
    step: "money",
    skipped: true,
    planOnly: false,
    firstName: "Mika",
    pattern: "allowance",
    rhythm: { amountMinor: 150000, frequency: "weekly", nextDate },
    firstMoney: { amountMinor: 200000, extra: {}, keepMinor: 30000 },
    income: { kind: "allowance", amountMinor: 150000, frequency: "weekly", nextPayday: nextDate, paidInOtherCurrency: false },
    sources: [{ key: "main", name: "Allowance", kind: "allowance", rule: "plan", wholeBucket: null, ownSplit: null, landsInAccountId: cash, categoryId: null, isMain: true }],
    accounts: [{ id: cash, name: "Cash", type: "cash", currency: "PHP", isNew: true }],
    landingAccountId: cash,
    priority: null,
    goal: null,
    billsMinor: 0,
    billKinds: [],
    billsStart: null,
    preset: "suggested",
    planA: null,
    planEdited: false,
    planInputsSig: null,
    planBOn: true,
    targetMinor: null,
    homes: null,
    homesUserSet: [],
    categories: null,
    firstPay: { choice: null, entryId: null, amountMinor: null, date: null, splitConfirmed: false, ticked: [], reminder: "none" },
  };
}

/** A user who finished the allowance path: just tracking, Simple view, a weekly 1,500 due in 7 days. */
async function allowanceUser(page: Page, next = "/settings"): Promise<TestUser> {
  const user = await createTestUser("settings", { onboarded: false });
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
  if (signed.error) throw new Error(signed.error.message);
  const done = await client.rpc("finish_onboarding", { p_draft: allowanceDraft(user.id.slice(0, 8), inDays(7)) as never });
  if (done.error) throw new Error(`finish_onboarding: ${done.error.message}`);
  await signInAs(page, user, next);
  const origin = new URL(page.url()).origin;
  await page.context().addCookies([{ name: TZ_COOKIE, value: TEST_TIME_ZONE, url: origin }]);
  return user;
}

const profile = async (id: string) => {
  const { data, error } = await adminClient().from("user_profiles").select("*").eq("user_id", id).single();
  if (error) throw new Error(error.message);
  return data;
};

test("onboarding keeps what you told it: Settings shows the amount, rhythm and date", async ({ page }) => {
  const errors = watchConsole(page);
  const user = await allowanceUser(page);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("About how much do you usually get?")).toHaveValue("1,500");
  await expect(page.getByRole("radio", { name: "Weekly" })).toBeChecked();
  await expect(page.getByLabel("Next money arrives")).toHaveValue(inDays(7));
  await expect(page.getByTestId("per-day-line")).toHaveText("About ₱214.28 a day.");
  const p = await profile(user.id);
  expect(p).toMatchObject({ payAmountMinor: 150000, payRhythm: "weekly", payFrequency: "weekly", viewMode: "simple" });
  expect(await noHorizontalScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("edit money coming in: amount, Every few months and a date persist, Simple Today's until line follows", async ({ page }) => {
  const errors = watchConsole(page);
  const user = await allowanceUser(page);
  const save = page.getByTestId("settings-income").getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled();

  await page.getByLabel("About how much do you usually get?").fill("9,000");
  await page.getByText("Every few months", { exact: true }).click();
  await page.getByLabel("Next money arrives").fill(inDays(30));
  await expect(page.getByTestId("per-day-line")).toHaveText("About ₱98.90 a day."); // 9,000 / 91 days
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByTestId("settings-income").getByText("Saved", { exact: true })).toBeVisible();
  await expect(save).toBeDisabled();

  const p = await profile(user.id);
  expect(p).toMatchObject({ payAmountMinor: 900000, payRhythm: "quarterly", payFrequency: "varies", nextPaydayDate: inDays(30), spendUntil: inDays(30) });
  expect(await eventsFor(user.id, "settings_changed")).toHaveLength(1);

  await page.reload();
  await expect(page.getByLabel("About how much do you usually get?")).toHaveValue("9,000");
  await expect(page.getByRole("radio", { name: "Every few months" })).toBeChecked();
  await expect(page.getByLabel("Next money arrives")).toHaveValue(inDays(30));

  await page.goto("/today");
  await expect(page.getByTestId("hero")).toHaveAttribute("data-days-until", "30");

  // Not sure clears the date and the "last until" date with it.
  await page.goto("/settings");
  await page.getByLabel("Not sure").check();
  await expect(page.getByLabel("Next money arrives")).toHaveValue("");
  await page.getByTestId("settings-income").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("settings-income").getByText("Saved", { exact: true })).toBeVisible();
  expect(await profile(user.id)).toMatchObject({ nextPaydayDate: null, spendUntil: null, payAmountMinor: 900000 });
  expect(errors).toEqual([]);
});

test("a bad amount keeps what you typed and says what to fix; a past date is refused", async ({ page }) => {
  const user = await allowanceUser(page);
  const card = page.getByTestId("settings-income");
  await page.getByLabel("About how much do you usually get?").fill("12abc");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByRole("alert").filter({ hasText: "Enter an amount like 1,500." })).toBeVisible();
  await expect(page.getByLabel("About how much do you usually get?")).toHaveValue("12abc");
  await page.getByLabel("About how much do you usually get?").fill("1,500");
  await page.getByLabel("Next money arrives").fill(inDays(-3));
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByRole("alert").filter({ hasText: "Pick today or a later date" })).toBeVisible();
  expect((await profile(user.id)).nextPaydayDate).toBe(inDays(7));
});

test("kept-aside bucket: the picker lists saving buckets only and the choice is saved", async ({ page }) => {
  const user = await allowanceUser(page);
  const card = page.getByTestId("settings-buckets");
  const pick = card.getByLabel("Kept aside goes to");
  // allTextContents does not wait: let the picker render its options first
  await expect.poll(() => pick.locator("option").count()).toBeGreaterThanOrEqual(2);
  const names = await pick.locator("option").allTextContents();
  expect(names).not.toContain("Spending");
  expect(names.length).toBeGreaterThanOrEqual(2);
  const other = names.find((n) => n !== names[0])!;
  await pick.selectOption({ label: other });
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Saved", { exact: true })).toBeVisible();
  const { data: b } = await adminClient().from("buckets").select("id").eq("user_id", user.id).eq("name", other).single();
  expect((await profile(user.id)).keepBucketId).toBe(b!.id);
  await page.reload();
  await expect(page.getByTestId("settings-buckets").getByLabel("Kept aside goes to")).toHaveValue(b!.id);
  // the bucket list shows every live bucket
  await expect(page.getByTestId("settings-bucket-list").getByRole("listitem")).toHaveCount(names.length + 1);
});

test("week start: saved, Review day only in Full view", async ({ page }) => {
  const user = await allowanceUser(page);
  const card = page.getByTestId("settings-week");
  await expect(card.getByText("Review day")).toHaveCount(0); // Simple view has no Review loop
  await card.getByRole("radiogroup", { name: "Week starts on" }).getByRole("radio", { name: "Sunday" }).click();
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Saved", { exact: true })).toBeVisible();
  expect(await profile(user.id)).toMatchObject({ weekStartsOn: 0 });

  // switch to Full: the Review day chips appear; pick Friday
  await page.getByTestId("settings-view").getByRole("radio", { name: "Full" }).click();
  await expect(page.getByTestId("settings-view").getByText("Saved", { exact: true })).toBeVisible();
  await expect(card.getByText("Review day")).toBeVisible();
  await card.getByRole("radio", { name: "Friday" }).check({ force: true });
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Saved", { exact: true })).toBeVisible();
  expect(await profile(user.id)).toMatchObject({ weekStartsOn: 0, reviewDay: 5, viewMode: "full" });
  await page.reload();
  await expect(page.getByRole("radiogroup", { name: "Week starts on" }).getByRole("radio", { name: "Sunday" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("settings-week").getByRole("radio", { name: "Friday" })).toBeChecked();
  // Today and Review still load after the change
  await page.goto("/review");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("view toggle round trip from Settings changes Today", async ({ page }) => {
  const user = await allowanceUser(page);
  const view = page.getByTestId("settings-view");
  await expect(view.getByRole("radio", { name: "Simple" })).toHaveAttribute("aria-checked", "true");
  await view.getByRole("radio", { name: "Full" }).click();
  await expect(view.getByRole("radio", { name: "Full" })).toHaveAttribute("aria-checked", "true");
  expect((await profile(user.id)).viewMode).toBe("full");
  await page.goto("/today");
  await expect(page.getByTestId("hero")).toHaveCount(0);
  await page.goto("/settings");
  await page.getByTestId("settings-view").getByRole("radio", { name: "Simple" }).click();
  await expect(page.getByTestId("settings-view").getByRole("radio", { name: "Simple" })).toHaveAttribute("aria-checked", "true");
  await page.goto("/today");
  await expect(page.getByTestId("hero")).toBeVisible();
});

test("About you: the first name is saved and can be cleared", async ({ page }) => {
  const user = await allowanceUser(page);
  const card = page.getByTestId("settings-about");
  await expect(card.getByLabel("First name")).toHaveValue("Mika");
  await card.getByLabel("First name").fill("  Mika J  ");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Saved", { exact: true })).toBeVisible();
  expect((await profile(user.id)).firstName).toBe("Mika J");
  await card.getByLabel("First name").fill("");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Saved", { exact: true })).toBeVisible();
  expect((await profile(user.id)).firstName).toBeNull();
});

test("avatar menu opens Settings", async ({ page }) => {
  await allowanceUser(page, "/today");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.waitForURL("**/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
});

test("a just-tracking user can rename a bucket and set split percentages from Edit buckets and split", async ({ page }) => {
  const errors = watchConsole(page);
  const user = await allowanceUser(page);
  expect((await profile(user.id)).planMode).toBe("track");
  await page.getByRole("link", { name: "Edit buckets and split" }).click();
  await page.waitForURL("**/plans/split");
  await expect(page.getByText("Couldn't load your plan")).toHaveCount(0);

  // rename a bucket
  await page.getByRole("button", { name: "Edit Spending" }).click();
  const form = page.getByRole("form", { name: "Edit Spending" });
  await form.getByLabel("Name", { exact: true }).fill("Daily money");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Edit Daily money" })).toBeVisible();
  const { data: renamed } = await adminClient().from("buckets").select("name").eq("user_id", user.id).eq("name", "Daily money");
  expect(renamed).toHaveLength(1);

  // split percentages: 80 / 20
  await page.getByLabel("Daily money percent").fill("80");
  await page.getByLabel("Emergency fund percent").fill("20");
  await expect(page.getByTestId("plan-total")).toContainText("100%");
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByRole("button", { name: "Save plan" })).toBeDisabled();
  const { data: lines } = await adminClient().from("allocation_plan_lines").select("percentBp, buckets(name)").eq("user_id", user.id).is("deletedAt", null);
  const by = Object.fromEntries((lines ?? []).map((l) => [(l.buckets as unknown as { name: string }).name, l.percentBp]));
  expect(by["Daily money"]).toBe(8000);
  expect(by["Emergency fund"]).toBe(2000);

  // Settings shows the new name and shares
  await page.goto("/settings");
  const list = page.getByTestId("settings-bucket-list");
  await expect(list).toContainText("Daily money");
  await expect(list).toContainText("80%");
  expect(errors).toEqual([]);
});

test("a user with no plan at all can still reach buckets and start a plan", async ({ page }) => {
  const user = await allowanceUser(page, "/plans/split");
  const db = adminClient();
  await db.from("allocation_plan_lines").update({ deletedAt: Date.now() }).eq("user_id", user.id);
  await db.from("allocation_plans").update({ deletedAt: Date.now() }).eq("user_id", user.id);
  await page.reload();
  await expect(page.getByTestId("no-plan")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Spending" })).toBeVisible();
  await page.getByRole("button", { name: "Start a plan" }).click();
  await page.getByLabel("Plan name").fill("My plan");
  await page.getByLabel("Spending percent").fill("100");
  await page.getByRole("button", { name: "Create plan" }).click();
  await expect(page.getByRole("button", { name: /My plan/ })).toHaveAttribute("aria-pressed", "true");
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("Settings has no horizontal scroll with every section filled", async ({ page }) => {
  await allowanceUser(page);
  await page.getByTestId("settings-view").getByRole("radio", { name: "Full" }).click();
  await expect(page.getByTestId("settings-week").getByText("Review day")).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  for (const id of ["income", "week", "buckets", "about", "view"]) await expect(page.getByTestId(`settings-${id}`)).toBeVisible();
});
