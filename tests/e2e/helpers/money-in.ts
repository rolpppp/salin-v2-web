/**
 * Test-only seed for the Money in specs (local service-role key; never import from app code).
 * Builds the owner's sheet: buckets with homes, Plan A/B, the rent redirect and Plan B switch, three
 * sources (plan / own split / ask) and three waiting incomes. Rows that mobile also writes use the
 * lib/domain/mobile builders, like the app does.
 */
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { newAccountRow, newCategoryRow, newIncomeEntryRow } from "../../../lib/domain/mobile";
import { adminClient, type TestUser } from "./supabase";

export const HUES = ["tax", "living", "rent", "emergency", "invest", "sinking", "fun", "buffer", "dost"] as const;
export type Hue = (typeof HUES)[number];

const NAME: Record<Hue, string> = {
  tax: "Tax",
  living: "Living",
  rent: "Rent",
  emergency: "Emergency fund",
  invest: "Investments",
  sinking: "Sinking funds",
  fun: "Fun money",
  buffer: "Buffer",
  dost: "Scholarship",
};
const GROUP: Record<Hue, string> = { tax: "set_aside", living: "spend", rent: "set_aside", emergency: "save", invest: "save", sinking: "save", fun: "spend", buffer: "set_aside", dost: "set_aside" };
const HOME: Record<Hue, string> = { tax: "mari", living: "cash", rent: "mari", emergency: "mari", invest: "mp2", sinking: "tonik", fun: "gcash", buffer: "mari", dost: "mari" };
const PLAN_A: Record<string, number> = { tax: 600, living: 700, rent: 200, emergency: 3000, invest: 3000, sinking: 1000, fun: 1000, buffer: 500 };
const PLAN_B: Record<string, number> = { ...PLAN_A, emergency: 1000, invest: 5000 };

/** BUSINESS_RULES §10 G2 and G5, in centavos. */
export const G2 = { tax: 138_000, living: 161_000, emergency: 736_000, invest: 690_000, sinking: 230_000, fun: 230_000, buffer: 115_000 } as const;
export const G5 = { tax: 35_000, sinking: 140_000, fun: 175_000 } as const;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`seed ${label}: ${error.message}`);
};

export type MoneyInSeed = {
  bucketIds: Record<Hue, string>;
  accountIds: Record<"mari" | "gcash" | "cash" | "mp2" | "tonik", string>;
  incomeIds: { g2: string; g5: string; gift: string };
  categoryIds: { work: string; side: string; gift: string };
};

export async function seedMoneyIn(userId: string, nowMs = Date.now()): Promise<MoneyInSeed> {
  const db = adminClient();
  const DAY = 86_400_000;

  must("profile", (await db.from("user_profiles").upsert({ user_id: userId, firstName: "Maria", homeCurrency: "PHP", weekStartsOn: 1 })).error);

  const acct = (key: keyof MoneyInSeed["accountIds"], name: string, type: "bank" | "eWallet" | "cash" | "investment" | "savings", order: number) =>
    newAccountRow({ userId, nowMs, name, type, displayOrder: order, id: `${key}-${randomUUID().slice(0, 8)}` });
  const accounts = [acct("mari", "MariBank", "bank", 1), acct("gcash", "GCash or Maya", "eWallet", 2), acct("cash", "GCash / cash", "cash", 3), acct("mp2", "Pag-IBIG MP2", "investment", 4), acct("tonik", "Tonik", "savings", 5)];
  must("accounts", (await db.from("accounts").insert(accounts)).error);
  const accountIds = Object.fromEntries(accounts.map((a) => [a.id.split("-")[0], a.id])) as MoneyInSeed["accountIds"];

  const cats = { work: newCategoryRow({ userId, nowMs, name: "Work", type: "income" }), side: newCategoryRow({ userId, nowMs, name: "Side hustle", type: "income" }), gift: newCategoryRow({ userId, nowMs, name: "Gift", type: "income" }) };
  must("categories", (await db.from("categories").insert(Object.values(cats))).error);

  const bucketIds = Object.fromEntries(HUES.map((h) => [h, randomUUID()])) as Record<Hue, string>;
  must(
    "buckets",
    (
      await db.from("buckets").insert(
        HUES.map((h, i) => ({ id: bucketIds[h], user_id: userId, name: NAME[h], groupKey: GROUP[h], hue: h, keptInAccountId: accountIds[HOME[h] as keyof typeof accountIds], planless: h === "dost", displayOrder: i + 1 })),
      )
    ).error,
  );

  const planIds = { A: randomUUID(), B: randomUUID() };
  must("plans", (await db.from("allocation_plans").insert([{ id: planIds.A, user_id: userId, key: "A", name: "Plan A" }, { id: planIds.B, user_id: userId, key: "B", name: "Plan B" }])).error);
  must(
    "plan lines",
    (
      await db.from("allocation_plan_lines").insert(
        (["A", "B"] as const).flatMap((k) => Object.entries(k === "A" ? PLAN_A : PLAN_B).map(([hue, bp]) => ({ user_id: userId, planId: planIds[k], bucketId: bucketIds[hue as Hue], percentBp: bp }))),
      )
    ).error,
  );
  must(
    "rules",
    (
      await db.from("allocation_rules").insert([
        { user_id: userId, kind: "switch_on_goal", params: { fromPlan: "A", toPlan: "B", bucketId: bucketIds.emergency, targetMinor: 5_000_000 } },
        // far future so the goldens (rent redirected to Emergency) hold whenever the suite runs
        { user_id: userId, kind: "redirect_until_date", params: { fromBucketId: bucketIds.rent, toBucketId: bucketIds.emergency, untilDate: "2099-01-01" } },
      ])
    ).error,
  );

  const src = { work: randomUUID(), side: randomUUID(), gift: randomUUID() };
  must(
    "sources",
    (
      await db.from("income_sources").insert([
        { id: src.work, user_id: userId, name: "Work", kind: "salary", rule: "plan", landsInAccountId: accountIds.mari, categoryId: cats.work.id },
        { id: src.side, user_id: userId, name: "Side hustle", kind: "side_hustle", rule: "own", landsInAccountId: accountIds.gcash, categoryId: cats.side.id },
        { id: src.gift, user_id: userId, name: "Gift", kind: "gift", rule: "ask", landsInAccountId: accountIds.mari, categoryId: cats.gift.id },
      ])
    ).error,
  );
  must(
    "own split",
    (
      await db.from("income_source_split_lines").insert([
        { user_id: userId, sourceId: src.side, bucketId: bucketIds.tax, percentBp: 1000 },
        { user_id: userId, sourceId: src.side, bucketId: bucketIds.sinking, percentBp: 4000 },
        { user_id: userId, sourceId: src.side, bucketId: bucketIds.fun, percentBp: 5000 },
      ])
    ).error,
  );

  const inc = (amountMinor: number, daysAgo: number, accountId: string, categoryId: string) =>
    newIncomeEntryRow({ userId, nowMs, accountId, amountMinor, occurredAt: nowMs - daysAgo * DAY, categoryId });
  const g2 = inc(2_300_000, 3, accountIds.mari, cats.work.id);
  const g5 = inc(350_000, 2, accountIds.gcash, cats.side.id);
  const gift = inc(5_000, 1, accountIds.mari, cats.gift.id);
  must("incomes", (await db.from("ledger_entries").insert([g2, g5, gift])).error);
  // The recognition trigger normally writes these; upsert so the seed doesn't depend on it.
  must(
    "income_meta",
    (
      await db.from("income_meta").upsert(
        [
          { user_id: userId, ledgerEntryId: g2.id, sourceId: src.work, job: null },
          { user_id: userId, ledgerEntryId: g5.id, sourceId: src.side, job: null },
          { user_id: userId, ledgerEntryId: gift.id, sourceId: src.gift, job: null },
        ],
        { onConflict: "user_id,ledgerEntryId" },
      )
    ).error,
  );

  return { bucketIds, accountIds, incomeIds: { g2: g2.id, g5: g5.id, gift: gift.id }, categoryIds: { work: cats.work.id, side: cats.side.id, gift: cats.gift.id } };
}

/** Allocations of one income as `hue -> centavos`. */
export async function allocationsByHue(entryId: string, bucketIds: Record<Hue, string>) {
  const { data, error } = await adminClient().from("allocations").select("bucketId, amountMinor, destAccountId, planKey, transferCycleId").eq("ledgerEntryId", entryId).is("deletedAt", null);
  if (error) throw new Error(error.message);
  const byId = new Map(Object.entries(bucketIds).map(([h, id]) => [id, h]));
  return { rows: data, byHue: Object.fromEntries(data.map((r) => [byId.get(r.bucketId) ?? r.bucketId, r.amountMinor])) as Record<string, number> };
}

/** Signs in through the real form (sessions are per user, so each test makes its own). */
export async function signInAs(page: Page, user: TestUser, next = "/money-in") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${next}`);
}
