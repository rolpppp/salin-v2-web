import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers/money-in";
import { adminClient, createTestUser } from "./helpers/supabase";
import { seedToday } from "./helpers/today";

/**
 * First-visit tour (tickets 33, 35): starts with ?tour=1 (the onboarding Done buttons), walks Today, Money in, Review
 * and Plans, then the header; replays from Help on any page. Run with NEXT_PUBLIC_ONBOARDING_ENABLED=false.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const card = (page: Page) => page.getByTestId("tour-card");
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function arrive(page: Page, label: string, view: "full" | "simple" = "full") {
  const user = await createTestUser(label);
  await seedToday(user.id);
  if (view === "simple") await adminClient().from("user_profiles").update({ viewMode: "simple" }).eq("user_id", user.id);
  await signInAs(page, user, "/today");
  await page.goto("/today?tour=1");
  return user;
}

test("full view: Today, then Money in, Review and Plans, then the header; Done goes back to Today", async ({ page }) => {
  await arrive(page, "tour-full");
  await expect(card(page)).toHaveAttribute("data-step", "safe");
  await expect(page).toHaveURL(/\/today$/); // the param is stripped, so a reload doesn't restart it
  await expect(page.getByTestId("tour-next")).toBeFocused();

  const seen: { step: string; path: string }[] = [];
  for (let i = 0; i < 30; i++) {
    const step = (await card(page).getAttribute("data-step")) ?? "";
    seen.push({ step, path: new URL(page.url()).pathname });
    const next = page.getByTestId("tour-next");
    if ((await next.textContent())?.includes("Done")) {
      await expect(card(page)).toContainText(`${seen.length} of ${seen.length}`);
      await next.click();
      break;
    }
    await next.click();
    await expect(card(page)).not.toHaveAttribute("data-step", step);
  }
  const at = (id: string) => seen.find((s) => s.step === id)?.path;
  expect(at("safe")).toBe("/today");
  expect(at("shelf")).toBe("/today");
  expect(at("moneyin-steps")).toBe("/money-in");
  expect(at("review-slip")).toBe("/review");
  expect(at("plans-nav")).toBe("/plans/split");
  expect(seen.at(-1)?.step).toBe("avatar-full");
  // Pages in nav order, each visited once.
  expect([...new Set(seen.map((s) => s.path))]).toEqual(["/today", "/money-in", "/review", "/plans/split"]);

  await expect(page.getByTestId("tour")).toHaveCount(0);
  await expect(page).toHaveURL(/\/today$/);
  expect(await page.evaluate(() => localStorage.getItem("salin.tour.done"))).toBe("1");
  await page.reload();
  await expect(page.getByTestId("safe-amount")).toBeVisible();
  await expect(page.getByTestId("tour")).toHaveCount(0);
});

test("the next button names the next page; Back crosses back; a reload mid-tour picks it up again", async ({ page }) => {
  await arrive(page, "tour-cross");
  await expect(card(page)).toHaveAttribute("data-step", "safe");
  for (let i = 0; i < 10; i++) {
    const label = (await page.getByTestId("tour-next").textContent()) ?? "";
    if (label.includes("Next: Money in")) break;
    const step = await card(page).getAttribute("data-step");
    await page.getByTestId("tour-next").click();
    await expect(card(page)).not.toHaveAttribute("data-step", step!);
  }
  await page.getByTestId("tour-next").click();
  await expect(page).toHaveURL(/\/money-in$/);
  await expect(card(page)).toHaveAttribute("data-step", "moneyin-steps");

  await page.reload();
  await expect(card(page)).toHaveAttribute("data-step", "moneyin-steps");

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(card(page)).toHaveAttribute("data-step", "streak");
});

test("Escape ends it anywhere; Help's 'Take the tour' starts it again from Today, from any page", async ({ page }) => {
  await arrive(page, "tour-replay");
  await expect(card(page)).toHaveAttribute("data-step", "safe");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tour")).toHaveCount(0);

  await page.goto("/review");
  await page.getByTestId("help-button").click();
  await page.getByTestId("take-tour").click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(card(page)).toHaveAttribute("data-step", "safe");
  await expect(card(page)).toContainText("1 of");
});

test("simple view: starts on today's number, the lit element and the card are both on screen, and it visits the tabs", async ({ page }) => {
  await arrive(page, "tour-simple", "simple");
  await expect(card(page)).toHaveAttribute("data-step", "hero");
  await expect(card(page)).toContainText("Your number for today");
  await page.getByTestId("tour-next").click();
  await expect(card(page)).toHaveAttribute("data-step", "actions");
  // Give the smooth scroll time to settle, then the actions row must sit inside the viewport, clear of the card.
  await expect
    .poll(async () => {
      const target = await page.locator('[data-tour="actions"]').boundingBox();
      const c = await card(page).boundingBox();
      const vh = page.viewportSize()!.height;
      return !!target && !!c && target.y >= 0 && target.y + target.height <= vh && (target.y + target.height <= c.y || target.y >= c.y + c.height || c.x >= target.x + target.width || c.x + c.width <= target.x);
    })
    .toBe(true);
  expect(await noHorizontalScroll(page)).toBe(true);

  for (let i = 0; i < 10 && !(await card(page).getAttribute("data-step"))?.startsWith("moneyin"); i++) {
    const step = await card(page).getAttribute("data-step");
    await page.getByTestId("tour-next").click();
    await expect(card(page)).not.toHaveAttribute("data-step", step!);
  }
  await expect(page).toHaveURL(/\/money-in$/);
  expect(await noHorizontalScroll(page)).toBe(true);
});
