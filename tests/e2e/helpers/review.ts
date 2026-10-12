/**
 * Test-only seed for the Review specs (local service-role key; never import from app code).
 * Builds on seedMoneyIn (G2 + G5 + a waiting 5,000 gift), confirms the two paydays AS THE USER (confirm_incomes
 * uses auth.uid()), then logs this week's spending: Living overspent (Groceries 200,000 against 161,000) and a
 * BIR payment of 30,000 paid FROM TAX, so the slip's "spent from a set-aside" case is on screen.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../lib/database.types";
import { newCategoryRow, newSpendingEntryRow } from "../../../lib/domain/mobile";
import { adminClient, type TestUser } from "./supabase";
import { seedMoneyIn, type MoneyInSeed } from "./money-in";

export async function userClient(user: TestUser): Promise<SupabaseClient<Database>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set");
  const client = createClient<Database>(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`sign in failed: ${error.message}`);
  return client;
}

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`review seed ${label}: ${error.message}`);
};

/** What the slip must show for the seed below, in centavos (derived by hand from BR §10 G2 and G5). */
export const SLIP = {
  cameIn: 2_300_000 + 350_000 + 5_000,
  spent: 200_000 + 30_000,
  // Put away = Emergency 736,000 + Investments 690,000 + Sinking 230,000 + 140,000
  putAway: 736_000 + 690_000 + 230_000 + 140_000,
  // Tax set aside = (138,000 + 35,000) set aside - 30,000 BIR payment: LEFT, not allocations
  tax: 138_000 + 35_000 - 30_000,
  cushions: 115_000,
  toAssign: 5_000,
  // Safe to spend = Living (161,000 - 200,000) + Fun (230,000 + 175,000)
  safe: 161_000 - 200_000 + 230_000 + 175_000,
  livingNeeds: 39_000,
} as const;

export type ReviewSeed = MoneyInSeed & { categoryIds: MoneyInSeed["categoryIds"] & { groceries: string; bir: string } };

/** `spending: false` seeds only the waiting income (an empty week). */
export async function seedReview(user: TestUser, opts: { spending?: boolean; confirm?: boolean } = {}): Promise<ReviewSeed> {
  const { spending = true, confirm = true } = opts;
  const seed = await seedMoneyIn(user.id);
  const db = adminClient();
  const now = Date.now();

  // seedMoneyIn dates the incomes 1-3 days back, which is LAST week on a Monday or Tuesday and would make
  // the slip carry them in and report history. These specs are about "this week", so pull them to just now.
  for (const [i, id] of [seed.incomeIds.g2, seed.incomeIds.g5, seed.incomeIds.gift].entries()) {
    must("income dates", (await db.from("ledger_entries").update({ occurredAt: now - (5 - i) * 60_000 }).eq("id", id)).error);
  }

  if (confirm) {
    const client = await userClient(user);
    const { error } = await client.rpc("confirm_incomes", { entry_ids: [seed.incomeIds.g2, seed.incomeIds.g5] });
    must("confirm", error);
  }

  const groceries = newCategoryRow({ userId: user.id, nowMs: now, name: "Groceries", type: "expense" });
  const bir = newCategoryRow({ userId: user.id, nowMs: now, name: "BIR", type: "expense" });
  must("categories", (await db.from("categories").insert([groceries, bir])).error);
  must(
    "category_buckets",
    (
      await db.from("category_buckets").insert([
        { user_id: user.id, categoryId: groceries.id, bucketId: seed.bucketIds.living, source: "user" },
        { user_id: user.id, categoryId: bir.id, bucketId: seed.bucketIds.tax, source: "user" },
      ])
    ).error,
  );

  if (spending) {
    const at = now - 60_000;
    const rows = [
      newSpendingEntryRow({ userId: user.id, nowMs: now, accountId: seed.accountIds.cash, amountMinor: 200_000, occurredAt: at, categoryId: groceries.id }),
      newSpendingEntryRow({ userId: user.id, nowMs: now, accountId: seed.accountIds.mari, amountMinor: 30_000, occurredAt: at, categoryId: bir.id }),
    ];
    must("spending", (await db.from("ledger_entries").insert(rows)).error);
    // The phone's trigger normally writes these from the category mapping; upsert so the seed doesn't depend on it.
    must(
      "entry_buckets",
      (
        await db.from("entry_buckets").upsert(
          [
            { user_id: user.id, ledgerEntryId: rows[0].id, bucketId: seed.bucketIds.living, source: "category" },
            { user_id: user.id, ledgerEntryId: rows[1].id, bucketId: seed.bucketIds.tax, source: "category" },
          ],
          { onConflict: "user_id,ledgerEntryId" },
        )
      ).error,
    );
  }
  return { ...seed, categoryIds: { ...seed.categoryIds, groceries: groceries.id, bir: bir.id } };
}

/** Parses the formatter's output back to centavos: "₱1,234.50" -> 123450, "−₱86.97" -> -8697. */
export function pesoToMinor(text: string): number {
  const m = /^([−-])?₱([\d,]+)\.(\d{2})$/.exec(text.trim());
  if (!m) throw new Error(`not a peso amount: ${text}`);
  const minor = Number(m[2].replace(/,/g, "")) * 100 + Number(m[3]);
  return m[1] ? -minor : minor;
}
