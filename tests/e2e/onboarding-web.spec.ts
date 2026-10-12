import { expect, test, type Page } from "@playwright/test";
import { isoDateIn } from "../../lib/data/money-in-model";
import { adminClient, createTestUser, eventsFor, TEST_TIME_ZONE, type TestUser } from "./helpers/supabase";

// Each test makes its own user: the four projects run in parallel and these tests write.
test.use({ storageState: { cookies: [], origins: [] } });

const DAY = 86_400_000;

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
const inDays = (n: number) => isoDateIn(Date.now() + n * DAY, TEST_TIME_ZONE);

/** Welcome question, "I'm new to Salin", then Income and Accounts filled in. Leaves the user on Priorities. */
async function throughIncomeAndAccounts(page: Page) {
  await page.getByRole("button", { name: /I'm new to Salin/ }).click();
  await expect(page).toHaveURL(/\/welcome\/income$/);
  await expect(page.getByText("Step 1 of 6 · Income")).toBeVisible();
  await expect(heading(page)).toHaveText("What money comes in?");
  await expect(heading(page)).toBeFocused();
  expect(await noHorizontalScroll(page)).toBe(true);

  // Each field's problem is named and focused.
  await primary(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "what to call you" })).toBeVisible();
  await expect(page.getByLabel("What should we call you?")).toBeFocused();
  await page.getByLabel("What should we call you?").fill("Rolf");
  await primary(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "above ₱0" })).toBeVisible();
  await expect(page.getByLabel("About how much each time?")).toBeFocused();
  await page.getByLabel("About how much each time?").fill("25000");
  await primary(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "next payday" })).toBeVisible();
  await expect(page.getByLabel("Next one comes on")).toBeFocused();
  await page.getByLabel("Next one comes on").fill("2020-01-01");
  await primary(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "today or later" })).toBeVisible();
  await page.getByLabel("Next one comes on").fill(inDays(10));

  await page.getByText("Twice a month").click();
  await page.getByText("Scholarship", { exact: true }).last().click(); // an extra: kept whole in Scholarship
  await page.getByText("Gifts").click();
  await primary(page).click();

  await expect(page).toHaveURL(/\/welcome\/accounts$/);
  await expect(page.getByText("Step 2 of 6 · Accounts")).toBeVisible();
  await expect(heading(page)).toHaveText("Where does your money sit?");
  await expect(page.getByText(/No bank login/)).toBeVisible();

  await primary(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "at least one place" })).toBeVisible();
  await page.getByRole("checkbox", { name: /^BPI/ }).check();
  await page.getByRole("checkbox", { name: /^GCash/ }).check();
  await page.getByLabel("Another account").fill("Security Bank");
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("checkbox", { name: /^Security Bank/ })).toBeChecked();
  await primary(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "where your pay lands" })).toBeVisible();
  await expect(page.getByLabel("Your pay lands in")).toBeFocused();
  await page.getByLabel("Your pay lands in").selectOption({ label: "BPI" });

  // Unticking the landing account clears it; the select must be chosen again.
  await page.getByRole("checkbox", { name: /^BPI/ }).uncheck();
  await expect(page.getByLabel("Your pay lands in")).toHaveValue("");
  await page.getByRole("checkbox", { name: /^BPI/ }).check();
  await page.getByLabel("Your pay lands in").selectOption({ label: "BPI" });
  await primary(page).click();
  await expect(page).toHaveURL(/\/welcome\/prio$/);
}

test("web path: Income, Accounts, then the shared steps, and the draft carries stable account ids", async ({ page }) => {
  const user = await createTestUser("obw-path");
  await signIn(page, user, "/welcome");
  await throughIncomeAndAccounts(page);

  const { data } = await adminClient().from("user_profiles").select("onboardingDraft").eq("user_id", user.id).single();
  const draft = data?.onboardingDraft as {
    path: string;
    firstName: string;
    income: { kind: string; amountMinor: number; frequency: string };
    accounts: { id: string; name: string; isNew: boolean }[];
    landingAccountId: string;
    sources: { key: string; rule: string; landsInAccountId: string }[];
  };
  expect(draft).toMatchObject({ path: "web", firstName: "Rolf", income: { kind: "salary", amountMinor: 2_500_000, frequency: "twice" } });
  expect(draft.accounts.map((a) => a.name)).toEqual(["GCash", "BPI", "Security Bank"]);
  expect(draft.accounts.every((a) => a.isNew)).toBe(true);
  const bpi = draft.accounts.find((a) => a.name === "BPI")!;
  expect(draft.landingAccountId).toBe(bpi.id);
  expect(draft.sources.map((s) => s.key)).toEqual(["main", "scholarship", "gift"]);
  expect(draft.sources.every((s) => s.landsInAccountId === bpi.id)).toBe(true);

  // Back and forward keeps the same ids (unpick and repick too).
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("checkbox", { name: /^GCash/ }).uncheck();
  await page.getByRole("checkbox", { name: /^GCash/ }).check();
  await primary(page).click();
  await expect(page).toHaveURL(/\/welcome\/prio$/);
  const again = await adminClient().from("user_profiles").select("onboardingDraft").eq("user_id", user.id).single();
  const accounts = (again.data?.onboardingDraft as { accounts: { id: string; name: string }[] }).accounts;
  expect(accounts.find((a) => a.name === "GCash")?.id).toBe(draft.accounts.find((a) => a.name === "GCash")?.id);

  // Priorities, Your plan and Where it lives, then First pay and "Not yet" finishes.
  await page.getByLabel("Build a safety net").check();
  await primary(page).click();
  await expect(heading(page)).toContainText("plan");
  await primary(page).click();
  await expect(page.getByText("Step 5 of 6 · Where it lives")).toBeVisible();
  await primary(page).click();
  await expect(page.getByText("Step 6 of 6 · First pay")).toBeVisible();
  await page.getByRole("button", { name: "Not yet" }).click();
  await page.waitForURL("**/today");

  const db = adminClient();
  const acc = await db.from("accounts").select("id, name").eq("user_id", user.id);
  expect((acc.data ?? []).map((a) => a.name).sort()).toEqual(["BPI", "GCash", "Security Bank"]);
  expect(acc.data?.find((a) => a.name === "BPI")?.id).toBe(bpi.id);
  const sources = await db.from("income_sources").select("name, kind, rule, landsInAccountId").eq("user_id", user.id);
  expect(sources.data?.map((s) => s.name).sort()).toEqual(["Gift", "Salary", "Scholarship"]);
  expect(sources.data?.every((s) => s.landsInAccountId === bpi.id)).toBe(true);
  const done = await eventsFor(user.id, "onboarding_finished");
  expect(done).toHaveLength(1);
});

test("Just track for now: First pay follows Priorities, Back undoes the skip, Today offers Make a plan, Save my plan applies it", async ({ page }) => {
  const user = await createTestUser("obw-track");
  await signIn(page, user, "/welcome");
  await throughIncomeAndAccounts(page);

  await page.getByRole("button", { name: "Skip the plan, just track for now" }).click();
  await expect(page).toHaveURL(/\/welcome\/first$/);
  await expect(page.getByText("Step 4 of 4 · First pay")).toBeVisible();

  // Back returns to Priorities and the skip is undone: the full list is back.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/welcome\/prio$/);
  await expect(page.getByText(/Just tracking for now/)).toHaveCount(0);
  await expect(page.getByText("Step 3 of 6 · Priorities")).toBeVisible();

  // Skip again and finish with "Not yet".
  await page.getByRole("button", { name: "Skip the plan, just track for now" }).click();
  await expect(page).toHaveURL(/\/welcome\/first$/);
  await page.getByRole("button", { name: "Not yet" }).click();
  await page.waitForURL("**/today");

  const db = adminClient();
  const profile = await db.from("user_profiles").select("planMode, priority").eq("user_id", user.id).single();
  expect(profile.data).toMatchObject({ planMode: "track", priority: null });
  const buckets = await db.from("buckets").select("name, hue").eq("user_id", user.id);
  expect(buckets.data?.find((b) => b.hue === "living")?.name).toBe("Spending");
  const goals = await db.from("goals").select("id").eq("user_id", user.id);
  expect(goals.data).toHaveLength(0);

  // Today: the checklist and the card for someone just tracking.
  const card = page.getByTestId("next-card");
  await expect(card).toHaveAttribute("data-next", "make_plan");
  await expect(card).toContainText("Right now everything you get goes to Spending");
  await expect(card).toContainText("Income and accounts set up");
  await expect(card).toContainText("First pay recorded");
  await expect(card).toContainText("First spending logged");
  await expect(card).toContainText("First week closed");
  await expect(page.getByTestId("week-count")).toHaveText("1 of 5 done");

  // Make a plan: Priorities, Your plan, Where it lives; the last primary is Save my plan.
  await page.getByTestId("next-primary").click();
  await page.waitForURL("**/welcome/prio");
  await expect(page.getByText("Make a plan · 1 of 3 · Priorities")).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip the plan, just track for now" })).toHaveCount(0);
  await page.getByLabel("Build a safety net").check();
  await primary(page).click();
  await expect(page.getByText(/Make a plan · 2 of 3/)).toBeVisible();
  await primary(page).click();
  await expect(page.getByText(/Make a plan · 3 of 3/)).toBeVisible();
  await expect(primary(page)).toContainText("Save my plan");
  await primary(page).click();
  await page.waitForURL("**/today");

  const after = await db.from("user_profiles").select("planMode, priority, onboardingDraft").eq("user_id", user.id).single();
  expect(after.data).toMatchObject({ planMode: "plan", priority: "safety", onboardingDraft: {} });
  const living = await db.from("buckets").select("name").eq("user_id", user.id).eq("hue", "living").single();
  expect(living.data?.name).toBe("Living");
  const emergency = await db.from("goals").select("name").eq("user_id", user.id);
  expect(emergency.data?.map((g) => g.name)).toContain("Emergency fund");
  await expect(page.getByTestId("next-card")).not.toHaveAttribute("data-next", "make_plan");
});
