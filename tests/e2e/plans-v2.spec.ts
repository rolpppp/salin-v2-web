import { expect, test, type Page } from "@playwright/test";
import { adminClient, createTestUser, type TestUser } from "./helpers/supabase";
import { seedMoneyIn, signInAs, type MoneyInSeed } from "./helpers/money-in";

// Plans v2 (ticket 26). Needs the plans-v2 migration applied to the local database. Each test makes its own user.
test.use({ storageState: { cookies: [], origins: [] } });

async function setup(page: Page, next = "/plans/split"): Promise<{ user: TestUser; seed: MoneyInSeed }> {
  const user = await createTestUser("plansv2");
  const seed = await seedMoneyIn(user.id);
  await signInAs(page, user, next);
  return { user, seed };
}

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function createFromScratch(page: Page, name: string, shares: Record<string, number>) {
  await page.getByRole("button", { name: "+ New plan" }).click();
  await page.getByRole("button", { name: "From scratch" }).click();
  await expect(page.getByLabel("Plan name")).toBeFocused();
  await page.getByLabel("Plan name").fill(name);
  await expect(page.getByTestId("plan-total")).toContainText("0%");
  await expect(page.getByRole("button", { name: "Create plan" })).toBeDisabled();
  for (const [bucket, pct] of Object.entries(shares)) await page.getByLabel(`${bucket} percent`).fill(String(pct));
  await expect(page.getByRole("button", { name: "Create plan" })).toBeEnabled();
  await page.getByRole("button", { name: "Create plan" }).click();
}

test("create a plan from scratch: Save stays off until 100%, then it exists, is open, and its name is focused", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const { user } = await setup(page);

  await page.getByRole("button", { name: "+ New plan" }).click();
  await page.getByRole("button", { name: "From scratch" }).click();
  await page.getByLabel("Plan name").fill("Saving for Japan");
  await page.getByLabel("Living percent").fill("60");
  await expect(page.getByTestId("plan-total")).toContainText("Adds up to 60%. Give 40% to a bucket.");
  await expect(page.getByRole("button", { name: "Create plan" })).toBeDisabled();
  await page.getByLabel("Emergency fund percent").fill("40");
  await expect(page.getByTestId("plan-total")).toContainText("100%");
  await page.getByRole("button", { name: "Create plan" }).click();

  await expect(page.getByRole("button", { name: /Saving for Japan/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Plan name")).toBeFocused();
  await expect(page.getByLabel("Living percent")).toHaveValue("60");
  await page.reload();
  await page.getByRole("button", { name: /Saving for Japan/ }).click();
  await expect(page.getByLabel("Emergency fund percent")).toHaveValue("40");

  const { data } = await adminClient().from("allocation_plans").select("key, name").eq("user_id", user.id).is("deletedAt", null);
  expect((data ?? []).map((p) => p.name).sort()).toEqual(["Plan A", "Plan B", "Saving for Japan"]);
  expect(await noHorizontalScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("copy a plan: opens the copy with its name selected for renaming", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "+ New plan" }).click();
  await page.getByRole("button", { name: "Copy of Plan B" }).click();
  await expect(page.getByLabel("Plan name")).toHaveValue("Copy of Plan B");
  await expect(page.getByLabel("Plan name")).toBeFocused();
  await expect(page.getByLabel("Investments percent")).toHaveValue("50");
  await page.getByLabel("Plan name").fill("Lean months");
  await page.getByLabel("Plan name").blur();
  await expect(page.getByRole("button", { name: /Lean months/ })).toBeVisible();
});

test("choose a plan manually: Money in says 'Split by {name}'", async ({ page }) => {
  await setup(page);
  await createFromScratch(page, "Saving for Japan", { Living: 50, "Emergency fund": 50 });
  await expect(page.getByRole("button", { name: /Saving for Japan/ })).toBeVisible();

  await page.getByRole("radio", { name: /Always use/ }).check();
  await page.getByLabel("Always use plan").selectOption({ label: "Saving for Japan" });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: /Saving for Japan/ }).getByTestId("active-plan")).toHaveText("Splitting your paydays");
  await expect(page.getByText("Applies to paydays after the change.")).toBeVisible();

  await page.goto("/money-in");
  await expect(page.getByTestId("queue-item").first().getByTestId("job-text")).toHaveText("Split by Saving for Japan");
  await page.getByTestId("confirm-all").click();
  await expect(page.getByRole("list", { name: "Confirmed" })).toContainText("Split by Saving for Japan");
});

test("a custom bucket at 10% appears on Today's shelf after a confirm", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Add a bucket" }).click();
  const form = page.getByRole("form", { name: "Add a bucket" });
  await form.getByLabel("Name").fill("Japan trip");
  await form.getByRole("radio", { name: "Save" }).check();
  await form.getByRole("radio", { name: "Blue" }).check();
  await form.getByLabel("Kept in").selectOption({ label: "MariBank" });
  await form.getByRole("button", { name: "Add bucket" }).click();

  // starts at 0% in every plan: take 10% from Emergency fund in Plan A, give it to the new bucket
  await expect(page.getByLabel("Japan trip percent")).toHaveValue("0");
  await page.getByLabel("Emergency fund percent").fill("20");
  await page.getByLabel("Japan trip percent").fill("10");
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByTestId("live-region")).toContainText("Plan A saved");

  await page.goto("/money-in");
  await page.getByTestId("confirm-all").click();
  await expect(page.getByRole("list", { name: "Confirmed" })).toContainText("Work");
  await page.goto("/today");
  await expect(page.getByTestId("shelf")).toContainText("Japan trip");
});

test("archive: a bucket that can't be archived shows the reason inline", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Archive Emergency fund" }).click();
  const reason = page.getByTestId("archive-reason");
  await expect(reason).toBeVisible();
  await expect(reason).not.toBeEmpty();
  await expect(reason).toBeFocused();
  // still in the plan
  await expect(page.getByLabel("Emergency fund percent")).toBeVisible();
});

test("Split plan has no horizontal page scroll at 390px, with plans, compare and the buckets list open", async ({ page }) => {
  await setup(page);
  await page.getByLabel("Compare with").selectOption({ label: "Plan B" });
  await page.getByRole("button", { name: "Add a bucket" }).click();
  await page.getByRole("button", { name: "Edit Living" }).click();
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("archive and restore a bucket that is free", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Add a bucket" }).click();
  await page.getByRole("form", { name: "Add a bucket" }).getByLabel("Name").fill("Spare");
  await page.getByRole("form", { name: "Add a bucket" }).getByRole("button", { name: "Add bucket" }).click();
  await expect(page.getByLabel("Spare percent")).toBeVisible();
  await page.getByRole("button", { name: "Archive Spare" }).click();
  await expect(page.getByLabel("Spare percent")).toHaveCount(0);
  await page.getByText(/^Archived \(/).click();
  await page.getByRole("button", { name: "Restore Spare" }).click();
  await expect(page.getByLabel("Spare percent")).toHaveValue("0");
});

test("deleting the plan that splits paydays is refused with the server's reason", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Delete plan" }).click();
  await page.getByRole("button", { name: "Delete Plan A" }).click();
  const err = page.getByTestId("delete-error");
  await expect(err).toBeVisible();
  await expect(err).not.toBeEmpty();
  await expect(err).toBeFocused();
  await expect(page.getByRole("button", { name: /Plan A/ })).toBeVisible();
});

test("keyboard only: New plan menu, From scratch, steppers, Create", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "+ New plan" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter"); // From scratch is focused first
  await page.keyboard.type("Keyboard plan");
  await page.getByRole("button", { name: "Increase Living by 1%" }).focus();
  for (let i = 0; i < 100; i++) await page.keyboard.press("Enter");
  await expect(page.getByTestId("plan-total")).toContainText("100%");
  await page.getByRole("button", { name: "Create plan" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Keyboard plan/ })).toHaveAttribute("aria-pressed", "true");
});
