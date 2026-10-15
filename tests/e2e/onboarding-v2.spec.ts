import { expect, test, type Page } from "@playwright/test";
import { isoDateIn } from "../../lib/data/money-in-model";
import { adminClient, createTestUser, TEST_TIME_ZONE, type TestUser } from "./helpers/supabase";

// Onboarding v2 (P-12): the allowance / stipend / mix path. Each test makes its own user.
test.use({ storageState: { cookies: [], origins: [] } });

const DAY = 86_400_000;
const inDays = (n: number) => isoDateIn(Date.now() + n * DAY, TEST_TIME_ZONE);
const primary = (page: Page) => page.locator("#ob-primary");
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function signIn(page: Page, user: TestUser, next: string) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${next}`);
}

test("Allowance: three steps, a live per-day number, finishes into Simple view with the money recorded", async ({ page }) => {
  const user = await createTestUser("obv2-allowance");
  await signIn(page, user, "/welcome");
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.getByRole("button", { name: /Allowance or stipend/ }).click();

  // Accounts: Cash is ticked and lands; add GCash.
  await expect(page).toHaveURL(/\/welcome\/accounts$/);
  await expect(page.getByText("Step 1 of 3 · Accounts")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Cash Cash" })).toBeChecked();
  await page.getByRole("checkbox", { name: "GCash E-wallet" }).check({ force: true });
  await primary(page).click();

  // Rhythm: each missing field is named.
  await expect(page).toHaveURL(/\/welcome\/rhythm$/);
  await expect(page.getByText("Step 2 of 3 · Your rhythm")).toBeVisible();
  await primary(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "what to call you" })).toBeVisible();
  await page.getByLabel("What should we call you?").fill("Mika");
  await primary(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "above ₱0" })).toBeVisible();
  await page.getByLabel("About how much do you usually get?").fill("1500");
  await primary(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "how often" })).toBeVisible();
  await page.getByText("Every week").click();
  await page.getByLabel("When is the next one?").fill(inDays(7));
  await primary(page).click();

  // First money: 2,100 with 100 kept aside, 500 of it in GCash, over 7 days.
  await expect(page).toHaveURL(/\/welcome\/money$/);
  await expect(page.getByText("Step 3 of 3 · First money")).toBeVisible();
  await primary(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "skip" })).toBeVisible();
  await page.getByLabel("How much do you have right now?").fill("2100");
  await page.getByLabel("GCash").fill("500");
  await page.getByLabel(/Keep some aside/).fill("100");
  // (2,100 - 100 kept) / 7 days = 285.71 a day
  await expect(page.getByTestId("per-day")).toHaveAttribute("data-per-day-minor", "28571");
  expect(await noHorizontalScroll(page)).toBe(true);
  await primary(page).click();

  // The tour: the number, the buckets, the Simple / Full switch, and the phone-app request.
  await expect(page.getByTestId("tour-per-day")).toHaveAttribute("data-per-day-minor", "28571");
  await expect(page.getByTestId("tour-buckets")).toContainText("Spending");
  await expect(page.getByTestId("tour-buckets")).toContainText("Kept aside");
  await expect(page.getByTestId("tour-views")).toContainText("Switch any time");
  const request = page.getByTestId("app-request-cta");
  const href = (await request.getAttribute("href")) ?? "";
  expect(href.startsWith("mailto:proj.salin@gmail.com?")).toBe(true);
  expect(decodeURIComponent(href)).toContain("Name: Mika");
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.getByRole("link", { name: /Open Today/ }).click();
  await page.waitForURL(/\/today(\?|$)/);

  const db = adminClient();
  const profile = await db.from("user_profiles").select("viewMode, spendUntil, planMode, firstName").eq("user_id", user.id).single();
  expect(profile.data).toMatchObject({ viewMode: "simple", spendUntil: inDays(7), planMode: "track", firstName: "Mika" });
  const accounts = await db.from("accounts").select("name").eq("user_id", user.id);
  expect((accounts.data ?? []).map((a) => a.name).sort()).toEqual(["Cash", "GCash"]);
  const inflow = await db.from("ledger_entries").select("amountMinor").eq("user_id", user.id).eq("direction", 0);
  expect(inflow.data).toEqual([{ amountMinor: 210_000 }]);

  // Simple Today shows the number straight away.
  await expect(page.getByTestId("hero")).toBeVisible();
  await expect(page.getByTestId("today-left")).toHaveAttribute("data-today-left-minor", "28571");
});

test("Mix with no date and no money yet: Skip for now still lands in Simple view", async ({ page }) => {
  const user = await createTestUser("obv2-mix");
  await signIn(page, user, "/welcome");
  await page.getByRole("button", { name: /A mix, or it varies/ }).click();
  await primary(page).click(); // Accounts: Cash is enough
  await page.getByLabel("What should we call you?").fill("Jo");
  await page.getByLabel("About how much do you usually get?").fill("800");
  await page.getByText("It varies").click();
  await expect(page.getByRole("checkbox", { name: "Not sure yet" })).toBeChecked();
  await primary(page).click();
  await expect(page).toHaveURL(/\/welcome\/money$/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByTestId("tour-buckets")).toBeVisible();
  await page.getByRole("link", { name: /Open Today/ }).click();
  await page.waitForURL(/\/today(\?|$)/);
  const profile = await adminClient().from("user_profiles").select("viewMode, spendUntil").eq("user_id", user.id).single();
  expect(profile.data).toMatchObject({ viewMode: "simple", spendUntil: null });
  await expect(page.getByTestId("hero")).toBeVisible();
  // First visit: the tour starts on today's number.
  await expect(page.getByTestId("tour-card")).toHaveAttribute("data-step", "hero");
});

test("Reduced motion: the Welcome still works and nothing slides", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const user = await createTestUser("obv2-rm");
  await signIn(page, user, "/welcome");
  const card = page.getByRole("button", { name: /Salary or regular pay/ });
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => getComputedStyle(el).animationName)).not.toContain("rise");
});

test("Switching views: Simple has a link to Full, Full has a link back, and the account menu offers the phone app", async ({ page }) => {
  const user = await createTestUser("obv2-switch");
  await signIn(page, user, "/welcome");
  await page.getByRole("button", { name: /A mix, or it varies/ }).click();
  await primary(page).click();
  await page.getByLabel("What should we call you?").fill("Jo");
  await page.getByLabel("About how much do you usually get?").fill("800");
  await page.getByText("It varies").click();
  await primary(page).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("link", { name: /Open Today/ }).click();
  await page.waitForURL(/\/today(\?|$)/);
  await page.getByTestId("tour-card").waitFor();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tour")).toHaveCount(0);

  await page.getByTestId("to-full-view").click();
  await expect(page.getByTestId("to-simple-view")).toBeVisible();
  await expect(page.getByTestId("hero")).toHaveCount(0);
  await page.getByTestId("to-simple-view").click();
  await expect(page.getByTestId("hero")).toBeVisible();

  await page.getByRole("button", { name: "Account menu" }).click();
  const href = await page.getByTestId("app-request").getAttribute("href");
  expect(href?.startsWith("mailto:proj.salin@gmail.com?")).toBe(true);
  expect(decodeURIComponent(href ?? "")).toContain(user.email);
});
