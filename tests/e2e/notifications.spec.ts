import { expect, test, type Page } from "@playwright/test";
import { isoDateIn } from "../../lib/data/money-in-model";
import { TZ_COOKIE } from "../../lib/time";
import { adminClient, createTestUser, TEST_TIME_ZONE, type TestUser } from "./helpers/supabase";
import { seedMoneyIn, signInAs } from "./helpers/money-in";

/** Streak + reminders (ticket 31). Needs migration 20261015000400 on the local Supabase. */
test.use({ storageState: { cookies: [], origins: [] } });

const today = () => isoDateIn(Date.now(), TEST_TIME_ZONE);
const weekday = () => new Date(`${today()}T00:00:00Z`).getUTCDay();

async function setup(page: Page, label: string, view: "simple" | "full"): Promise<TestUser> {
  const user = await createTestUser(label);
  await seedMoneyIn(user.id);
  // Money is due today and today is the review day, so both notices are due by 9 AM local.
  await adminClient().from("user_profiles").update({ viewMode: view, nextPaydayDate: today(), spendUntil: null, reviewDay: weekday() }).eq("user_id", user.id);
  await signInAs(page, user, "/today");
  await page.context().addCookies([{ name: TZ_COOKIE, value: TEST_TIME_ZONE, url: new URL(page.url()).origin }]);
  await page.goto("/today");
  return user;
}

const localHour = () => Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: TEST_TIME_ZONE }).format(new Date()));

test("the bell lists today's notices, clears its count when opened, and the reminder switches save", async ({ page }) => {
  test.skip(localHour() < 9, "money-day and review notices are due from 9 AM Manila");
  const user = await setup(page, "notify-bell", "full");
  const bell = page.getByTestId("bell");
  await expect(page.getByTestId("bell-count")).toBeVisible();
  await bell.click();
  const drawer = page.getByRole("dialog", { name: "Notifications" });
  await expect(drawer.getByRole("link", { name: /Money day/ })).toBeVisible();
  await expect(drawer.getByRole("link", { name: /Five minutes to close the week/ })).toBeVisible();
  await expect(drawer.getByRole("link", { name: /Money day/ })).toHaveAttribute("href", "/money-in?add=1");

  // Switch the daily nudge off and move nothing else; it persists.
  await drawer.getByText("Weekly review", { exact: true }).click();
  await expect(drawer.getByRole("switch", { name: /Weekly review/ })).not.toBeChecked();
  await expect.poll(async () => (await adminClient().from("notification_prefs" as never).select("*").eq("user_id", user.id).maybeSingle()).data).toMatchObject({ weeklyReview: false, dailyLog: true });
  await page.keyboard.press("Escape");

  // Opening marked them read; after a reload the count is gone and the review notice no longer exists.
  await page.reload();
  await expect(page.getByTestId("bell-count")).toHaveCount(0);
  await page.getByTestId("bell").click();
  await expect(page.getByRole("dialog", { name: "Notifications" }).getByRole("link", { name: /Five minutes to close the week/ })).toHaveCount(0);
});

test("Full view shows the streak with a No spend today switch that counts the day", async ({ page }) => {
  await setup(page, "notify-streak", "full");
  const row = page.getByTestId("full-streak");
  await expect(row).toBeVisible();
  await row.getByTestId("no-spend").click();
  await expect(row.getByTestId("no-spend")).toHaveAttribute("aria-pressed", "true");
  await expect(row.getByText("Today is counted.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("full-streak").getByTestId("no-spend")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("streak-chip")).toBeVisible();
});

test("the browser switch asks for permission and then saves", async ({ page, context }) => {
  await context.grantPermissions(["notifications"]);
  const user = await setup(page, "notify-browser", "simple");
  await page.getByTestId("bell").click();
  await page.getByRole("dialog", { name: "Notifications" }).getByText("Show in this browser").click();
  await expect(page.getByRole("switch", { name: /Show in this browser/ })).toBeChecked();
  await expect.poll(async () => ((await adminClient().from("notification_prefs" as never).select("*").eq("user_id", user.id).maybeSingle()).data as { browser?: boolean } | null)?.browser).toBe(true);
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration("/")))).toBe(true);
});
