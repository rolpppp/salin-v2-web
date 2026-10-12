import { expect, test, type Page } from "@playwright/test";
import { formatPeso } from "../../lib/money";
import { createTestUser, eventsFor } from "./helpers/supabase";
import { signInAs } from "./helpers/money-in";
import { addOthersPayday, confirmAllAndSend, seedSpending, seedToday } from "./helpers/today";

/**
 * Ticket 15: the grow param, the completion burst and reduced motion, and the Plans sub-nav at 390px.
 * Needs the local Supabase stack, like the other specs. Each test makes its own user (the four projects run in parallel).
 */
test.use({ storageState: { cookies: [], origins: [] } });

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function confirmed(page: Page, name: string) {
  const user = await createTestUser(name);
  const seed = await seedToday(user.id);
  await seedSpending(user.id, seed);
  await signInAs(page, user, "/money-in");
  return user;
}

const burstOpacity = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((el) => getComputedStyle(el, "::before").display);

test("Money in's 'See your buckets grow' goes to /today?grow=confirm, plays once and strips the param", async ({ page }) => {
  const errors = watchConsole(page);
  await confirmed(page, "motion-grow");
  await confirmAllAndSend(page);
  const card = page.getByTestId("completion-card");
  await expect(card).toHaveAttribute("data-burst", "payday");
  await expect(page.getByRole("link", { name: /See your buckets grow/ })).toHaveAttribute("href", "/today?grow=confirm");

  await page.getByRole("link", { name: /See your buckets grow/ }).click();
  await expect(page).toHaveURL(/\/today$/);
  // the real numbers are in the DOM whether or not the animation is running
  await expect(page.getByTestId("shelf-total")).toBeVisible();
  await expect(page.getByTestId("slot-emergency").getByTestId("slot-amount")).toHaveText(formatPeso(554_528));
  await expect(page.getByTestId("live-region")).toContainText("Your buckets are updated.");

  // a refresh doesn't replay it: no flag, no param
  await page.reload();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator("[data-grow]")).toHaveCount(0);
  expect(await noHorizontalScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("/today?grow=onboarding grows from zero, then strips the param", async ({ page }) => {
  await confirmed(page, "motion-onb");
  await confirmAllAndSend(page);
  await page.goto("/today?grow=onboarding");
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId("slot-emergency").getByTestId("slot-amount")).toHaveText(formatPeso(554_528));
  await expect(page.locator("[data-grow]")).toHaveCount(0, { timeout: 6_000 }); // cleared when the animations are over
});

test("an unknown ?grow value is ignored", async ({ page }) => {
  await confirmed(page, "motion-bad");
  await page.goto("/today?grow=party");
  await expect(page.getByTestId("shelf")).toBeVisible();
  await expect(page.locator("[data-grow]")).toHaveCount(0);
});

test("reduced motion: no burst, no ribbon animation, final numbers at once, still announced", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = watchConsole(page);
  await confirmed(page, "motion-reduced");
  await confirmAllAndSend(page);
  // the burst is attribute-driven CSS and is switched off entirely
  expect(await burstOpacity(page, "completion-card")).toBe("none");

  await page.goto("/today?grow=confirm");
  const ribbon = page.getByTestId("slot-emergency").getByTestId("ribbon");
  await expect(ribbon).toBeVisible();
  expect(await ribbon.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await expect(page.getByTestId("slot-emergency").getByTestId("slot-amount")).toHaveText(formatPeso(554_528));
  await expect(page.getByTestId("live-region")).toContainText("Your buckets are updated.");
  expect(errors).toEqual([]);
});

test("with motion allowed the burst layer exists on the completion card and the ribbons animate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await confirmed(page, "motion-on");
  await confirmAllAndSend(page);
  expect(await burstOpacity(page, "completion-card")).not.toBe("none");
  await page.getByRole("link", { name: /See your buckets grow/ }).click();
  await expect(page.getByTestId("slot-emergency")).toBeVisible();
});

test("closing the week bursts once in this view; a later visit doesn't", async ({ page }) => {
  await confirmed(page, "motion-review");
  await confirmAllAndSend(page);
  await page.goto("/review");
  await page.getByRole("button", { name: "Close the week" }).click();
  await expect(page.getByTestId("week-closed")).toHaveAttribute("data-burst", "week");
  await page.reload();
  await expect(page.getByTestId("week-closed")).toBeVisible();
  await expect(page.getByTestId("week-closed")).not.toHaveAttribute("data-burst");
});

test("goal_milestone_passed fires once per crossing, from the confirm, not from viewing Today", async ({ page }) => {
  const user = await createTestUser("motion-milestone");
  const seed = await seedToday(user.id);
  await signInAs(page, user, "/money-in");
  await confirmAllAndSend(page); // Emergency 11%: nothing crossed
  const count = async () => (await eventsFor(user.id, "goal_milestone_passed")).length;
  expect(await count()).toBe(0);
  await addOthersPayday(user.id, seed);
  await confirmAllAndSend(page); // Emergency 25%: one crossing
  await expect.poll(count).toBe(1);
  await page.goto("/today?grow=confirm");
  await page.reload();
  expect(await count()).toBe(1); // rendering and refreshing never fire it
});

test("Plans sub-nav at 390px shows all five sections, including Goals, with no horizontal scroll", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 1440) > 720, "the narrow layout is the point");
  const user = await createTestUser("motion-plans");
  await seedToday(user.id);
  await signInAs(page, user, "/plans/goals");
  const nav = page.getByRole("radiogroup", { name: "Plans sections" });
  for (const name of ["Split plan", "Income", "Accounts", "Categories", "Goals"]) {
    const item = nav.getByRole("radio", { name });
    await expect(item).toBeVisible();
    const box = await item.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= (viewport?.width ?? 390)).toBe(true);
  }
  await expect(nav.getByRole("radio", { name: "Goals" })).toHaveAttribute("aria-checked", "true");
  expect(await noHorizontalScroll(page)).toBe(true);
});
