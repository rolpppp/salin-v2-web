import { expect, test, type Page } from "@playwright/test";
import { formatPeso } from "../../lib/money";
import { adminClient, createTestUser, eventsFor, type TestUser } from "./helpers/supabase";
import { seedMoneyIn, signInAs, type MoneyInSeed } from "./helpers/money-in";

// Each test makes its own user: the four projects (390/1440 x light/dark) run in parallel and these tests write.
// The Gift income (needs a job) is removed so that, once every transfer is sent, nothing waits and the completion card shows.
async function setup(page: Page): Promise<{ user: TestUser; seed: MoneyInSeed }> {
  const user = await createTestUser("transfers");
  const seed = await seedMoneyIn(user.id);
  const now = Date.now();
  const { error } = await adminClient().from("ledger_entries").update({ deletedAt: now, updatedAt: now }).eq("id", seed.incomeIds.gift);
  if (error) throw new Error(error.message);
  await signInAs(page, user);
  return { user, seed };
}

const box = (page: Page, name: string) => page.getByRole("checkbox", { name });
// The real checkbox is visually hidden inside its row; clicking the row's label text is what a person does.
async function tick(page: Page, name: string) {
  await box(page, name).check({ force: true });
  await expect(box(page, name)).toBeChecked();
}

/** Every live transfer with its two ledger legs, as mobile reads them. */
async function liveTransfers(userId: string) {
  const db = adminClient();
  const { data: transfers, error } = await db.from("transfers").select("id, fromAccountId, toAccountId, deletedAt").eq("user_id", userId).is("deletedAt", null);
  if (error) throw new Error(error.message);
  const out = [];
  for (const t of transfers) {
    const { data: legs } = await db.from("ledger_entries").select("id, accountId, amountMinor, direction, origin, syncStatus, deletedAt").eq("transferId", t.id).is("deletedAt", null);
    out.push({ ...t, legs: legs ?? [] });
  }
  return out;
}

const G7_TRANSFERS = [
  { to: "cash", from: "mari", amount: 161_000, name: `Send ${formatPeso(161_000)} to GCash / cash` },
  { to: "mp2", from: "mari", amount: 690_000, name: `Send ${formatPeso(690_000)} to Pag-IBIG MP2` },
  { to: "tonik", from: "mari", amount: 230_000, name: `Send ${formatPeso(230_000)} to Tonik` },
  { to: "gcash", from: "mari", amount: 195_000, name: `Send ${formatPeso(195_000)} to GCash or Maya` },
  { to: "tonik", from: "gcash", amount: 140_000, name: `Send ${formatPeso(140_000)} to Tonik` },
] as const;

test.use({ storageState: { cookies: [], origins: [] } });

test("G7: confirming G2 and G5 together nets the pair, and ticking writes mobile-style transfers until the completion card", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  const { user, seed } = await setup(page);

  await page.getByTestId("confirm-all").click();
  await expect(page.getByRole("heading", { level: 1, name: "Move the money" })).toBeVisible();

  // keep rows first (no checkbox), with the netting note; focus moved to the first transfer checkbox
  const keeps = page.getByTestId("keep-row");
  await expect(keeps).toHaveCount(2);
  await expect(keeps.nth(0)).toContainText(`Keep ${formatPeso(1_024_000)} in MariBank`);
  await expect(keeps.nth(0)).toContainText(`includes ${formatPeso(35_000)} kept by netting`);
  await expect(keeps.nth(1)).toContainText(`Keep ${formatPeso(210_000)} in GCash or Maya`);
  await expect(page.getByRole("checkbox")).toHaveCount(5);
  await expect(page.getByRole("checkbox").first()).toBeFocused();
  await expect(page.getByTestId("sent-count")).toHaveText("0 of 5 sent");
  await expect(page.getByText(`${formatPeso(35_000)} less: that much stays put on the other side`)).toBeVisible();

  // tick them one by one; each writes immediately
  for (const [i, t] of G7_TRANSFERS.entries()) {
    await tick(page, t.name);
    // the last tick closes the cycle and the step turns into the completion card
    if (i < 4) {
      await expect(page.getByTestId("sent-count")).toHaveText(`${i + 1} of 5 sent`);
      await expect(page.getByText("Sent", { exact: true })).toHaveCount(i + 1);
    }
  }

  // mobile shape: one transfers row + `_out` (outflow, from) and `_in` (inflow, to) legs, origin transfer, synced
  const live = await liveTransfers(user.id);
  expect(live).toHaveLength(5);
  for (const t of G7_TRANSFERS) {
    const row = live.find((r) => r.fromAccountId === seed.accountIds[t.from] && r.toAccountId === seed.accountIds[t.to]);
    expect(row, `${t.from} -> ${t.to}`).toBeTruthy();
    const out = row?.legs.find((l) => l.id === `${row.id}_out`);
    const inn = row?.legs.find((l) => l.id === `${row.id}_in`);
    expect(out).toMatchObject({ accountId: seed.accountIds[t.from], amountMinor: t.amount, direction: 1, origin: 3, syncStatus: 2 });
    expect(inn).toMatchObject({ accountId: seed.accountIds[t.to], amountMinor: t.amount, direction: 0, origin: 3, syncStatus: 2 });
  }
  const events = await eventsFor(user.id, "transfer_ticked");
  expect(events).toHaveLength(5);
  expect(events.every((e) => (e.props as { is_partial: boolean }).is_partial === false)).toBe(true);
  expect(await eventsFor(user.id, "money_in_completed")).toHaveLength(1);

  // nothing waits and every transfer is sent: the step becomes the completion card
  const card = page.getByTestId("completion-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("All money in has a home.");
  await expect(card).toContainText(`${formatPeso(2_650_000)} from 2 sources now has a job`);
  await expect(page.getByRole("link", { name: /See your buckets grow/ })).toBeFocused();
  await expect(page.getByRole("heading", { level: 1, name: "Every peso has a home" })).toBeVisible();

  // survives a reload (a later visit the same day shows the card, no burst)
  await page.reload();
  await expect(page.getByTestId("completion-card")).toBeVisible();
  await expect(page.getByTestId("completion-card")).not.toHaveAttribute("data-burst");

  await page.getByRole("link", { name: /See your buckets grow/ }).click();
  await page.waitForURL(/\/today(\?|$)/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("unticking reverses the transfer (soft delete) and reopens the checklist", async ({ page }) => {
  const { user } = await setup(page);
  await page.getByTestId("confirm-all").click();
  await tick(page, G7_TRANSFERS[1].name);
  await expect.poll(async () => (await liveTransfers(user.id)).length).toBe(1);

  await box(page, G7_TRANSFERS[1].name).uncheck({ force: true });
  await expect(box(page, G7_TRANSFERS[1].name)).not.toBeChecked();
  await expect(page.getByTestId("sent-count")).toHaveText("0 of 5 sent");
  await expect.poll(async () => (await liveTransfers(user.id)).length).toBe(0);
  // soft-deleted, not removed, so mobile can sync the reversal
  const { data } = await adminClient().from("transfers").select("deletedAt").eq("user_id", user.id);
  expect(data?.every((r) => r.deletedAt !== null)).toBe(true);
  expect(data).toHaveLength(1);
});

test("G8: with MariBank -> GCash or Maya already sent, confirming G5 later does not net over it", async ({ page }) => {
  const { user, seed } = await setup(page);

  // confirm G2 alone (the Work row), then send the Fun money transfer (₱2,300.00)
  await page.getByRole("button", { name: /Work/ }).click();
  await page.getByRole("button", { name: "Confirm just this one" }).click();
  const sendFun = `Send ${formatPeso(230_000)} to GCash or Maya`;
  await expect(box(page, sendFun)).toBeVisible();
  await tick(page, sendFun);
  await expect.poll(async () => (await liveTransfers(user.id)).length).toBe(1);

  // now G5 arrives in the cycle
  await page.getByTestId("confirm-all").click();
  await expect(box(page, `Send ${formatPeso(35_000)} to MariBank`)).toBeVisible();

  // the sent transfer stays at 2,300.00 and checked; the reverse transfer is separate, 350.00, unsent
  await expect(box(page, sendFun)).toBeChecked();
  await expect(page.getByText("less: that much stays put")).toHaveCount(0);
  await expect(box(page, `Send ${formatPeso(35_000)} to MariBank`)).not.toBeChecked();
  await expect(page.getByTestId("keep-row").first()).not.toContainText("netting");
  await expect(page.getByTestId("sent-count")).toHaveText("1 of 6 sent");
  expect((await liveTransfers(user.id)).every((r) => r.toAccountId === seed.accountIds.gcash)).toBe(true);
});

test("G12: moving a bucket's 'kept in' after a tick leaves the transfer list unchanged", async ({ page }) => {
  const { user, seed } = await setup(page);
  await page.getByTestId("confirm-all").click();
  await tick(page, G7_TRANSFERS[0].name);
  await expect(page.getByTestId("sent-count")).toHaveText("1 of 5 sent");

  // Investments now kept in Tonik (what Plans > Split plan does)
  const { error } = await adminClient().from("buckets").update({ keptInAccountId: seed.accountIds.tonik, updatedAt: Date.now() }).eq("id", seed.bucketIds.invest);
  expect(error).toBeNull();

  await page.reload();
  await expect(page.getByRole("checkbox")).toHaveCount(5);
  for (const t of G7_TRANSFERS) await expect(box(page, t.name)).toBeVisible();
  await expect(page.getByTestId("sent-count")).toHaveText("1 of 5 sent");
  await expect(box(page, G7_TRANSFERS[0].name)).toBeChecked();
  expect((await liveTransfers(user.id)).length).toBe(1);
});
