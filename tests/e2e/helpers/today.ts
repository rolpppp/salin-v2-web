/**
 * Test-only seeds for the Today specs (local service-role key; never import from app code).
 * Builds on the Money in seed (the owner's sheet: buckets, Plan A/B, sources). Rows mobile also writes use the
 * lib/domain/mobile builders.
 */
import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { isoDateIn } from "../../../lib/data/money-in-model";
import { newCategoryRow, newIncomeEntryRow, newSpendingEntryRow } from "../../../lib/domain/mobile";
import { addDays } from "../../../lib/money";
import { seedMoneyIn, type Hue, type MoneyInSeed } from "./money-in";
import { TEST_TIME_ZONE, adminClient } from "./supabase";

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`seed ${label}: ${error.message}`);
};

const DAY = 86_400_000;

/** BUSINESS_RULES §10 G1: ₱17,329.00, Plan A (rent redirected to Emergency). */
export const G1 = { tax: 103_974, living: 121_303, emergency: 554_528, invest: 519_870, sinking: 173_290, fun: 173_290, buffer: 86_645 } as const;

export type TodaySeed = MoneyInSeed & {
  nowMs: number;
  /** The seeded Work payday (G1), waiting for a job until the test confirms it. */
  g1Id: string;
  /** Calendar date (Manila) of G1, e.g. `2026-10-10`. */
  g1Iso: string;
  workCategoryId: string;
  accountIds: MoneyInSeed["accountIds"];
};

export type TodayOptions = {
  /** Days until the next payday; null leaves the date unset (D-15). */
  paydayInDays?: number | null;
  /** Seed the Emergency goal (target ₱50,000, the Plan B switch). */
  emergencyGoal?: boolean;
};

/**
 * The prototype's starting state minus the confirm: the three Money in incomes are removed and one Work payday of
 * G1 (₱17,329.00) waits for a job. Call `confirmAllAndSend` to confirm it through the real screen.
 */
export async function seedToday(userId: string, opts: TodayOptions = {}): Promise<TodaySeed> {
  const { paydayInDays = 10, emergencyGoal = true } = opts;
  const nowMs = Date.now();
  const seed = await seedMoneyIn(userId, nowMs);
  const db = adminClient();

  // The default seed's waiting incomes (G2, G5, Gift) are not part of this state.
  const gone = [seed.incomeIds.g2, seed.incomeIds.g5, seed.incomeIds.gift];
  must("remove default incomes", (await db.from("ledger_entries").update({ deletedAt: nowMs, updatedAt: nowMs }).in("id", gone)).error);

  const { data: work } = await db.from("income_sources").select("id").eq("user_id", userId).eq("name", "Work").single();
  const g1 = newIncomeEntryRow({ userId, nowMs, accountId: seed.accountIds.mari, amountMinor: 1_732_900, occurredAt: nowMs - DAY, categoryId: seed.categoryIds.work });
  must("g1", (await db.from("ledger_entries").insert(g1)).error);
  must("g1 meta", (await db.from("income_meta").upsert({ user_id: userId, ledgerEntryId: g1.id, sourceId: work?.id ?? null, job: null }, { onConflict: "user_id,ledgerEntryId" })).error);

  const payday = paydayInDays === null ? null : addDays(isoDateIn(nowMs, TEST_TIME_ZONE), paydayInDays);
  must("profile", (await db.from("user_profiles").update({ nextPaydayDate: payday }).eq("user_id", userId)).error);

  if (emergencyGoal) {
    must(
      "goal",
      (await db.from("goals").insert({ user_id: userId, name: "Emergency fund", targetMinor: 5_000_000, linkedBucketId: seed.bucketIds.emergency, linkedShareBp: 10_000, isPlanSwitch: true })).error,
    );
  }
  return { ...seed, nowMs, g1Id: g1.id, g1Iso: isoDateIn(g1.occurredAt, TEST_TIME_ZONE), workCategoryId: seed.categoryIds.work };
}

/** G9's sample spending: Living ₱1,300.00 and Fun ₱1,300.50, each in a bucket through a mapped expense category. */
export async function seedSpending(userId: string, seed: TodaySeed): Promise<void> {
  const db = adminClient();
  const groceries = newCategoryRow({ userId, nowMs: seed.nowMs, name: "Groceries", type: "expense" });
  const movies = newCategoryRow({ userId, nowMs: seed.nowMs, name: "Movies", type: "expense" });
  must("expense categories", (await db.from("categories").insert([groceries, movies])).error);
  must(
    "category buckets",
    (
      await db.from("category_buckets").insert([
        { user_id: userId, categoryId: groceries.id, bucketId: seed.bucketIds.living, source: "user" },
        { user_id: userId, categoryId: movies.id, bucketId: seed.bucketIds.fun, source: "user" },
      ])
    ).error,
  );
  const rows = [
    newSpendingEntryRow({ userId, nowMs: seed.nowMs, accountId: seed.accountIds.cash, amountMinor: 130_000, occurredAt: seed.nowMs - 2 * 3_600_000, categoryId: groceries.id }),
    newSpendingEntryRow({ userId, nowMs: seed.nowMs, accountId: seed.accountIds.gcash, amountMinor: 130_050, occurredAt: seed.nowMs - 3_600_000, categoryId: movies.id }),
  ];
  must("spending", (await db.from("ledger_entries").insert(rows)).error);
  // The bucket-snapshot trigger normally writes these; upsert so the seed doesn't depend on it.
  must(
    "entry buckets",
    (
      await db.from("entry_buckets").upsert(
        [
          { user_id: userId, ledgerEntryId: rows[0].id, bucketId: seed.bucketIds.living, source: "category" },
          { user_id: userId, ledgerEntryId: rows[1].id, bucketId: seed.bucketIds.fun, source: "category" },
        ],
        { onConflict: "user_id,ledgerEntryId" },
      )
    ).error,
  );
}

/** A second Work-less payday of G2 (₱23,000, Plan A) from an "Others" source (kind other, rule plan), waiting for a job. */
export async function addOthersPayday(userId: string, seed: TodaySeed): Promise<string> {
  const db = adminClient();
  const cat = newCategoryRow({ userId, nowMs: seed.nowMs, name: "Others", type: "income" });
  must("others category", (await db.from("categories").insert(cat)).error);
  const sourceId = randomUUID();
  must(
    "others source",
    (await db.from("income_sources").insert({ id: sourceId, user_id: userId, name: "Others", kind: "other", rule: "plan", landsInAccountId: seed.accountIds.mari, categoryId: cat.id })).error,
  );
  const g2 = newIncomeEntryRow({ userId, nowMs: seed.nowMs, accountId: seed.accountIds.mari, amountMinor: 2_300_000, occurredAt: seed.nowMs, categoryId: cat.id });
  must("g2", (await db.from("ledger_entries").insert(g2)).error);
  must("g2 meta", (await db.from("income_meta").upsert({ user_id: userId, ledgerEntryId: g2.id, sourceId, job: null }, { onConflict: "user_id,ledgerEntryId" })).error);
  return g2.id;
}

/** Confirms everything waiting on Money in, then ticks every transfer as sent, so only Living is left open. */
export async function confirmAllAndSend(page: Page): Promise<void> {
  await page.goto("/money-in");
  await page.getByTestId("confirm-all").click();
  await expect(page.getByRole("heading", { level: 1, name: "Move the money" })).toBeVisible();
  const boxes = page.getByTestId("move-money-step").getByRole("checkbox");
  const n = await boxes.count();
  for (let i = 0; i < n; i++) await boxes.nth(i).check({ force: true });
  await expect(page.getByRole("heading", { level: 1, name: "Every peso has a home" })).toBeVisible();
}

export type { Hue };
