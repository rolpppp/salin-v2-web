import { expect, test, type Page } from "@playwright/test";
import { allocationsFor, planPercents, seedPlans, type PlansSeed } from "./helpers/plans-seed";
import { adminClient, createTestUser, eventsFor, type TestUser } from "./helpers/supabase";

// Not run in CI yet: needs local Supabase Auth (Docker). Each test makes its own user, seeds the Plans data and signs in.
test.use({ storageState: { cookies: [], origins: [] } });

async function signedInWithPlans(page: Page, next: string): Promise<{ user: TestUser; seed: PlansSeed }> {
  const user = await createTestUser("plans");
  const seed = await seedPlans(user.id);
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${next}$`));
  return { user, seed };
}

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function noHorizontalOverflow(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(scroll).toBeLessThanOrEqual(inner);
}

test.describe("Split plan", () => {
  test("shows the plan, totals and rules, with no overflow or console errors", async ({ page }) => {
    const errors = watchConsole(page);
    await signedInWithPlans(page, "/plans/split");
    await expect(page.getByTestId("active-plan")).toHaveText("Plan A is active");
    await expect(page.getByLabel("Living Plan A percent")).toHaveValue("50");
    await expect(page.getByLabel("Fun Plan B percent")).toHaveValue("20");
    await expect(page.getByTestId("total-A")).toContainText("100%");
    await expect(page.getByLabel("Scholarship is kept in")).toBeVisible();
    await expect(page.getByLabel("Plan B switch amount")).toHaveValue("50,000");
    await expect(page.getByTestId("redirect-rule")).toContainText("until January 1, 2027");
    await noHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test("a plan that does not add up to 100 is refused and the last saved plan stays active", async ({ page }) => {
    const { user, seed } = await signedInWithPlans(page, "/plans/split");
    const living = page.getByLabel("Living Plan A percent");
    await living.fill("45");
    await living.blur();
    await expect(page.getByTestId("plan-messages")).toContainText("Plan A adds up to 95%. Add 5% to another bucket.");
    await expect(page.getByTestId("plan-messages")).toContainText("Not saved yet");
    await page.reload();
    await expect(page.getByLabel("Living Plan A percent")).toHaveValue("50");
    expect((await planPercents(user.id, "A"))[seed.bucket.living]).toBe(5000);
  });

  test("a valid edit saves, survives a reload, is tracked, and leaves confirmed paydays untouched", async ({ page }) => {
    const { user, seed } = await signedInWithPlans(page, "/plans/split");
    const before = await allocationsFor(user.id);
    await page.getByLabel("Living Plan A percent").fill("45");
    await page.getByLabel("Living Plan A percent").blur();
    await page.getByLabel("Emergency fund Plan A percent").fill("35");
    await page.getByLabel("Emergency fund Plan A percent").blur();
    await expect(page.getByTestId("live-region")).toContainText("Plan A saved");
    await page.reload();
    await expect(page.getByLabel("Living Plan A percent")).toHaveValue("45");
    await expect(page.getByLabel("Emergency fund Plan A percent")).toHaveValue("35");
    const a = await planPercents(user.id, "A");
    expect(Object.values(a).reduce((s, v) => s + v, 0)).toBe(10000);
    expect(a[seed.bucket.living]).toBe(4500);
    expect(await allocationsFor(user.id)).toEqual(before);
    expect((await eventsFor(user.id, "plan_edited")).some((e) => (e.props as { field?: string }).field === "percent")).toBe(true);
  });

  test("changing Kept in saves, persists, and leaves past allocations' destinations alone", async ({ page }) => {
    const { user, seed } = await signedInWithPlans(page, "/plans/split");
    const before = await allocationsFor(user.id);
    await page.getByLabel("Living is kept in").selectOption(seed.accounts.gcash);
    await expect(page.getByTestId("live-region")).toContainText("Living is now kept in GCash");
    await page.reload();
    await expect(page.getByLabel("Living is kept in")).toHaveValue(seed.accounts.gcash);
    expect(await allocationsFor(user.id)).toEqual(before);
  });

  test("the Plan B switch amount saves in centavos and moves the Emergency goal with it", async ({ page }) => {
    const { user } = await signedInWithPlans(page, "/plans/split");
    const amount = page.getByLabel("Plan B switch amount");
    await amount.fill("75,000.50");
    await amount.blur();
    await expect(page.getByTestId("live-region")).toContainText("Plan B switch is now ₱75,000.50");
    await page.reload();
    await expect(page.getByLabel("Plan B switch amount")).toHaveValue("75,000.50");
    const { data } = await adminClient().from("goals").select("targetMinor").eq("user_id", user.id).eq("isPlanSwitch", true).single();
    expect(data?.targetMinor).toBe(7_500_050);
    await amount.fill("0");
    await amount.blur();
    await expect(page.getByText("Enter an amount above ₱0 and up to ₱10,000,000.")).toBeVisible();
  });

  test("works by keyboard: tab to a percent, type, Enter saves", async ({ page }) => {
    const { user, seed } = await signedInWithPlans(page, "/plans/split");
    const fun = page.getByLabel("Fun Plan B percent");
    await fun.focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("10");
    await page.getByLabel("Emergency fund Plan B percent").fill("30");
    await page.getByLabel("Emergency fund Plan B percent").press("Enter");
    await expect(page.getByTestId("live-region")).toContainText("Plan B saved");
    expect((await planPercents(user.id, "B"))[seed.bucket.fun]).toBe(1000);
  });
});

test.describe("Income sources", () => {
  test("lists sources with their rules, no overflow, no console errors", async ({ page }) => {
    const errors = watchConsole(page);
    await signedInWithPlans(page, "/plans/income");
    await expect(page.getByLabel("Rule for Work")).toHaveValue("plan");
    await expect(page.getByLabel("Rule for Freelance")).toHaveValue("own");
    await expect(page.getByLabel("Rule for Gifts")).toHaveValue("ask");
    await expect(page.getByText("Uses Plan A percentages.")).toBeVisible();
    await expect(page.getByLabel("Name of Work")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Archive Work" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Gifts" })).toBeVisible();
    await noHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test("own split editor: 90% shows what is missing and is stored as it is, 100% is complete", async ({ page }) => {
    const { user } = await signedInWithPlans(page, "/plans/income");
    const total = page.locator('[data-testid^="own-total-"]').first();
    await expect(total).toHaveText("100%");
    const fun = page.getByLabel("Fun percent for Freelance");
    await fun.fill("40");
    await fun.blur();
    await expect(total).toHaveText("90% · needs 100%");
    // The split saves on blur in the background; reloading before it lands would cancel it.
    await expect
      .poll(async () => ((await adminClient().from("income_source_split_lines").select("percentBp").eq("user_id", user.id).is("deletedAt", null)).data ?? []).reduce((s, l) => s + l.percentBp, 0))
      .toBe(9000);
    await page.reload();
    await expect(page.getByLabel("Fun percent for Freelance")).toHaveValue("40");
    const { data } = await adminClient().from("income_source_split_lines").select("percentBp").eq("user_id", user.id).is("deletedAt", null);
    expect((data ?? []).reduce((s, l) => s + l.percentBp, 0)).toBe(9000);
    await page.getByLabel("Fun percent for Freelance").fill("50");
    await page.getByLabel("Fun percent for Freelance").blur();
    await expect(total).toHaveText("100%");
    await page.getByLabel("Tax percent for Freelance").fill("0");
    await page.getByLabel("Tax percent for Freelance").blur();
    await expect(total).toHaveText("90% · needs 100%");
  });

  test("changing a rule persists, and Keep it whole picks a bucket", async ({ page }) => {
    const { user, seed } = await signedInWithPlans(page, "/plans/income");
    await page.getByLabel("Rule for Gifts").selectOption("whole");
    await expect(page.getByLabel("Bucket for Gifts")).toBeVisible();
    await page.getByLabel("Bucket for Gifts").selectOption(seed.bucket.living);
    // The save is a server action; reload only once it has landed.
    await expect
      .poll(async () => (await adminClient().from("income_sources").select("wholeBucketId").eq("user_id", user.id).eq("name", "Gifts").single()).data?.wholeBucketId)
      .toBe(seed.bucket.living);
    await page.reload();
    await expect(page.getByLabel("Rule for Gifts")).toHaveValue("whole");
    await expect(page.getByLabel("Bucket for Gifts")).toHaveValue(seed.bucket.living);
    const { data } = await adminClient().from("income_sources").select("rule, wholeBucketId").eq("user_id", user.id).eq("name", "Gifts").single();
    expect(data).toEqual({ rule: "whole", wholeBucketId: seed.bucket.living });
    expect((await eventsFor(user.id, "plan_edited")).some((e) => (e.props as { field?: string }).field === "rule")).toBe(true);
  });

  test("Rent is never offered as a bucket to keep money whole in", async ({ page }) => {
    await signedInWithPlans(page, "/plans/income");
    await page.getByLabel("Rule for Gifts").selectOption("whole");
    await expect(page.getByLabel("Bucket for Gifts").locator("option", { hasText: "Rent" })).toHaveCount(0);
  });

  test("+ Add income source: pick a preset, it gets that kind's rule and its name field is focused", async ({ page }) => {
    const { user } = await signedInWithPlans(page, "/plans/income");
    await page.getByRole("button", { name: "+ Add income source" }).click();
    await page.getByRole("group", { name: "Income kinds" }).getByRole("button", { name: "Scholarship" }).click();
    await expect(page.getByLabel("Name of Scholarship")).toBeFocused();
    await expect(page.getByLabel("Rule for Scholarship")).toHaveValue("whole");
    await expect(page.getByLabel("Bucket for Scholarship")).toHaveValue(/.+/);
    const { data: cat } = await adminClient().from("income_sources").select("categoryId").eq("user_id", user.id).eq("name", "Scholarship").single();
    expect(cat?.categoryId).toBeTruthy();

    await page.getByRole("button", { name: "+ Add income source" }).click();
    await page.getByRole("group", { name: "Income kinds" }).getByRole("button", { name: "Side hustle" }).click();
    await expect(page.getByLabel("Rule for Side hustle")).toHaveValue("own");
    await expect(page.getByLabel("Tax percent for Side hustle")).toHaveValue("10");
    await expect(page.getByLabel("Sinking percent for Side hustle")).toHaveValue("40");
    await expect(page.getByLabel("Fun percent for Side hustle")).toHaveValue("50");
  });

  test("a new source can be renamed and removed; one with income can only be archived and restored", async ({ page }) => {
    await signedInWithPlans(page, "/plans/income");
    await page.getByLabel("Name of Gifts").fill("Birthday money");
    await page.getByLabel("Name of Gifts").blur();
    await expect(page.getByTestId("live-region")).toContainText("Renamed to Birthday money.");
    await page.reload();
    await expect(page.getByLabel("Rule for Birthday money")).toBeVisible();
    await page.getByRole("button", { name: "Remove Birthday money" }).click();
    await expect(page.getByLabel("Rule for Birthday money")).toHaveCount(0);

    await page.getByRole("button", { name: "Archive Work" }).click();
    await expect(page.getByLabel("Rule for Work")).toHaveCount(0);
    await page.getByRole("button", { name: "Restore Work" }).click();
    await expect(page.getByLabel("Rule for Work")).toBeVisible();
  });
});
