import { expect, test } from "@playwright/test";

// The guide uses the seeded user (signed in by global setup); it only reads.
test.use({ storageState: "tests/e2e/.auth/seeded.json" });

const noHorizontalScroll = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("Help opens on the topic for this page, one topic at a time, and closes with Escape", async ({ page }) => {
  await page.goto("/plans/accounts");
  await page.getByTestId("help-button").click();
  const dialog = page.getByRole("dialog", { name: "How Salin works" });
  await expect(dialog).toBeVisible();

  // The first topic is the page's own, and it's open.
  const first = dialog.getByRole("button", { name: /Accounts/ }).first();
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await expect(dialog.getByText("This page")).toBeVisible();
  await expect(dialog.getByText("Should hold").first()).toBeVisible();

  // Opening another closes the first.
  await dialog.getByRole("button", { name: /^Buckets/ }).click();
  await expect(dialog.getByRole("button", { name: /^Buckets/ })).toHaveAttribute("aria-expanded", "true");
  await expect(first).toHaveAttribute("aria-expanded", "false");
  expect(await noHorizontalScroll(page)).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("help-button")).toBeFocused();
});

test("Help follows the page: Plans pages and Today each lead with their own topic", async ({ page }) => {
  for (const [path, topic] of [
    ["/plans/split", /Your plan/],
    ["/plans/categories", /Categories/],
    ["/plans/goals", /Goals/],
    ["/money-in", /Money in and transfers/],
    ["/review", /Weekly review/],
  ] as const) {
    await page.goto(path);
    await page.getByTestId("help-button").click();
    const dialog = page.getByRole("dialog", { name: "How Salin works" });
    await expect(dialog.getByRole("button", { name: topic }).first()).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
  }
});

test("a topic's link goes to its page and closes the guide", async ({ page }) => {
  await page.goto("/review");
  await page.getByTestId("help-button").click();
  const dialog = page.getByRole("dialog", { name: "How Salin works" });
  await dialog.getByRole("button", { name: /^Your plan/ }).click();
  await dialog.getByRole("link", { name: "Open Split plan" }).click();
  await page.waitForURL("**/plans/split");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
