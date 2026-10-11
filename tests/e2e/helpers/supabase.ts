/**
 * Test-only Supabase helpers. They use the LOCAL service-role key to create users and seed rows.
 * Never import this from app code: the service-role key must not exist in the app.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../lib/database.types";
import { weekRange } from "../../../lib/time";

export const TEST_PASSWORD = "salin-e2e-Passw0rd!";
export const TEST_TIME_ZONE = "Asia/Manila";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Copy .env.example to .env.test.local and fill it from \`supabase status\` (local stack only).`);
  return v;
}

export function adminClient(): SupabaseClient<Database> {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Refusing to run e2e seeding against a non-local Supabase (${url}).`);
  return createClient<Database>(url, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
}

export type TestUser = { id: string; email: string; password: string };

export async function createTestUser(label: string): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@e2e.salin.test`;
  const { data, error } = await adminClient().auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  return { id: data.user.id, email, password: TEST_PASSWORD };
}

export async function eventsFor(userId: string, name: string) {
  const { data, error } = await adminClient().from("events").select("name, props, occurredAt").eq("user_id", userId).eq("name", name).order("occurredAt");
  if (error) throw new Error(error.message);
  return data;
}

/** What the seeded user's Today must show, in centavos. Derived by hand from the rows below. */
export const EXPECTED = {
  firstName: "Maria",
  accounts: [
    // opening + inflow - outflow over non-deleted entries (transfer legs count, deleted entry does not)
    { name: "BDO Savings", minor: 1_000_000 + 3_500_000 - 18_050 - 200_000 - 77_700, currency: "PHP" },
    { name: "GCash", minor: 250_000 - 9_950 - 5_000 + 200_000, currency: "PHP" },
    { name: "Wise AUD", minor: 40_000 - 1_234, currency: "AUD" },
  ],
  php: { total: 18_050 + 9_950 + 5_000, lines: [{ name: "Food", minor: 28_000 }, { name: "Transport", minor: 5_000 }] },
  aud: { total: 1_234, lines: [{ name: "Uncategorised", minor: 1_234 }] },
} as const;

/** Seeds mobile-shaped rows (camelCase, ms epoch, integer enums, syncStatus 2, every NOT NULL column). */
export async function seedMobileShape(userId: string, nowMs = Date.now()): Promise<void> {
  const db = adminClient();
  const week = weekRange(nowMs, TEST_TIME_ZONE, 1);
  const H = 3_600_000;
  const D = 24 * H;
  const thisMon = week.startMs + 2 * H;
  const thisThu = week.startMs + 3 * D;
  const lastWeek = week.startMs - D;
  const earlier = week.startMs - 10 * D;
  const id = (s: string) => `${s}-${userId.slice(0, 8)}`;
  const base = { user_id: userId, createdAt: nowMs, updatedAt: nowMs, syncStatus: 2 } as const;

  const must = (label: string, error: { message: string } | null) => {
    if (error) throw new Error(`seed ${label}: ${error.message}`);
  };

  must(
    "profile",
    (
      await db.from("user_profiles").upsert({ user_id: userId, firstName: EXPECTED.firstName, homeCurrency: "PHP", weekStartsOn: 1 })
    ).error,
  );

  const acct = (key: string, name: string, accountType: number, opening: number, order: number, extra: { currency?: string; isArchived?: boolean; deletedAt?: number | null } = {}) => ({
    ...base,
    id: id(key),
    name,
    accountType,
    openingBalanceMinor: opening,
    currency: extra.currency ?? "PHP",
    icon: "wallet",
    color: "#0b7a73",
    displayOrder: order,
    isArchived: extra.isArchived ?? false,
    deletedAt: extra.deletedAt ?? null,
  });
  must(
    "accounts",
    (
      await db.from("accounts").insert([
        acct("bdo", "BDO Savings", 1, 1_000_000, 0),
        acct("gcash", "GCash", 3, 250_000, 1),
        acct("wise", "Wise AUD", 1, 40_000, 2, { currency: "AUD" }),
        acct("old", "Old wallet", 0, 99_900, 3, { isArchived: true }),
        acct("gone", "Deleted account", 0, 88_800, 4, { deletedAt: nowMs }),
      ])
    ).error,
  );

  const cat = (key: string, name: string, categoryType: number, order: number) => ({
    ...base,
    id: id(key),
    name,
    categoryType,
    icon: "tag",
    color: "#f08a6c",
    displayOrder: order,
    isSystem: false,
    deletedAt: null,
  });
  must("categories", (await db.from("categories").insert([cat("food", "Food", 1, 0), cat("transport", "Transport", 1, 1), cat("salary", "Salary", 0, 2)])).error);

  must("transfer", (await db.from("transfers").insert({ ...base, id: id("tr"), fromAccountId: id("bdo"), toAccountId: id("gcash"), note: null, deletedAt: null })).error);

  const entry = (key: string, accountId: string, amountMinor: number, direction: number, origin: number, occurredAt: number, extra: { categoryId?: string; transferId?: string; deletedAt?: number } = {}) => ({
    ...base,
    id: id(key),
    accountId,
    amountMinor,
    direction,
    origin,
    occurredAt,
    categoryId: extra.categoryId ? id(extra.categoryId) : null,
    transferId: extra.transferId ? id(extra.transferId) : null,
    deletedAt: extra.deletedAt ?? null,
    note: null,
    metadataJson: null,
    debtId: null,
    splitId: null,
    recurringInstanceId: null,
  });
  must(
    "ledger_entries",
    (
      await db.from("ledger_entries").insert([
        entry("salary", id("bdo"), 3_500_000, 0, 0, earlier, { categoryId: "salary" }),
        entry("food1", id("bdo"), 18_050, 1, 0, thisMon, { categoryId: "food" }),
        entry("food2", id("gcash"), 9_950, 1, 1, thisThu, { categoryId: "food" }),
        entry("transport", id("gcash"), 5_000, 1, 0, thisMon, { categoryId: "transport" }),
        entry("t-out", id("bdo"), 200_000, 1, 3, thisMon, { transferId: "tr" }),
        entry("t-in", id("gcash"), 200_000, 0, 3, thisMon, { transferId: "tr" }),
        entry("lastweek", id("bdo"), 77_700, 1, 0, lastWeek, { categoryId: "food" }),
        entry("deleted", id("bdo"), 99_999, 1, 0, thisMon, { categoryId: "food", deletedAt: nowMs }),
        entry("aud", id("wise"), 1_234, 1, 0, thisMon),
      ])
    ).error,
  );
}
