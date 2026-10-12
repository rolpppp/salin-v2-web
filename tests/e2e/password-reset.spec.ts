import { expect, test, type Page } from "@playwright/test";
import { createTestUser, TEST_PASSWORD } from "./helpers/supabase";

// Every test here starts signed out.
test.use({ storageState: { cookies: [], origins: [] } });

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const NEW_PASSWORD = "salin-e2e-Brand-New-9!";

/** Polls Mailpit for the newest reset email to `email` and returns its verify link (GoTrue's default template). */
async function resetLinkFor(email: string): Promise<string> {
  let link: string | null = null;
  await expect
    .poll(
      async () => {
        const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
        const { messages } = (await search.json()) as { messages?: Array<{ ID: string }> };
        if (!messages?.length) return false;
        const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string; HTML: string };
        const found = /https?:\/\/\S+?\/auth\/v1\/verify\?\S+/.exec(msg.Text) ?? /https?:\/\/[^\s"<]+?\/auth\/v1\/verify\?[^\s"<]+/.exec(msg.HTML);
        link = found ? found[0].replaceAll("&amp;", "&") : null;
        return link !== null;
      },
      { message: `reset email for ${email}`, timeout: 20_000 },
    )
    .toBe(true);
  return link as unknown as string;
}

async function requestReset(page: Page, email: string) {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(`If there's a Salin account for ${email}`);
}

async function signInWith(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("reset by email: link opens signed in, new password works, old one doesn't", async ({ page }) => {
  const user = await createTestUser("reset");

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password\?email=/);
  await expect(page.getByLabel("Email")).toHaveValue(user.email);

  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("Open it in this browser. It expires in an hour.");
  await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();

  const link = await resetLinkFor(user.email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect(page.getByText("also the password for the Salin phone app")).toBeVisible();

  await page.getByLabel("New password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Use at least 8 characters for your password.")).toBeVisible();

  await page.getByLabel("New password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "current password" })).toBeVisible();

  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId("password-updated")).toContainText("Password updated");

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await signInWith(page, user.email, user.password);
  await expect(page.getByRole("alert").filter({ hasText: "That email and password don't match" })).toBeVisible();
  await signInWith(page, user.email, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/today$/);
});

test("an unknown email gets the same notice (no account enumeration)", async ({ page }) => {
  const email = `nobody-${Date.now()}@e2e.salin.test`;
  await requestReset(page, email);
  await expect(page.getByRole("status")).toContainText("Open it in this browser. It expires in an hour.");
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
});

test("Send it again sends another link", async ({ page }) => {
  const user = await createTestUser("again");
  await requestReset(page, user.email);
  await resetLinkFor(user.email);
  await page.getByRole("button", { name: "Send it again" }).click();
  await expect(page.getByRole("status")).toContainText(`If there's a Salin account for ${user.email}`);
});

test("the link opened in a different browser shows the expired state and a way to get a new one", async ({ page, browser, baseURL }) => {
  const user = await createTestUser("otherbrowser");
  await requestReset(page, user.email);
  const link = await resetLinkFor(user.email);

  const other = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const otherPage = await other.newPage();
  await otherPage.goto(link);
  await expect(otherPage).toHaveURL(/\/forgot-password\?error=link$/);
  await expect(otherPage.getByRole("alert").filter({ hasText: "expired or was opened in a different browser" })).toBeVisible();
  await expect(otherPage.getByLabel("Email")).toBeVisible();
  await other.close();
});

test("/reset-password without a recovery session shows no form", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByText("This reset link has expired or was opened in a different browser.")).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Get a new reset link" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test("a normal password sign-in can't use /reset-password: no form, a link to get a reset email", async ({ page }) => {
  const user = await createTestUser("signedin");
  await page.goto("/sign-in");
  await signInWith(page, user.email, user.password);
  await expect(page).toHaveURL(/\/today$/);

  await page.goto("/reset-password");
  await expect(page.getByText("To change your password, use a reset link from your email.")).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Get a new reset link" }).click();
  await expect(page).toHaveURL(/\/forgot-password\?email=/);
  await expect(page.getByLabel("Email")).toHaveValue(user.email);
});

test("forgot-password validates the email and is reachable signed out", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await page.getByLabel("Email").fill("nope");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/doesn't look like an email address/)).toBeVisible();
});
