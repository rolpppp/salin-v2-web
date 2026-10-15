import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { LedgerOrigin, MoneyDirection } from "@/lib/domain/enums";
import { addDays, dayIn, streak, type StreakResult } from "@/lib/money";
import { weekRange } from "@/lib/time";
import { computeBalances, type AccountRow, type EntryRow } from "./balances";
import { getBucketLefts, getLogBuckets } from "./log-spending";
import { isoDateIn } from "./money-in-model";
import { buildSimpleToday, type SimpleSpend, type SimpleTodayModel, type SimpleTransfer } from "./simple-today-model";

export type { SimpleTodayModel } from "./simple-today-model";

type Client = SupabaseClient<Database>;

const PAGE = 1000; // PostgREST's default max_rows
const DAY_MS = 86_400_000;
/** How far back the streak looks (days). A longer streak shows as this many. */
const STREAK_WINDOW_DAYS = 120;

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

export type ViewMode = "simple" | "full";

/** The signed-in user's view mode; `full` when there is no profile row or the value is unknown. */
export async function getViewMode(client: Client): Promise<ViewMode> {
  const { data, error } = await client.from("user_profiles").select("viewMode, deletedAt").maybeSingle();
  if (error) throw new Error(error.message);
  return data && data.deletedAt === null && data.viewMode === "simple" ? "simple" : "full";
}

/** Days with a logged spend, and days marked no-spend, over the streak window (user's zone). */
async function streakDays(client: Client, nowMs: number, timeZone: string): Promise<{ spendDays: string[]; noSpendDays: string[]; todayIso: string }> {
  const todayIso = isoDateIn(nowMs, timeZone);
  const sinceMs = nowMs - (STREAK_WINDOW_DAYS + 1) * DAY_MS;
  const [entries, checks] = await Promise.all([
    pageAll<{ occurredAt: number }>((from, to) =>
      client
        .from("ledger_entries")
        .select("occurredAt")
        .is("deletedAt", null)
        .eq("direction", MoneyDirection.outflow)
        .neq("origin", LedgerOrigin.transfer)
        .neq("origin", LedgerOrigin.adjustment)
        .gte("occurredAt", sinceMs)
        .order("occurredAt")
        .order("id")
        .range(from, to),
    ),
    pageAll<{ day: string }>((from, to) =>
      client
        .from("day_checkins")
        .select("day")
        .is("deletedAt", null)
        .eq("kind", "no_spend")
        .gte("day", addDays(todayIso, -(STREAK_WINDOW_DAYS + 1)))
        .order("day")
        .range(from, to),
    ),
  ]);
  return { spendDays: [...new Set(entries.map((e) => dayIn(e.occurredAt, timeZone)))], noSpendDays: checks.map((c) => c.day), todayIso };
}

/** The streak as it stands now (used by actions to spot a milestone right after a no-spend mark). */
export async function getStreak(client: Client, opts: { nowMs: number; timeZone: string }): Promise<StreakResult> {
  const d = await streakDays(client, opts.nowMs, opts.timeZone);
  return streak({ today: d.todayIso, spendDays: d.spendDays, noSpendDays: d.noSpendDays });
}

/**
 * Everything Simple Today needs, as the contract's `SimpleTodayModel`. Same sources as Today: `bucket_left`
 * (through `getBucketLefts`), `transfer_plan`, the mobile-shaped ledger rows and `computeBalances`. RLS limits every
 * query to the signed-in user. Returns null when there is no profile yet. Throws on any error so the page can say so.
 */
export async function getSimpleToday(client: Client, opts: { nowMs: number; timeZone: string }): Promise<SimpleTodayModel | null> {
  const { nowMs, timeZone } = opts;
  const profileRes = await client
    .from("user_profiles")
    .select("firstName, homeCurrency, weekStartsOn, nextPaydayDate, spendUntil, keepBucketId, deletedAt")
    .maybeSingle();
  if (profileRes.error) throw new Error(profileRes.error.message);
  const profile = profileRes.data;
  if (!profile || profile.deletedAt !== null) return null;

  const weekStartsOn = profile.weekStartsOn === 0 ? 0 : 1;
  const week = weekRange(nowMs, timeZone, weekStartsOn);
  const weekStartIso = isoDateIn(week.startMs, timeZone);
  const homeCurrency = profile.homeCurrency || "PHP";

  const [buckets, lefts, spendRows, streakData, accountRows, entryRows, planRes, sourceRows, latestIncome] = await Promise.all([
    getLogBuckets(client),
    getBucketLefts(client),
    pageAll<{ bucketId: string; ledger_entries: { amountMinor: number; occurredAt: number; direction: number; origin: number } | null }>((from, to) =>
      client
        .from("entry_buckets")
        .select("bucketId, ledger_entries!inner(amountMinor, occurredAt, direction, origin, deletedAt)")
        .is("deletedAt", null)
        .is("ledger_entries.deletedAt", null)
        // spending = outflows, plus balance adjustments (an inflow adjustment is negative spending), as Today counts it
        .or(`direction.eq.${MoneyDirection.outflow},origin.eq.${LedgerOrigin.adjustment}`, { referencedTable: "ledger_entries" })
        .neq("ledger_entries.origin", LedgerOrigin.transfer)
        .gte("ledger_entries.occurredAt", week.startMs)
        .order("id")
        .range(from, to),
    ),
    streakDays(client, nowMs, timeZone),
    pageAll<AccountRow>((from, to) =>
      client
        .from("accounts")
        .select("id, name, accountType, currency, openingBalanceMinor, displayOrder, isArchived, deletedAt")
        .is("deletedAt", null)
        .order("displayOrder")
        .order("id")
        .range(from, to),
    ),
    pageAll<EntryRow>((from, to) =>
      client
        .from("ledger_entries")
        .select("accountId, amountMinor, direction, origin, categoryId, occurredAt, deletedAt")
        .is("deletedAt", null)
        .order("id")
        .range(from, to),
    ),
    client.rpc("transfer_plan"),
    pageAll<{ id: string; name: string }>((from, to) =>
      client.from("income_sources").select("id, name").is("deletedAt", null).eq("isArchived", false).order("createdAt").order("id").range(from, to),
    ),
    client
      .from("ledger_entries")
      .select("id, accountId")
      .is("deletedAt", null)
      .eq("direction", MoneyDirection.inflow)
      .neq("origin", LedgerOrigin.transfer)
      .neq("origin", LedgerOrigin.adjustment)
      .order("occurredAt", { ascending: false })
      .order("id")
      .limit(20),
  ]);
  if (planRes.error) throw new Error(planRes.error.message);
  if (latestIncome.error) throw new Error(latestIncome.error.message);

  // The source and landing account of the most recent income that has a source ("remembered, last used preselected").
  let lastSourceId: string | null = null;
  let lastReceivedInId: string | null = null;
  const recent = latestIncome.data ?? [];
  if (recent.length > 0) {
    const metaRes = await client
      .from("income_meta")
      .select("ledgerEntryId, sourceId")
      .is("deletedAt", null)
      .in(
        "ledgerEntryId",
        recent.map((r) => r.id),
      );
    if (metaRes.error) throw new Error(metaRes.error.message);
    const sourceOf = new Map((metaRes.data ?? []).map((m) => [m.ledgerEntryId, m.sourceId]));
    const hit = recent.find((r) => sourceOf.get(r.id));
    lastSourceId = hit ? (sourceOf.get(hit.id) ?? null) : null;
    lastReceivedInId = (hit ?? recent[0]).accountId;
  }

  const spending: SimpleSpend[] = [];
  for (const r of spendRows) {
    const le = r.ledger_entries;
    if (!le) continue;
    spending.push({ bucketId: r.bucketId, occurredAt: le.occurredAt, amountMinor: le.direction === MoneyDirection.inflow ? -le.amountMinor : le.amountMinor });
  }

  const balances = computeBalances(accountRows, entryRows).filter((a) => a.currency === homeCurrency);
  const transfers: SimpleTransfer[] = (planRes.data ?? [])
    .filter((t) => t.kind === "transfer")
    .map((t) => ({ from: t.from_account_id, to: t.to_account_id, amountMinor: t.amount, sentMinor: t.sent }));

  return buildSimpleToday({
    timeZone,
    todayIso: streakData.todayIso,
    weekStartIso,
    profile: { firstName: profile.firstName, nextPaydayDate: profile.nextPaydayDate, spendUntil: profile.spendUntil, keepBucketId: profile.keepBucketId },
    buckets,
    lefts,
    spending,
    loggedSpendDays: streakData.spendDays,
    noSpendDays: streakData.noSpendDays,
    accounts: balances,
    transfers,
    sources: sourceRows,
    lastSourceId,
    lastReceivedInId,
  });
}
