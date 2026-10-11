import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { LedgerOrigin, MoneyDirection, WeekStart } from "@/lib/domain/enums";
import { weekRange } from "@/lib/time";
import {
  computeBalances,
  computeWeekSpending,
  type AccountBalance,
  type AccountRow,
  type CurrencySpend,
  type EntryRow,
} from "./balances";

type Client = SupabaseClient<Database>;

const PAGE = 1000; // PostgREST's default max_rows

/** Runs a ranged query page by page until a short page comes back. Throws on any error. */
async function pageAll<T>(run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export type Profile = { firstName: string | null; homeCurrency: string; weekStartsOn: 0 | 1; onboardedAt: number | null };

export async function getProfile(client: Client, userId: string): Promise<Profile | null> {
  const { data, error } = await client
    .from("user_profiles")
    .select("firstName, homeCurrency, weekStartsOn, onboardedAt, deletedAt")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.deletedAt !== null) return null;
  return {
    firstName: data.firstName,
    homeCurrency: data.homeCurrency,
    weekStartsOn: data.weekStartsOn === WeekStart.sunday ? 0 : 1,
    onboardedAt: data.onboardedAt,
  };
}

export type SpendLine = { categoryId: string | null; name: string; totalMinor: number };
export type WeekSpend = { currency: string; totalMinor: number; lines: SpendLine[] };

export type TodayData = {
  accounts: AccountBalance[];
  spending: WeekSpend[];
  /** The user has no rows at all in accounts, categories or ledger_entries (mobile sync is off or never ran). */
  syncOff: boolean;
  week: { startMs: number; endMs: number };
};

export const UNCATEGORISED = "Uncategorised";

/**
 * Everything the read-only Today needs. Reads the mobile-shaped Row types directly (camelCase, ms epoch,
 * integer enums). RLS limits every query to the signed-in user.
 * Balances page through every non-deleted entry because PostgREST caps a response at 1000 rows;
 * an SQL function (`account_balances`) would be cheaper, so move this server-side when `supabase/` allows.
 */
export async function getTodayData(client: Client, opts: { nowMs: number; timeZone: string; weekStartsOn: 0 | 1; homeCurrency: string }): Promise<TodayData> {
  const week = weekRange(opts.nowMs, opts.timeZone, opts.weekStartsOn);

  const [accountRows, categoryRows, flowRows, spendRows, anyAccount, anyCategory, anyEntry] = await Promise.all([
    pageAll<AccountRow>((from, to) =>
      client
        .from("accounts")
        .select("id, name, accountType, currency, openingBalanceMinor, displayOrder, isArchived, deletedAt")
        .is("deletedAt", null)
        .order("id")
        .range(from, to),
    ),
    pageAll<{ id: string; name: string }>((from, to) => client.from("categories").select("id, name").order("id").range(from, to)),
    pageAll<EntryRow>((from, to) =>
      client
        .from("ledger_entries")
        .select("accountId, amountMinor, direction, origin, categoryId, occurredAt, deletedAt")
        .is("deletedAt", null)
        .order("id")
        .range(from, to),
    ),
    pageAll<EntryRow>((from, to) =>
      client
        .from("ledger_entries")
        .select("accountId, amountMinor, direction, origin, categoryId, occurredAt, deletedAt")
        .is("deletedAt", null)
        .eq("direction", MoneyDirection.outflow)
        .neq("origin", LedgerOrigin.transfer)
        .gte("occurredAt", week.startMs)
        .lt("occurredAt", week.endMs)
        .order("id")
        .range(from, to),
    ),
    client.from("accounts").select("id").limit(1),
    client.from("categories").select("id").limit(1),
    client.from("ledger_entries").select("id").limit(1),
  ]);

  const names = new Map(categoryRows.map((c) => [c.id, c.name]));
  const currencyByAccount = new Map(accountRows.map((a) => [a.id, a.currency]));
  const spending: CurrencySpend[] = computeWeekSpending(spendRows, currencyByAccount, week, opts.homeCurrency);

  return {
    accounts: computeBalances(accountRows, flowRows),
    spending: spending.map((s) => ({
      currency: s.currency,
      totalMinor: s.totalMinor,
      lines: s.byCategory.map((c) => ({
        categoryId: c.categoryId,
        name: (c.categoryId && names.get(c.categoryId)) || UNCATEGORISED,
        totalMinor: c.totalMinor,
      })),
    })),
    syncOff: [anyAccount, anyCategory, anyEntry].every((r) => !r.error && (r.data?.length ?? 0) === 0),
    week,
  };
}
