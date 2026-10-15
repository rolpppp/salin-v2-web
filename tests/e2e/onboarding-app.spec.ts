import { expect, test, type Page } from "@playwright/test";
import { isoDateIn, shortDate } from "../../lib/data/money-in-model";
import { newAccountRow, newCategoryRow, newIncomeEntryRow } from "../../lib/domain/mobile";
import { adminClient, createTestUser, eventsFor, TEST_TIME_ZONE, type TestUser } from "./helpers/supabase";

// Each test makes its own user: the four projects run in parallel and these tests write.
test.use({ storageState: { cookies: [], origins: [] } });

const DAY = 86_400_000;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`seed ${label}: ${error.message}`);
};

/** A phone that has synced: two accounts, a Salary category, and three monthly paydays (the latest 5 days ago). */
async function seedPhone(user: TestUser) {
  const db = adminClient();
  const now = Date.now();
  const bdo = newAccountRow({ userId: user.id, nowMs: now, name: "BDO Savings", type: "bank", displayOrder: 1 });
  const gcash = newAccountRow({ userId: user.id, nowMs: now, name: "GCash", type: "eWallet", displayOrder: 2 });
  must("accounts", (await db.from("accounts").insert([bdo, gcash])).error);
  const salary = newCategoryRow({ userId: user.id, nowMs: now, name: "Salary", type: "income" });
  const groceries = newCategoryRow({ userId: user.id, nowMs: now, name: "Groceries", type: "expense" });
  must("categories", (await db.from("categories").insert([salary, groceries])).error);
  const pay = (daysAgo: number) => newIncomeEntryRow({ userId: user.id, nowMs: now, accountId: bdo.id, categoryId: salary.id, amountMinor: 2_500_000, occurredAt: now - daysAgo * DAY });
  const rows = [pay(65), pay(35), pay(5)];
  must("entries", (await db.from("ledger_entries").insert(rows)).error);
  return { latestIso: isoDateIn(now - 5 * DAY, TEST_TIME_ZONE), latestId: rows[2]!.id, bdoId: bdo.id };
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

/**
 * Priorities, Your plan and Where it lives belong to other tickets. Until they merge they're "Coming next"
 * placeholders; after, they need an answer. Either way: answer what's there and continue to Categories / First pay.
 */
async function throughSharedSteps(page: Page) {
  for (let i = 0; i < 8; i++) {
    const text = (await heading(page).textContent()) ?? "";
    if (/waiting for a job|sorted your|spending categories/i.test(text)) return;
    const safety = page.getByLabel("Build a safety net");
    if (await safety.count()) await safety.check();
    await primary(page).click();
    await expect(heading(page)).not.toHaveText(text);
  }
}

test("app path: Found your Salin data, Income, shared steps, Categories, then First pay with the latest pay waiting", async ({ page }) => {
  const user = await createTestUser("ob-app");
  const phone = await seedPhone(user);
  // A user with synced rows never sees the question (D-29): /welcome lands on Your app.
  await signIn(page, user, "/welcome");
  await page.waitForURL("**/welcome/app");

  await expect(heading(page)).toHaveText("Found your Salin data");
  await expect(heading(page)).toBeFocused();
  await expect(page.getByText("Step 1 of 7 · Your app")).toBeVisible();
  const stats = page.getByRole("group", { name: "What we found on your phone" });
  await expect(stats).toContainText("2");
  await expect(stats).toContainText("accounts");
  await expect(page.getByRole("checkbox", { name: /BDO Savings/ })).toBeDisabled(); // pay lands here
  await expect(page.getByRole("checkbox", { name: /GCash/ })).toBeChecked();
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  expect(await noHorizontalScroll(page)).toBe(true);

  await primary(page).click();
  await expect(page).toHaveURL(/\/welcome\/income$/);
  await expect(heading(page)).toHaveText("Here's the money we found coming in");
  await expect(heading(page)).toBeFocused();
  await expect(page.getByRole("radio", { name: /Salary/ })).toBeChecked();
  await expect(page.getByText("Monthly · your main pay")).toBeVisible();
  const next = page.getByLabel("Next main payday");
  await expect(next).not.toHaveValue("");
  // Slip prints the answers so far.
  const slip = page.getByRole("group", { name: "Plan slip" });
  await expect(slip).toContainText("₱25,000.00");
  await expect(slip).toContainText("BDO Savings");

  // An invalid payday is explained and focused.
  await next.fill("2020-01-01");
  await primary(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "today or later" })).toBeVisible();
  await expect(next).toBeFocused();
  await next.fill(isoDateIn(Date.now() + 20 * DAY, TEST_TIME_ZONE));

  // Back / Forward and a reload resume from the saved draft.
  await primary(page).click();
  await expect(page).toHaveURL(/\/welcome\/prio$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/welcome\/income$/);
  await page.goForward();
  await page.reload();
  await expect(page).toHaveURL(/\/welcome\/prio$/);
  // Autosave is debounced: the reloaded page records `step: "prio"` shortly after it renders.
  const storedDraft = async () => (await adminClient().from("user_profiles").select("onboardingDraft").eq("user_id", user.id).single()).data?.onboardingDraft as { step?: string } | null;
  await expect.poll(async () => (await storedDraft())?.step).toBe("prio");
  expect(await storedDraft()).toMatchObject({ path: "app", step: "prio", landingAccountId: phone.bdoId, firstPay: { entryId: phone.latestId, amountMinor: 2_500_000 } });

  await throughSharedSteps(page);
  if (/sorted your|spending categories/i.test((await heading(page).textContent()) ?? "")) {
    await expect(page.getByText("Step 6 of 7 · Categories")).toBeVisible();
    await primary(page).click();
  }

  await expect(heading(page)).toHaveText(`Your ${shortDate(phone.latestIso)} pay is waiting for a job`);
  await expect(page.getByText("Step 7 of 7 · First pay")).toBeVisible();
  await expect(page.getByText(`landed in BDO Savings`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Do it later" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Give it a job" })).toBeVisible();

  const started = await eventsFor(user.id, "onboarding_started");
  expect(started[0]?.props).toEqual({ path: "app", auto_detected: true });
  const completed = await eventsFor(user.id, "onboarding_step_completed");
  expect(completed.map((e) => (e.props as { step: string }).step).slice(0, 2)).toEqual(["app", "income"]);
});

test("First pay: Give it a job opens the split (nothing finished); Do it later asks for a reminder, then finishes and opens Today", async ({ page }) => {
  const user = await createTestUser("ob-first");
  const phone = await seedPhone(user);
  await signIn(page, user, "/welcome/app");
  await primary(page).click();
  await throughSharedSteps(page);
  if (/sorted your|spending categories/i.test((await heading(page).textContent()) ?? "")) {
    await expect(page.getByText("Step 6 of 7 · Categories")).toBeVisible();
    await primary(page).click();
  }
  await expect(heading(page)).toHaveText(`Your ${shortDate(phone.latestIso)} pay is waiting for a job`);

  await page.getByRole("button", { name: "Give it a job" }).click();
  await expect(heading(page)).toHaveText("₱25,000.00 from Salary, split by your plan");
  await expect(page.getByRole("button", { name: "Confirm split" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Plan slip" })).not.toContainText("PLAN SET");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Do it later" })).toBeVisible();

  // Needs finish_onboarding (ticket 16 SQL): onboarding writes nothing to plan tables until here.
  await page.getByRole("button", { name: "Do it later" }).click();
  await expect(heading(page)).toHaveText("That's fine. Payday is the moment.");
  await expect(page.getByText(/Your pay waits in Money in/)).toBeVisible();
  await page.getByRole("button", { name: "Open Today" }).click();
  await page.waitForURL(/\/today(\?|$)/);
  const { data } = await adminClient().from("user_profiles").select("onboardedAt").eq("user_id", user.id).single();
  expect(data?.onboardedAt).not.toBeNull();
});

test("no synced rows: the question, then Waiting for your phone with a way out to the web path", async ({ page }) => {
  const user = await createTestUser("ob-none");
  await signIn(page, user, "/welcome");
  await expect(page.getByRole("heading", { level: 1, name: "Know what's fine to spend today." })).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);

  await page.getByRole("button", { name: /I already use the Salin app/ }).click();
  await expect(page).toHaveURL(/\/welcome\/app$/);
  await expect(heading(page)).toHaveText("Turn on sync in the Salin app");
  await expect(page.getByText("Waiting for your phone…")).toBeVisible();
  await expect(primary(page)).toBeDisabled();

  // The phone syncs: the page notices (Realtime, or the 10 s poll) and shows what it found.
  await seedPhone(user);
  await expect(heading(page)).toHaveText("Found your Salin data", { timeout: 20_000 });
  await expect(primary(page)).toBeEnabled();
  const connected = await eventsFor(user.id, "sync_connected");
  expect(connected).toHaveLength(1);
});

test("Continue without the app starts the web path from scratch", async ({ page }) => {
  const user = await createTestUser("ob-web");
  await signIn(page, user, "/welcome/app");
  await expect(page.getByText("Waiting for your phone…")).toBeVisible();
  await page.getByRole("button", { name: "Continue without the app" }).click();
  await expect(page).toHaveURL(/\/welcome\/income$/);
  await expect(page.getByText("Step 1 of 6 · Income")).toBeVisible();
});
