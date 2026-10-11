import { expect, test } from "@playwright/test";
import { formatAud, formatPeso } from "../../lib/money";
import { EXPECTED } from "./helpers/supabase";

const fmt = (minor: number, currency: string) => (currency === "AUD" ? formatAud(minor) : formatPeso(minor));

test.describe("with synced mobile data", () => {
  test.use({ storageState: "tests/e2e/.auth/seeded.json" });

  test("greets by first name and shows the date", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`^Good (morning|afternoon|evening), ${EXPECTED.firstName}$`) })).toBeVisible();
  });

  test("accounts card shows exact balances; archived and deleted accounts are left out", async ({ page }) => {
    await page.goto("/today");
    const list = page.getByTestId("accounts-list");
    const rows = list.getByRole("listitem");
    await expect(rows).toHaveCount(EXPECTED.accounts.length);
    for (const [i, a] of EXPECTED.accounts.entries()) {
      await expect(rows.nth(i)).toContainText(a.name);
      await expect(rows.nth(i)).toContainText(fmt(a.minor, a.currency));
    }
    await expect(list).not.toContainText("Old wallet");
    await expect(list).not.toContainText("Deleted account");
  });

  test("spending this week excludes transfers, deleted rows and last week, per category and per currency", async ({ page }) => {
    await page.goto("/today");
    const php = page.getByTestId("spending-PHP");
    await expect(php.getByTestId("spending-total")).toHaveText(formatPeso(EXPECTED.php.total));
    const lines = php.getByTestId("spending-lines").getByRole("listitem");
    await expect(lines).toHaveCount(EXPECTED.php.lines.length);
    for (const [i, l] of EXPECTED.php.lines.entries()) {
      await expect(lines.nth(i)).toContainText(l.name);
      await expect(lines.nth(i)).toContainText(formatPeso(l.minor));
    }
    const aud = page.getByTestId("spending-AUD");
    await expect(aud.getByTestId("spending-total")).toHaveText(formatAud(EXPECTED.aud.total));
    await expect(aud).toContainText("Uncategorised");
  });

  test("no sync-off banner when rows exist", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByTestId("accounts-list")).toBeVisible();
    await expect(page.getByTestId("sync-off-banner")).toHaveCount(0);
  });

  test("no horizontal overflow and no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/today");
    await expect(page.getByTestId("accounts-list")).toBeVisible();
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(scroll).toBeLessThanOrEqual(inner);
    expect(errors).toEqual([]);
  });
});

test.describe("with no synced rows", () => {
  test.use({ storageState: "tests/e2e/.auth/empty.json" });

  test("shows the sync-off banner and honest empty states, never sample numbers", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByTestId("sync-off-banner")).toHaveText("Spending from your phone shows here when sync is on in the Salin app.");
    await expect(page.getByRole("heading", { name: "No accounts yet" })).toBeVisible();
    await expect(page.getByText("Nothing logged this week. Log spending on your phone and it shows here.")).toBeVisible();
    await expect(page.locator("main")).not.toContainText("₱");
  });
});
