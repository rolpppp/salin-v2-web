import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { isoDateIn } from "../../lib/data/money-in-model";
import type { OnboardingDraft } from "../../lib/onboarding/draft";
import { adminClient, createTestUser, eventsFor, TEST_TIME_ZONE, type TestUser } from "./helpers/supabase";

// Each test makes its own user: the four projects run in parallel and these tests write.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * The web path's Income and Accounts steps belong to ticket 20, so these specs seed the saved draft the way those steps
 * will leave it (the O1 draft of supabase/tests/61_finish_onboarding.sql: ₱25,000 twice a month, BPI lands, O6 homes
 * -> 4 transfers) and resume at First pay.
 */
function o1Draft(prefix: string): OnboardingDraft {
  const id = (n: string) => `${prefix}-${n}`;
  const account = (n: string, name: string, type: OnboardingDraft["accounts"][number]["type"]) => ({ id: id(n), name, type, currency: "PHP" as const, isNew: true });
  return {
    v: 1,
    path: "web",
    step: "first",
    skipped: false,
    planOnly: false,
    firstName: "Rolf",
    income: { kind: "salary", amountMinor: 2_500_000, frequency: "twice", nextPayday: isoDateIn(Date.now() + 9 * 86_400_000, TEST_TIME_ZONE), paidInOtherCurrency: false },
    sources: [{ key: "main", name: "Salary", kind: "salary", rule: "plan", wholeBucket: null, ownSplit: null, landsInAccountId: id("bpi"), categoryId: null, isMain: true }],
    accounts: [account("gcash", "GCash", "eWallet"), account("bpi", "BPI", "bank"), account("maya", "Maya", "eWallet"), account("tonik", "Tonik", "savings"), account("mp2", "Pag-IBIG MP2", "investment")],
    landingAccountId: id("bpi"),
    priority: "safety",
    goal: null,
    billsMinor: 600_000,
    billKinds: ["rent"],
    billsStart: null,
    preset: "suggested",
    planA: { living: 38, rent: 12, fun: 10, emergency: 25, invest: 5, sinking: 10, tax: 0, buffer: 0 },
    planEdited: false,
    planInputsSig: null,
    planBOn: true,
    targetMinor: 7_500_000,
    homes: { living: id("gcash"), fun: id("maya"), rent: id("bpi"), tax: id("bpi"), buffer: id("bpi"), emergency: id("tonik"), sinking: id("tonik"), invest: id("mp2") },
    homesUserSet: [],
    categories: null,
    firstPay: { choice: null, entryId: null, amountMinor: null, date: null, splitConfirmed: false, ticked: [], reminder: "none" },
  };
}

async function seedDraft(user: TestUser) {
  const draft = o1Draft(`e2e${randomUUID().slice(0, 8)}`);
  const { error } = await adminClient().from("user_profiles").upsert({ user_id: user.id, onboardingDraft: draft as never }, { onConflict: "user_id" });
  if (error) throw new Error(`seed draft: ${error.message}`);
  return draft;
}

async function signIn(page: Page, user: TestUser, next: string) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${next}`);
}

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const primary = (page: Page) => page.locator("#ob-primary");
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("web path First pay: yes, split, move the money, Done", async ({ page }) => {
  const user = await createTestUser("ob-fp-yes");
  await seedDraft(user);
  await signIn(page, user, "/welcome/first");

  await expect(page.getByText("Step 6 of 6 · First pay")).toBeVisible();
  await expect(heading(page)).toHaveText("Has money come in since your last payday?");
  await expect(heading(page)).toBeFocused();
  await expect(page.getByRole("button", { name: "Not yet" })).toBeVisible();
  await page.getByRole("button", { name: "Yes, I'll add it" }).click();

  // The form: the usual amount is prefilled, the date defaults to today and can't be in the future.
  await expect(heading(page)).toHaveText("What came in?");
  await expect(page.getByLabel("Amount received")).toHaveValue("25,000");
  const today = isoDateIn(Date.now(), TEST_TIME_ZONE);
  await expect(page.getByLabel("Date")).toHaveValue(today);
  await page.getByLabel("Amount received").fill("0");
  await primary(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "above ₱0" })).toBeVisible();
  await expect(page.getByLabel("Amount received")).toBeFocused();
  await page.getByLabel("Amount received").fill("25,000");
  await primary(page).click();

  // Split: the engine's split of ₱25,000 (O1), nothing written yet.
  await expect(heading(page)).toHaveText("₱25,000.00 from Salary, split by your plan");
  const bars = page.getByRole("list", { name: "Where it goes" });
  await expect(bars).toContainText("Living");
  await expect(bars).toContainText("₱9,500.00");
  await expect(bars).toContainText("₱6,250.00");
  await expect(page.getByRole("group", { name: "Plan slip" })).not.toContainText("PLAN SET");
  expect(await noHorizontalScroll(page)).toBe(true);
  await expect.poll(async () => (await adminClient().from("ledger_entries").select("id").eq("user_id", user.id)).data?.length).toBe(0);
  await page.getByRole("button", { name: "Confirm split" }).click();

  // Move the money: 4 transfers, the first one focused, "N of M sent".
  await expect(heading(page)).toHaveText("Now move the money");
  const boxes = page.getByRole("checkbox");
  await expect(boxes).toHaveCount(4);
  await expect(boxes.first()).toBeFocused();
  await expect(page.getByText("0 of 4 sent")).toBeVisible();
  await expect(page.getByText(/Keep ₱3,000.00 in BPI/)).toBeVisible();
  await boxes.nth(0).check();
  await expect(page.getByText("1 of 4 sent")).toBeVisible();
  for (const i of [1, 2, 3]) await boxes.nth(i).check();

  // Done, in place: green card, heading focused, burst hook, slip stamped, Open Today.
  const done = page.getByTestId("onboarding-done");
  await expect(done).toBeVisible();
  await expect(done).toHaveAttribute("data-burst", "onboarding");
  await expect(done.getByRole("heading", { name: "Every peso has a home." })).toBeFocused();
  await expect(done).toContainText("₱25,000.00 split into 6 buckets");
  await expect(done).toContainText("Your accounts match your plan");
  await expect(done).toContainText("Safe to spend until");
  await expect(done).toContainText("₱12,000.00");
  await expect(done).toContainText("Your Emergency fund has started: ₱6,250.00");
  await expect(page.getByRole("group", { name: "Plan slip" })).toContainText("PLAN SET");
  await expect(page).toHaveURL(/\/welcome\/first$/);

  const completed = await eventsFor(user.id, "onboarding_completed");
  expect(completed).toHaveLength(1);
  expect(completed[0]?.props).toMatchObject({ path: "web", plan_mode: "plan", first_pay: "confirmed", transfers_ticked: 4 });
  const { data } = await adminClient().from("user_profiles").select("onboardedAt").eq("user_id", user.id).single();
  expect(data?.onboardedAt).not.toBeNull();

  await done.getByRole("link", { name: /Open Today/ }).click();
  await page.waitForURL("**/today?grow=onboarding");
});

test("web path First pay: Back walks the stages; I'll send them later finishes with transfers open", async ({ page }) => {
  const user = await createTestUser("ob-fp-later-moves");
  await seedDraft(user);
  await signIn(page, user, "/welcome/first");

  await page.getByRole("button", { name: "Yes, I'll add it" }).click();
  await primary(page).click();
  await expect(heading(page)).toHaveText("₱25,000.00 from Salary, split by your plan");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(heading(page)).toHaveText("What came in?");
  await expect(page.getByLabel("Amount received")).toHaveValue("25,000");
  await primary(page).click();
  await page.getByRole("button", { name: "Confirm split" }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "I'll send them later" }).click();
  await page.waitForURL("**/today");

  const { data } = await adminClient().from("user_profiles").select("onboardedAt").eq("user_id", user.id).single();
  expect(data?.onboardedAt).not.toBeNull();
  const completed = await eventsFor(user.id, "onboarding_completed");
  expect(completed[0]?.props).toMatchObject({ first_pay: "confirmed", transfers_ticked: 1 });
});

test("web path First pay: Not yet asks for a reminder, then Open Today", async ({ page }) => {
  const user = await createTestUser("ob-fp-no");
  await seedDraft(user);
  await signIn(page, user, "/welcome/first");

  await page.getByRole("button", { name: "Not yet" }).click();
  await expect(heading(page)).toHaveText("That's fine. Payday is the moment.");
  await expect(page.getByRole("radio", { name: "Email me on payday" })).toBeChecked();
  await page.getByRole("radio", { name: "No reminder" }).check();
  await page.getByRole("button", { name: "Open Today" }).click();
  await page.waitForURL("**/today");

  const { data } = await adminClient().from("user_profiles").select("onboardedAt, paydayReminder").eq("user_id", user.id).single();
  expect(data?.onboardedAt).not.toBeNull();
  expect(data?.paydayReminder).toBe("none");
  const completed = await eventsFor(user.id, "onboarding_completed");
  expect(completed[0]?.props).toMatchObject({ first_pay: "later", transfers_ticked: 0 });
});
