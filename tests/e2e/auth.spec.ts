import { expect, test, type Page } from "@playwright/test";
import { createTestUser, eventsFor, TEST_PASSWORD } from "./helpers/supabase";

// Every test here starts signed out and signs in through the real form.
test.use({ storageState: { cookies: [], origins: [] } });

async function signInWith(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

test("signed-out visitors are sent to sign-in with a next param, for any app route", async ({ page }) => {
  await page.goto("/review");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Freview$/);
  await page.goto("/plans/goals");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fplans%2Fgoals$/);
  // "/" is the public landing page (ticket 30): no redirect and no app tabs.
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("navigation", { name: "Salin" })).toHaveCount(0);
});

test("sign in lands on next, signed-in users skip sign-in, sign out returns to sign-in, web_signed_in is tracked", async ({ page }) => {
  const user = await createTestUser("flow");

  await page.goto("/review");
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await signInWith(page, user.email, user.password);
  await expect(page).toHaveURL(/\/review$/);

  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/today$/);

  await signOut(page);
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Ftoday$/);

  await signInWith(page, user.email, user.password);
  await expect(page).toHaveURL(/\/today$/);

  const events = await eventsFor(user.id, "web_signed_in");
  expect(events.map((e) => e.props)).toEqual([{ first_time: true }, { first_time: false }]);
});

test("wrong password shows a specific, plain error and stays on sign-in", async ({ page }) => {
  const user = await createTestUser("wrongpw");
  await page.goto("/sign-in");
  await signInWith(page, user.email, `${TEST_PASSWORD}-nope`);
  await expect(page.getByRole("alert").filter({ hasText: "That email and password don't match" })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await eventsFor(user.id, "web_signed_in")).length).toBe(0);
});

test("form validation says what is wrong and how to fix it", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await expect(page.getByText("Enter your password.")).toBeVisible();
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("x");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/doesn't look like an email address/)).toBeVisible();
});

test("an unsafe next param is ignored", async ({ page }) => {
  const user = await createTestUser("unsafe");
  await page.goto("/sign-in?next=//evil.example");
  await signInWith(page, user.email, user.password);
  await expect(page).toHaveURL(/\/today$/);
});

test("sign up creates an account that starts onboarding at Welcome", async ({ page }) => {
  const email = `signup-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.salin.test`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 8 characters for your password.")).toBeVisible();
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { level: 1, name: "Know what's fine to spend today." })).toBeVisible();
});
