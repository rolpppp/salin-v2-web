import { expect, test, type Page } from "@playwright/test";
import { formatPeso } from "../../lib/money";
import { zonedParts } from "../../lib/time";
import { signInAs } from "./helpers/money-in";
import { SLIP, pesoToMinor, seedReview, userClient, type ReviewSeed } from "./helpers/review";
import { adminClient, createTestUser, eventsFor, TEST_TIME_ZONE, type TestUser } from "./helpers/supabase";

// Each test makes its own user: the four projects (390/1440 x light/dark) run in parallel and these tests write.
async function setup(page: Page, opts?: Parameters<typeof seedReview>[1]): Promise<{ user: TestUser; seed: ReviewSeed }> {
  const user = await createTestUser("review");
  const seed = await seedReview(user, opts);
  await signInAs(page, user, "/review");
  return { user, seed };
}

test.use({ storageState: { cookies: [], origins: [] } });

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const slipAmount = (page: Page, label: string) =>
  page.getByTestId("slip-lines").locator(":scope > div").filter({ has: page.getByText(label, { exact: true }) }).locator("[data-amount]");
const readSlip = async (page: Page) => {
  const labels = ["Came in", "Spent", "Put away", "Tax set aside", "Cushions & kept whole", "To assign", "Safe to spend"] as const;
  const out: Record<string, number> = {};
  for (const l of labels) out[l] = pesoToMinor((await slipAmount(page, l).innerText()).trim());
  return out;
};

test("the week slip reconciles with spending from Tax and an overspent Living (BR 8.3)", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page);

  await expect(page.getByRole("heading", { level: 1, name: /^Week of / })).toBeVisible();
  await expect(page.getByRole("list", { name: "Review progress" })).toContainText("Look back");
  const slip = await readSlip(page);
  expect(slip).toEqual({
    "Came in": SLIP.cameIn,
    Spent: SLIP.spent,
    "Put away": SLIP.putAway,
    "Tax set aside": SLIP.tax,
    "Cushions & kept whole": SLIP.cushions,
    "To assign": SLIP.toAssign,
    "Safe to spend": SLIP.safe,
  });
  // the identity itself, on what the screen shows
  expect(slip["Came in"]).toBe(slip.Spent + slip["Put away"] + slip["Tax set aside"] + slip["Cushions & kept whole"] + slip["To assign"] + slip["Safe to spend"]);
  await expect(page.getByTestId("slip-mismatch")).toHaveCount(0);
  await expect(page.getByTestId("slip-footer")).toContainText("no earlier week to compare yet");
  await expect(page.getByRole("group", { name: "Week slip" }).getByText("WEEK CLOSED")).toHaveCount(0);

  // where spending went: Living and Fun bars, and the spend from Tax is called out
  await expect(page.getByTestId("spend-bars").getByRole("listitem")).toHaveCount(2);
  await expect(page.getByTestId("spend-note")).toContainText("came from savings or set-asides (Tax)");
  // progress: this week's change in the Emergency fund, not the total
  await expect(page.getByTestId("emergency-change")).toHaveText(`+${formatPeso(736_000)}`);

  expect(await noHorizontalScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("the observation names the biggest category; Cover from Buffer covers the shortfall and the slip still reconciles", async ({ page }) => {
  const { user, seed } = await setup(page);
  await expect(page.getByTestId("observation")).toContainText(`Living ran ${formatPeso(SLIP.livingNeeds)} short. Groceries was ${formatPeso(200_000)} of the ${formatPeso(200_000)} spent.`);
  await expect(page.getByRole("button", { name: "Cover from Buffer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move 1% from Fun to Living" })).toBeVisible();
  // exactly one primary button on the screen
  await expect(page.locator("main button").filter({ hasText: "Close the week" })).toHaveCount(1);

  await page.getByRole("button", { name: "Cover from Buffer" }).click();
  await expect(page.getByTestId("live-region")).toContainText(`Covered Living with ${formatPeso(SLIP.livingNeeds)} from Buffer.`);
  await expect(page.getByRole("heading", { name: "One thing to look at" })).toBeFocused();
  await expect(page.getByTestId("observation")).toContainText("You covered Living from Buffer this week.");
  await expect(page.getByRole("button", { name: "Cover from Buffer" })).toHaveCount(0);

  const { data: covers } = await adminClient().from("bucket_covers").select("fromBucketId, toBucketId, amountMinor").eq("user_id", user.id);
  expect(covers).toEqual([{ fromBucketId: seed.bucketIds.buffer, toBucketId: seed.bucketIds.living, amountMinor: SLIP.livingNeeds }]);
  expect(await eventsFor(user.id, "cover_used")).toHaveLength(1);

  // a cover moves money between buckets: Safe to spend rises by the cover, Cushions fall by it, the identity holds
  const slip = await readSlip(page);
  expect(slip["Safe to spend"]).toBe(SLIP.safe + SLIP.livingNeeds);
  expect(slip["Cushions & kept whole"]).toBe(SLIP.cushions - SLIP.livingNeeds);
  expect(slip["Came in"]).toBe(slip.Spent + slip["Put away"] + slip["Tax set aside"] + slip["Cushions & kept whole"] + slip["To assign"] + slip["Safe to spend"]);
  await expect(page.getByTestId("slip-mismatch")).toHaveCount(0);
});

test("Move 1% from Fun to Living changes BOTH plans, keeps them at 100%, and says so", async ({ page }) => {
  const { user, seed } = await setup(page);
  const db = adminClient();
  const pcts = async () => {
    const { data: plans } = await db.from("allocation_plans").select("id, key").eq("user_id", user.id).is("deletedAt", null).order("key");
    const out: Record<string, { living: number; fun: number; total: number }> = {};
    for (const p of plans ?? []) {
      const { data: lines } = await db.from("allocation_plan_lines").select("bucketId, percentBp").eq("planId", p.id).is("deletedAt", null);
      out[p.key] = {
        living: lines?.find((l) => l.bucketId === seed.bucketIds.living)?.percentBp ?? 0,
        fun: lines?.find((l) => l.bucketId === seed.bucketIds.fun)?.percentBp ?? 0,
        total: (lines ?? []).reduce((t, l) => t + l.percentBp, 0),
      };
    }
    return out;
  };
  const before = await pcts();

  await page.getByRole("button", { name: "Move 1% from Fun to Living" }).click();
  await expect(page.getByTestId("live-region")).toContainText("Moved 1% from Fun money to Living in Plan A and Plan B. It starts with your next payday.");

  const after = await pcts();
  for (const k of ["A", "B"]) {
    expect(after[k].living).toBe(before[k].living + 100);
    expect(after[k].fun).toBe(before[k].fun - 100);
    expect(after[k].total).toBe(10_000);
  }
  expect((await eventsFor(user.id, "plan_edited")).map((e) => e.props)).toEqual([{ field: "percent" }]);
  // history is untouched: the confirmed allocations still carry the percentages they were confirmed with
  const { data: allocs } = await db.from("allocations").select("percentBp, planKey").eq("user_id", user.id).eq("bucketId", seed.bucketIds.living);
  expect(allocs?.every((a) => a.planKey === "A" && a.percentBp === 700)).toBe(true);
});

test("closing the week stores the row, stamps the slip, marks open items and can't be closed twice", async ({ page }) => {
  const { user } = await setup(page);
  const db = adminClient();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await expect(page.getByTestId("close-checks").getByRole("listitem")).toHaveCount(3);
  await expect(page.getByText("You can close with open items. They carry into next week.")).toBeVisible();
  await page.getByRole("button", { name: "Close the week" }).click();

  const card = page.getByTestId("week-closed");
  await expect(card.getByRole("heading", { name: "Week closed. Monday starts fresh." })).toBeVisible();
  await expect(card.getByRole("heading")).toBeFocused();
  await expect(page.getByRole("group", { name: "Week slip" }).getByText("WEEK CLOSED")).toBeVisible();
  await expect(card).toHaveAttribute("data-burst", "week");
  // Gift is still waiting and Living is below zero: those carry over; there is a transfer to send too
  await expect(card.locator('[data-check="assign"]')).toContainText("carries into next week");
  await expect(card.locator('[data-check="transfers"]')).toContainText("carries into next week");
  await expect(card.locator('[data-check="living"]')).toContainText("carries into next week");
  await expect(card.getByTestId("start-next")).toContainText("You start next week with");
  await expect(card.getByTestId("next-review")).toContainText(/^Next review: Sunday, /);
  await expect(page.getByTestId("live-region")).toContainText("Week closed. Monday starts fresh.");
  await expect(page.getByRole("button", { name: "Close the week" })).toHaveCount(0);

  const { data: rows } = await db.from("week_reviews").select("weekStart, checks, safeToSpendMinor, observation").eq("user_id", user.id);
  expect(rows).toHaveLength(1);
  expect(rows?.[0].checks).toEqual({ assign: false, transfers: false, living: false });
  expect(rows?.[0].safeToSpendMinor).toBe(SLIP.safe);
  expect(rows?.[0].observation).toContain("Living ran");
  expect(await eventsFor(user.id, "week_closed")).toEqual([expect.objectContaining({ props: { open_items_count: 3 } })]);

  // reload: still closed (a closed week is a record), and the checks come from the stored row
  await page.reload();
  await expect(page.getByTestId("week-closed")).toBeVisible();
  await expect(page.getByRole("group", { name: "Week slip" }).getByText("WEEK CLOSED")).toBeVisible();

  // closing again is harmless: the stored week comes back, no second row, no second event
  const client = await userClient(user);
  const again = await client.rpc("close_week", { p_week_start: rows?.[0].weekStart ?? "" });
  expect(again.error).toBeNull();
  expect(again.data?.[0].was_already_closed).toBe(true);
  expect((await db.from("week_reviews").select("id").eq("user_id", user.id)).data).toHaveLength(1);
  expect(await eventsFor(user.id, "week_closed")).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("the checks are computed by the server: a forged weekStart that isn't a week start is refused", async ({ page }) => {
  const { user } = await setup(page);
  const client = await userClient(user);
  const tuesday = new Date(Date.UTC(2026, 9, 6)).toISOString().slice(0, 10); // a Tuesday; weeks start on Monday
  const r = await client.rpc("close_week", { p_week_start: tuesday });
  expect(r.error?.message).toMatch(/not the first day of your week/);
  expect((await adminClient().from("week_reviews").select("id").eq("user_id", user.id)).data).toHaveLength(0);
});

test("an empty week says how to log spending and has nothing to fix yet", async ({ page }) => {
  await setup(page, { spending: false, confirm: false });
  await expect(page.getByTestId("spend-empty")).toHaveText("Nothing logged this week. Log spending on your phone and it shows here.");
  await expect(page.getByTestId("observation")).toContainText("Nothing to fix yet.");
  await expect(page.getByRole("button", { name: "Cover from Buffer" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Move 1% from Fun to Living" })).toHaveCount(0);
  await expect(page.getByTestId("slip-mismatch")).toHaveCount(0);
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("tab badges: Money in shows a dot and count while income waits; Review shows a dot only on the review day while the week is open", async ({ page }) => {
  const { user } = await setup(page, { spending: false });
  await page.goto("/today");
  // seedMoneyIn leaves the 5,000 gift waiting after G2 and G5 are confirmed
  await expect(page.getByTestId("badge-money-in")).toContainText("1");
  await expect(page.getByTestId("badge-money-in").getByRole("img", { name: "1 income waiting for a job" })).toBeVisible();
  // today is not (yet) the review day
  const dow = zonedParts(Date.now(), TEST_TIME_ZONE).weekday;
  await adminClient().from("user_profiles").update({ reviewDay: (dow + 1) % 7 }).eq("user_id", user.id);
  await page.reload();
  await expect(page.getByTestId("badge-review")).toHaveCount(0);
  await expect(page.getByTestId("badge-today")).toHaveCount(0); // only these two badges exist

  await adminClient().from("user_profiles").update({ reviewDay: dow }).eq("user_id", user.id);
  await page.reload();
  await expect(page.getByTestId("badge-review").getByRole("img", { name: "Review due" })).toBeVisible();

  // closing the week clears it
  await page.goto("/review");
  await page.getByRole("button", { name: "Close the week" }).click();
  await expect(page.getByTestId("week-closed")).toBeVisible();
  await expect(page.getByTestId("badge-review")).toHaveCount(0);
  await expect(page.getByTestId("badge-money-in")).toContainText("1"); // still waiting: it carries over
});

test("review_opened fires once per visit", async ({ page }) => {
  const { user } = await setup(page);
  await expect.poll(async () => (await eventsFor(user.id, "review_opened")).length).toBe(1);
  await page.getByRole("button", { name: "Cover from Buffer" }).click();
  await expect(page.getByTestId("observation")).toContainText("You covered Living");
  expect(await eventsFor(user.id, "review_opened")).toHaveLength(1);
});
