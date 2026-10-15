import { expect, test, type Page } from "@playwright/test";
import { createTestUser } from "./helpers/supabase";

const ROUTES: Array<{ path: string; heading: string | RegExp }> = [
  { path: "/today", heading: /^(Hello|Good (morning|afternoon|evening))/ },
  // The empty user's Money in title is its empty state; Review is titled by the week.
  { path: "/money-in", heading: "Nothing waiting" },
  { path: "/review", heading: /^Week of / },
  { path: "/plans/split", heading: "Plans" },
  { path: "/plans/income", heading: "Plans" },
  { path: "/plans/accounts", heading: "Plans" },
  { path: "/plans/categories", heading: "Plans" },
  { path: "/plans/goals", heading: "Plans" },
];

// A user who hasn't started onboarding lands on the Welcome step wherever they enter (/welcome/accounts resumes by draft).
const WELCOME_ROUTES = ["/welcome", "/welcome/accounts", "/today"];

function trackConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function noHorizontalOverflow(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(inner);
}

for (const route of ROUTES) {
  test(`renders ${route.path}`, async ({ page }) => {
    const errors = trackConsole(page);
    await page.goto(route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    await noHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
}

test.describe("not onboarded yet", () => {
  test.use({ storageState: "tests/e2e/.auth/fresh.json" });
  for (const path of WELCOME_ROUTES) {
    test(`${path} shows the Welcome step`, async ({ page }) => {
      const errors = trackConsole(page);
      await page.goto(path);
      await expect(page).toHaveURL(/\/welcome/);
      await expect(page.getByRole("heading", { level: 1, name: "Know what's fine to spend today." })).toBeVisible();
      await noHorizontalOverflow(page);
      expect(errors).toEqual([]);
    });
  }

  test("signing in before finishing onboarding opens Welcome, not Today (the sign-in redirect skips the proxy)", async ({ browser, baseURL }) => {
    const user = await createTestUser("smoke-new", { onboarded: false });
    const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/welcome/);
    await expect(page.getByRole("heading", { level: 1, name: "Know what's fine to spend today." })).toBeVisible();
    await context.close();
  });

  test("onboarding has no tabs", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Salin" })).toHaveCount(0);
  });
});

test("/sign-in renders for signed-out visitors", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const errors = trackConsole(page);
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
  await context.close();
});

test("/ redirects to /today and /plans to /plans/split", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/today$/);
  await page.goto("/plans");
  await expect(page).toHaveURL(/\/plans\/split$/);
});

test("unknown plans section and unknown route 404", async ({ page }) => {
  const res = await page.goto("/plans/nope");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
});

test("tabs are real links with an active state", async ({ page }) => {
  await page.goto("/review");
  const nav = page.getByRole("navigation", { name: "Salin" });
  await expect(nav.getByRole("link")).toHaveCount(4);
  await expect(nav.getByRole("link", { name: "Review" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current", "page");
});

test("keyboard: tab to a nav link and press Enter to navigate", async ({ page }) => {
  await page.goto("/today");
  const money = page.getByRole("navigation", { name: "Salin" }).getByRole("link", { name: "Money in" });
  await money.focus();
  await expect(money).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/money-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Nothing waiting" })).toBeVisible();
});

test("plans segmented control: arrow keys change section", async ({ page }) => {
  await page.goto("/plans/split");
  const group = page.getByRole("radiogroup", { name: "Plans sections" });
  await group.getByRole("radio", { name: "Split plan" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/plans\/income$/);
  await expect(group.getByRole("radio", { name: "Income" })).toBeChecked();
});

test("theme toggle switches, persists across reload, and does not flash", async ({ page }) => {
  await page.goto("/today");
  const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.getByRole("button", { name: "Switch theme" }).click();
  const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(after).not.toBe(before);
  const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  expect(["light", "dark"]).toContain(theme);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(theme);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(after);
});

test("follows the system colour scheme by default", async ({ page, colorScheme }) => {
  await page.goto("/today");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe(colorScheme === "dark" ? "rgb(16, 24, 26)" : "rgb(245, 248, 247)");
});

test("avatar menu opens with Account and Sign out", async ({ page }) => {
  await page.goto("/today");
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menuitem", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Account menu" })).toBeFocused();
});
