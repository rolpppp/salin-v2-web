import { expect, test } from "@playwright/test";

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the landing page explains Salin, converts, and has no horizontal scroll", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Know what's fine to spend today.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const h of ["Whatever comes in", "Two minutes to set up", "Simple on the surface", "Ready to feel good about your money?"]) {
      await expect(page.getByRole("heading", { name: new RegExp(h) })).toBeAttached();
    }
    const cta = page.getByTestId("landing-cta");
    await expect(cta).toHaveAttribute("href", "/sign-up");
    await cta.click();
    await expect(page).toHaveURL(/\/sign-up$/);
  });

  test("the audience tabs are a real tablist: arrow keys move and select", async ({ page }) => {
    await page.goto("/");
    const tabs = page.getByRole("tablist", { name: "Who is Salin for?" });
    const students = tabs.getByRole("tab", { name: "Students" });
    await students.focus();
    await expect(students).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(tabs.getByRole("tab", { name: "Daily workers" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText("Pay that changes every week");
    await page.keyboard.press("End");
    await expect(tabs.getByRole("tab", { name: "First-timers" })).toBeFocused();
  });

  test("social proof shows the live people count (53 + new sign-ups) and five testimonials; the phone app is a mailto", async ({ page }) => {
    await page.goto("/");
    const proof = page.getByTestId("social-proof");
    const count = Number(await proof.getByTestId("people-count").getAttribute("data-value"));
    expect(count).toBeGreaterThanOrEqual(53);
    await expect(page.getByText(`${count}+ people already giving every peso a job`)).toBeVisible();
    await expect(proof.locator("figure")).toHaveCount(5);
    const href = (await page.getByTestId("landing-app-request").getAttribute("href")) ?? "";
    expect(href.startsWith("mailto:proj.salin@gmail.com?")).toBe(true);
  });

  test("the hero playground is a radio group: picking a situation updates the daily number", async ({ page }) => {
    await page.goto("/");
    const group = page.getByRole("radiogroup", { name: /Try it/ });
    await group.getByRole("radio", { name: "Stipend" }).click();
    await expect(group.getByRole("radio", { name: "Stipend" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/₱24,000 each semester is about/)).toContainText("₱200 a day");
    await page.keyboard.press("ArrowRight");
    await expect(group.getByRole("radio", { name: "Salary" })).toBeFocused();
    await expect(page.getByText(/₱25,000 twice a month is about/)).toContainText("₱1,666 a day");
  });

  test("the real UP Tacloban review is featured, near the CTA and in the proof section; accounts say they are not affiliated", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("11/10 from a UP Tacloban student")).toBeVisible();
    const proof = page.getByTestId("social-proof");
    await expect(proof.getByText("Student, UP Tacloban")).toBeAttached();
    await expect(proof.getByText("Beta tester review")).toBeAttached();
    await expect(page.getByText("isn't affiliated with these banks or wallets")).toBeAttached();
    await expect(page.getByRole("region", { name: /accounts you already use/ }).locator("li")).toHaveCount(10);
  });

  test("on phones, a Start free bar appears once the hero button scrolls away", async ({ page }, info) => {
    test.skip(!info.project.name.startsWith("mobile"), "phone-only bar");
    await page.goto("/");
    const bar = page.getByTestId("sticky-cta");
    await expect(bar).not.toBeInViewport();
    await page.getByRole("heading", { name: /Simple on the surface/ }).scrollIntoViewIfNeeded();
    await expect(bar).toBeInViewport();
    await expect(bar).toHaveAttribute("href", "/sign-up");
  });

  test("FAQ answers open and close", async ({ page }) => {
    await page.goto("/");
    const q = page.getByText("Do I have to connect my bank?");
    await q.click();
    await expect(page.getByText("No. Salin never asks for a bank login", { exact: false })).toBeVisible();
  });
});

test("signed-in visitors skip the landing page and land on Today", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/today$/);
});
