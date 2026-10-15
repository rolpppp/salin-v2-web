import { expect, test, type Page } from "@playwright/test";
import { isoDateIn } from "../../lib/data/money-in-model";
import { addDays } from "../../lib/money";
import { TZ_COOKIE } from "../../lib/time";
import { adminClient, createTestUser, eventsFor, TEST_TIME_ZONE, type TestUser } from "./helpers/supabase";
import { seedMoneyIn, signInAs } from "./helpers/money-in";

/**
 * Simple Money (ticket 28). Needs a local Supabase with the 20261015000100 migration applied.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const MARI = "MariBank";
const CASH = "GCash / cash";

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** A signed-in user on Simple Today. The mode lives in user_profiles."viewMode". */
async function setup(page: Page): Promise<TestUser> {
  const user = await createTestUser("simple");
  await seedMoneyIn(user.id);
  await adminClient().from("user_profiles").update({ viewMode: "simple" }).eq("user_id", user.id);
  await signInAs(page, user, "/today");
  const origin = new URL(page.url()).origin;
  await page.context().addCookies([
    { name: TZ_COOKIE, value: TEST_TIME_ZONE, url: origin },
  ]);
  await page.goto("/today");
  await expect(page.getByTestId("hero")).toBeVisible();
  return user;
}

const num = async (page: Page, testId: string, attr: string) => Number(await page.getByTestId(testId).getAttribute(attr));
const floorDiv = (a: number, b: number) => Math.floor(a / b);

async function receive(page: Page, o: { amount: string; moveToCash?: string; keep?: string }) {
  await page.getByTestId("i-got-money").click();
  const form = page.getByTestId("receive-form");
  await expect(form).toBeVisible();
  await expect(page.getByRole("textbox", { name: "How much did you get?" })).toBeFocused();
  await page.getByRole("textbox", { name: "How much did you get?" }).fill(o.amount);
  await page.getByTestId("received-in").selectOption({ label: MARI });
  if (o.moveToCash) await form.getByRole("textbox", { name: `Move to ${CASH}` }).fill(o.moveToCash);
  if (o.keep) await form.getByRole("textbox", { name: /Keep some aside/ }).fill(o.keep);
  return form;
}

test("receive money: split over two accounts plus a keep line grows the hero, shows a move, and the tick sticks", async ({ page }) => {
  const errors = watchConsole(page);
  const user = await setup(page);
  const before = { spendable: await num(page, "hero", "data-spendable-left-minor"), days: await num(page, "hero", "data-days-until") };

  const form = await receive(page, { amount: "2400", moveToCash: "500", keep: "1000" });
  // The live line shows the effect before saving: ₱2,400 - ₱1,000 kept = ₱1,400 to spend.
  const live = page.getByTestId("receive-live");
  await expect(live).toContainText("₱1,400.00 is yours to spend");
  const pace = floorDiv(before.spendable + 140_000, before.days);
  await expect(live).toContainText(`about ₱${floorDiv(pace, 100).toLocaleString("en-US")} a day`);
  await expect(page.getByTestId("received-in-amount")).toHaveText("₱1,900.00");

  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("receive-form")).toBeHidden();

  // The hero shows the new number: nothing spent today, so left today = the new daily amount.
  await expect(page.getByTestId("today-left")).toHaveAttribute("data-today-left-minor", String(pace));
  await expect(page.getByTestId("hero")).toHaveAttribute("data-spendable-left-minor", String(before.spendable + 140_000));

  // The ₱500 that landed in MariBank but belongs in the cash account is a move to tick.
  const move = page.getByTestId("move-row");
  await expect(move).toContainText(`Move ₱500.00 from ${MARI} to ${CASH}`);
  await move.getByTestId("move-tick").click();
  await expect(move.getByTestId("move-sent")).toBeVisible();

  // After a reload the pending move is gone from the accounts card, and the money landed once.
  await page.reload();
  await expect(page.getByTestId("pending-out")).toHaveCount(0);
  await expect.poll(async () => (await eventsFor(user.id, "money_received")).length).toBe(1);
  expect(errors).toEqual([]);
});

test("receive money: Save is off with a plain reason until the amounts add up, and a failed save would keep every field", async ({ page }) => {
  await setup(page);
  await page.getByTestId("i-got-money").click();
  const form = page.getByTestId("receive-form");
  const save = form.getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled();
  await expect(page.getByTestId("save-reason")).toHaveText("Enter the amount you received.");

  await page.getByRole("textbox", { name: "How much did you get?" }).fill("1500");
  await form.getByRole("textbox", { name: `Move to ${CASH}` }).fill("1600");
  await expect(save).toBeDisabled();
  await expect(page.getByTestId("save-reason")).toContainText("add up to more than you received");

  await form.getByRole("textbox", { name: `Move to ${CASH}` }).fill("500");
  await expect(save).toBeEnabled();
  await page.getByTestId("all-in-" + (await page.getByTestId("received-in").inputValue())).click();
  await expect(page.getByTestId("received-in-amount")).toHaveText("₱1,500.00");
});

test("no-spend day: counts for today, can be undone, and survives a reload", async ({ page }) => {
  const errors = watchConsole(page);
  await setup(page);
  const btn = page.getByTestId("no-spend");
  await expect(btn).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("habit-note")).toHaveText("Nothing yet today. Log it or mark a no-spend day.");

  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("habit-note")).toHaveText("Today is counted.");
  await expect(page.getByTestId("streak-chip")).toHaveText("1 day");

  await page.reload();
  await expect(page.getByTestId("no-spend")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("streak-chip")).toHaveText("1 day");

  await page.getByTestId("no-spend").click();
  await expect(page.getByTestId("no-spend")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("streak-chip")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("make it last until: choosing a later date lowers the daily amount to the new total over more days", async ({ page }) => {
  await setup(page);
  // Give the spending money something to spread.
  await receive(page, { amount: "3000" }).then((f) => f.getByRole("button", { name: "Save" }).click());
  await expect(page.getByTestId("receive-form")).toBeHidden();
  // The hero refreshes just after the sheet closes; read it once the ₱3,000 is in.
  await expect.poll(() => num(page, "hero", "data-spendable-left-minor")).toBeGreaterThanOrEqual(300_000);
  const spendable = await num(page, "hero", "data-spendable-left-minor");
  const before = await num(page, "pace", "data-pace-minor");

  const target = addDays(isoDateIn(Date.now(), TEST_TIME_ZONE), 30);
  await page.getByTestId("until-button").click();
  await page.getByTestId("until-pick").click();
  await page.getByTestId("until-date").fill(target);
  await page.getByTestId("until-save").click();
  await expect(page.getByTestId("until-sheet")).toBeHidden();

  await expect(page.getByTestId("hero")).toHaveAttribute("data-days-until", "30");
  const after = await num(page, "pace", "data-pace-minor");
  expect(after).toBe(floorDiv(spendable, 30));
  expect(after).toBeLessThan(before);
  await expect(page.getByTestId("until-button")).toContainText("30 days until");
});

test("view toggle: Full view and back, from the avatar menu and the link at the bottom", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Full view" }).click();
  await expect(page.getByTestId("safe-amount")).toBeVisible();
  await expect(page.getByTestId("hero")).toHaveCount(0);

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Simple view" }).click();
  await expect(page.getByTestId("hero")).toBeVisible();

  await page.getByTestId("to-full-view").click();
  await expect(page.getByTestId("safe-amount")).toBeVisible();
});

test("390px: no horizontal scroll, 44px targets, the week strip and sheets work", async ({ page }, info) => {
  test.skip(info.project.name.startsWith("desktop"), "phone width only");
  const errors = watchConsole(page);
  await setup(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  for (const id of ["i-got-money", "no-spend", "until-button", "to-full-view"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box?.height ?? 0, id).toBeGreaterThanOrEqual(44);
  }
  const today = page.getByTestId("day-today");
  expect((await today.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await today.click();
  await expect(page.getByTestId("day-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("day-sheet")).toBeHidden();

  await page.getByTestId("i-got-money").click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
