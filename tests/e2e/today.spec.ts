import { expect, test, type Page } from "@playwright/test";
import { shortDate } from "../../lib/data/money-in-model";
import { formatPeso } from "../../lib/money";
import { TZ_COOKIE } from "../../lib/time";
import { adminClient, createTestUser, eventsFor, type TestUser } from "./helpers/supabase";
import { seedMoneyIn, signInAs } from "./helpers/money-in";
import { addOthersPayday, confirmAllAndSend, seedSpending, seedToday, type TodayOptions, type TodaySeed } from "./helpers/today";

// Each test makes its own user: the four projects (390/1440 x light/dark) run in parallel and these tests write.
test.use({ storageState: { cookies: [], origins: [] } });

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** G9's starting state: the Oct 7 style Work payday of G1 confirmed (Plan A) and sent, plus the sample spending. */
async function g9(page: Page, opts: TodayOptions = {}): Promise<{ user: TestUser; seed: TodaySeed }> {
  const user = await createTestUser("today");
  const seed = await seedToday(user.id, opts);
  await seedSpending(user.id, seed);
  await signInAs(page, user, "/money-in");
  await confirmAllAndSend(page);
  // Pin the zone cookie so Today doesn't do its one-time zone refresh (a router.refresh that re-renders the page right after load,
  // which would eat a keyboard focus the test just set). The refresh itself is TimezoneSync's own concern.
  await page.context().addCookies([{ name: TZ_COOKIE, value: "Asia/Manila", url: new URL(page.url()).origin }]);
  await page.goto("/today");
  return { user, seed };
}

test("G9: Living −₱86.97 'Needs ₱86.97', Fun ₱432.40, safe to spend ₱345.43, about ₱34 a day for 10 days", async ({ page }) => {
  const errors = watchConsole(page);
  await g9(page);

  await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), Maria$/ })).toBeVisible();
  await expect(page.getByTestId("today-date")).toContainText("10 days until payday");

  await expect(page.getByTestId("safe-amount")).toHaveText("₱345.43");
  await expect(page.getByTestId("safe-amount")).toHaveAttribute("data-safe-minor", "34543");
  await expect(page.getByTestId("per-day")).toHaveText("About ₱34 a day for 10 days");
  await expect(page.getByText("Living and Fun money, until your next payday.")).toBeVisible();
  await expect(page.getByText("Put away in")).toBeVisible();
  await expect(page.getByTestId("tax-set-aside")).toHaveText(formatPeso(103_974));

  const living = page.getByTestId("slot-living");
  await expect(living).toContainText("−₱86.97");
  await expect(living).toContainText("Needs ₱86.97");
  await expect(living.getByTestId("ribbon")).toHaveCount(0); // overspent: no ribbon
  await expect(page.getByTestId("slot-fun")).toContainText("₱432.40");
  await expect(page.getByTestId("slot-fun").getByTestId("ribbon")).toHaveCount(1);
  // the seed redirects Rent until 2099 so the goldens hold whenever the suite runs
  await expect(page.getByTestId("slot-rent")).toContainText("Starts Jan 2099");

  // Next step: Living below zero → Cover from Buffer + See what happened, one primary
  await expect(page.getByTestId("next-heading")).toHaveText("Living needs ₱86.97");
  await expect(page.getByRole("button", { name: "Cover from Buffer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "See what happened" })).toBeVisible();
  await expect(page.getByTestId("week-count")).toHaveText("3 of 5 done");
  await expect(page.getByText("This week", { exact: true })).toBeVisible();

  expect(await noHorizontalScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("Cover from Buffer: moves exactly the deficit, shows the flag, announces, writes a cover and fires cover_used", async ({ page }) => {
  const { user, seed } = await g9(page);

  await page.getByRole("button", { name: "Cover from Buffer" }).click();
  await expect(page.getByTestId("cover-flag")).toHaveText("Covered. Buffer topped up Living by ₱86.97.");
  await expect(page.getByTestId("live-region")).toHaveText("Covered. Buffer topped up Living by ₱86.97.");

  await expect(page.getByTestId("slot-living")).toContainText("₱0.00");
  await expect(page.getByTestId("slot-living")).not.toContainText("Needs");
  await expect(page.getByTestId("slot-buffer")).toContainText(formatPeso(86_645 - 8697));
  await expect(page.getByTestId("safe-amount")).toHaveText("₱432.40");
  await expect(page.getByTestId("next-card")).toHaveAttribute("data-next", "review");
  await expect(page.getByTestId("week-count")).toHaveText("4 of 5 done");
  await expect(page.getByTestId("next-card")).toBeFocused();

  const { data: covers } = await adminClient().from("bucket_covers").select("fromBucketId, toBucketId, amountMinor, deletedAt").eq("user_id", user.id);
  expect(covers).toEqual([{ fromBucketId: seed.bucketIds.buffer, toBucketId: seed.bucketIds.living, amountMinor: 8697, deletedAt: null }]);
  expect(await eventsFor(user.id, "cover_used")).toHaveLength(1);

  // the flag clears when you leave Today
  await page.goto("/review");
  await page.goto("/today");
  await expect(page.getByTestId("cover-flag")).toHaveCount(0);
  await expect(page.getByTestId("slot-living")).toContainText("₱0.00");
});

test("a second tab can't over-cover: pressing Cover again after it was covered says nothing is below zero", async ({ page, context }) => {
  const { user } = await g9(page);
  const other = await context.newPage();
  await other.goto("/today");
  await page.getByRole("button", { name: "Cover from Buffer" }).click();
  await expect(page.getByTestId("cover-flag")).toBeVisible();
  // the other tab still shows the old card; its action reads the balances on the server
  await other.getByRole("button", { name: "Cover from Buffer" }).click();
  await expect(other.getByTestId("cover-flag")).toHaveText("Living isn't below zero any more.");
  const { data } = await adminClient().from("bucket_covers").select("id").eq("user_id", user.id).is("deletedAt", null);
  expect((data ?? []).length).toBe(1);
});

test("bucket drawer: keyboard open, Close has focus, plan text and this month's slip, Escape closes and returns focus", async ({ page }) => {
  await g9(page);
  const slot = page.getByTestId("slot-living");
  // A key press before React hydrates does nothing, so wait until the button has its React handlers.
  await expect.poll(() => slot.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")))).toBe(true);
  await slot.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: "Living" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Close" })).toBeFocused();
  await expect(drawer.getByTestId("drawer-left")).toHaveText("−₱86.97");
  await expect(drawer).toContainText("Kept in GCash / cash");
  await expect(drawer).toContainText("7% of each payday on Plan A, 7% on Plan B.");
  await expect(drawer.getByTestId("drawer-lines")).toContainText("Work");
  await expect(drawer.getByTestId("drawer-lines")).toContainText("+₱1,213.03");
  await expect(drawer.getByTestId("drawer-lines")).toContainText("Groceries");
  await expect(drawer.getByTestId("drawer-lines")).toContainText("−₱1,300.00");
  await expect(drawer.getByRole("button", { name: "Cover ₱86.97 from Buffer" })).toBeVisible();

  // focus stays inside the drawer while it is open
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest("[role=dialog]") !== null)).toBe(true);

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(slot).toBeFocused();
});

test("covering from the drawer closes it, returns focus to the bucket and shows the flag", async ({ page }) => {
  await g9(page);
  await page.getByTestId("slot-living").click();
  await page.getByRole("button", { name: "Cover ₱86.97 from Buffer" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByTestId("cover-flag")).toHaveText("Covered. Buffer topped up Living by ₱86.97.");
  await expect(page.getByTestId("slot-living")).toBeFocused();
});

test("Rent's drawer says where its share goes until it starts", async ({ page }) => {
  await g9(page);
  await page.getByTestId("slot-rent").click();
  await expect(page.getByRole("dialog", { name: "Rent" })).toContainText("Until Jan 2099 this share goes to the Emergency fund.");
});

test("G10: Emergency reaches ₱12,905.28 (25%), 'Passed 25% today', 'About 7 more paydays like' the last Work payday", async ({ page }) => {
  const errors = watchConsole(page);
  const user = await createTestUser("today-g10");
  const seed = await seedToday(user.id);
  await signInAs(page, user, "/money-in");
  await confirmAllAndSend(page); // G1 (Work) first: Emergency ₱5,545.28
  await addOthersPayday(user.id, seed); // then G2 (Others, Plan A)
  await confirmAllAndSend(page);
  await page.goto("/today");

  const goal = page.getByTestId("goal-card").first();
  await expect(goal).toContainText("Emergency fund");
  await expect(goal.getByTestId("goal-percent")).toHaveText("25%");
  await expect(goal.getByTestId("goal-sub")).toContainText(`${formatPeso(5_000_000 - 1_290_528)} to go.`);
  await expect(goal.getByTestId("goal-sub")).toContainText(`About 7 more paydays like ${shortDate(seed.g1Iso)}`);
  await expect(goal.getByTestId("passed-chip")).toHaveText("Passed 25% today");
  await expect(goal.getByRole("progressbar", { name: "Emergency fund" })).toHaveAttribute("aria-valuetext", "25% saved");
  await expect(page.getByTestId("slot-emergency")).toContainText(formatPeso(1_290_528));
  expect(await noHorizontalScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("the Passed chip is not shown on an ordinary day (nothing crossed a tick)", async ({ page }) => {
  await g9(page);
  // Emergency ₱5,545.28 of ₱50,000 = 11%: confirmed today, but no 25% tick was crossed
  await expect(page.getByTestId("goal-card").first().getByTestId("goal-percent")).toHaveText("11%");
  await expect(page.getByTestId("passed-chip")).toHaveCount(0);
});

test("waiting income: next step names it, the shelf previews it as dashed outlines, jobless income is previewed as Plan A", async ({ page }) => {
  const errors = watchConsole(page);
  const user = await createTestUser("today-waiting");
  await seedMoneyIn(user.id); // G2 (Work, plan), G5 (own split), Gift (ask)
  await signInAs(page, user, "/today");

  await expect(page.getByTestId("next-card")).toHaveAttribute("data-next", "assign");
  await expect(page.getByTestId("next-heading")).toHaveText("₱26,550 from 3 incomes is waiting for a job");
  const chips = page.getByTestId("next-chips");
  await expect(chips).toContainText("Work");
  await expect(chips).toContainText("Side hustle");
  await expect(chips).toContainText("Gift");
  await expect(chips.getByText("Needs a job")).toHaveCount(1);
  await expect(page.getByText("Gift needs you to pick one.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Give them a job/ })).toBeVisible();

  await expect(page.getByTestId("shelf-legend-preview")).toContainText(`Where the ${formatPeso(2_655_000)} waiting would go (Gift shown as Plan A)`);
  await expect(page.getByTestId("slot-emergency").getByTestId("pending")).toHaveCount(1);
  await expect(page.getByTestId("slot-tax")).toHaveAttribute("data-pending-minor", String(138_000 + 35_000 + 300));

  await page.getByRole("link", { name: /Give them a job/ }).click();
  await page.waitForURL("**/money-in");
  expect(errors).toEqual([]);
});

test("+ Add income opens the form on Money in with focus in Amount", async ({ page }) => {
  const user = await createTestUser("today-add");
  await signInAs(page, user, "/today");
  await page.getByTestId("add-income").click();
  await page.waitForURL("**/money-in?add=1");
  await expect(page.getByLabel("Amount received")).toBeFocused();
});

test("no payday date (D-15): the days text and per-day line are gone, safe to spend stays; no goals shows one inviting line", async ({ page }) => {
  const user = await createTestUser("today-nodate");
  const seed = await seedToday(user.id, { paydayInDays: null, emergencyGoal: false });
  await seedSpending(user.id, seed);
  await signInAs(page, user, "/money-in");
  await confirmAllAndSend(page);
  await page.goto("/today");

  await expect(page.getByTestId("safe-amount")).toHaveText("₱345.43");
  await expect(page.getByTestId("today-date")).not.toContainText("until payday");
  await expect(page.getByTestId("per-day")).toHaveCount(0);
  await expect(page.getByTestId("goals-empty")).toContainText("Saving toward something?");
  await expect(page.getByRole("link", { name: "Add a goal in Plans" })).toHaveAttribute("href", "/plans/goals");
});

test("a user with nothing: honest empty states, no sample numbers, sync banner", async ({ page }) => {
  const user = await createTestUser("today-empty");
  await signInAs(page, user, "/today");
  await expect(page.getByTestId("sync-off-banner")).toHaveText("Spending from your phone shows here when sync is on in the Salin app.");
  await expect(page.getByTestId("next-heading")).toHaveText("Add your pay when it lands");
  await expect(page.getByRole("link", { name: "+ Add income" }).first()).toBeVisible();
  await expect(page.getByText("Your buckets show here once you have a plan.")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("₱");
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("under 720px the shelf scrolls inside its card and the page never does", async ({ page }) => {
  await g9(page);
  const vw = page.viewportSize()?.width ?? 1440;
  test.skip(vw > 720, "desktop layout");
  // the page's styles stream in after load: an unstyled shelf has no width yet
  await expect(page.getByTestId("shelf-scroll")).toBeVisible();
  const { scroll, client } = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="shelf-scroll"]') as HTMLElement;
    return { scroll: el.scrollWidth, client: el.clientWidth };
  });
  expect(scroll).toBeGreaterThan(client);
  expect(await noHorizontalScroll(page)).toBe(true);
});
