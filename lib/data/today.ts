import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { LedgerOrigin, MoneyDirection, WeekStart } from "@/lib/domain/enums";
import type { PlanKey } from "@/lib/money";
import { weekRange, zonedMidnight, zonedParts } from "@/lib/time";
import { getMoneyInData } from "./money-in";
import { isoDateIn } from "./money-in-model";
import type { BucketFlow, MonthCover, MonthSpend, TodayAllocation, TodayBucket, TodayGoalRow, TodayInput, TodayStart } from "./today-model";

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

export type Profile = {
  firstName: string | null;
  homeCurrency: string;
  weekStartsOn: 0 | 1;
  onboardedAt: number | null;
  /** `YYYY-MM-DD`, or null when the user hasn't set one (D-15). */
  nextPaydayDate: string | null;
  planMode: string;
  /** 0 = Sunday .. 6 = Saturday. */
  reviewDay: number;
};

export async function getProfile(client: Client, userId: string): Promise<Profile | null> {
  const { data, error } = await client
    .from("user_profiles")
    .select("firstName, homeCurrency, weekStartsOn, onboardedAt, nextPaydayDate, planMode, reviewDay, deletedAt")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.deletedAt !== null) return null;
  return {
    firstName: data.firstName,
    homeCurrency: data.homeCurrency,
    weekStartsOn: data.weekStartsOn === WeekStart.sunday ? 0 : 1,
    onboardedAt: data.onboardedAt,
    nextPaydayDate: data.nextPaydayDate,
    planMode: data.planMode,
    reviewDay: data.reviewDay,
  };
}

/**
 * Everything Today needs, as the pure model's input. Balances come from SQL (`bucket_left`, `active_plan`,
 * `transfer_plan` through Money in's loader); the rest are plain reads of mobile-shaped rows (camelCase, ms epoch,
 * integer enums). RLS limits every query to the signed-in user. Throws on any error so the page can say so.
 */
export async function getTodayInput(client: Client, opts: { userId: string; nowMs: number; timeZone: string; profile: Profile | null }): Promise<TodayInput> {
  const { userId, nowMs, timeZone, profile } = opts;
  const weekStartsOn = profile?.weekStartsOn ?? 1;
  const week = weekRange(nowMs, timeZone, weekStartsOn);
  const weekStartIso = isoDateIn(week.startMs, timeZone);
  const p = zonedParts(nowMs, timeZone);
  const monthStartMs = zonedMidnight(p.year, p.month, 1, timeZone);
  const monthEndMs = p.month === 12 ? zonedMidnight(p.year + 1, 1, 1, timeZone) : zonedMidnight(p.year, p.month + 1, 1, timeZone);
  const onboardedAt = profile?.onboardedAt ?? null;

  // One wave: Money in's own loader runs alongside the rest instead of ahead of it.
  const [mi, leftRes, activeRes, noteRows, goalRows, allocRows, metaRows, spendRows, coverRows, startRows, categoryRows, reviewRes, loggedRes, anyAccount, anyCategory, anyEntry] = await Promise.all([
    getMoneyInData(client, { nowMs, timeZone, homeCurrency: profile?.homeCurrency ?? "PHP" }),
    client.rpc("bucket_left"),
    client.rpc("active_plan", { p_user: userId }),
    pageAll<{ id: string; note: string | null }>((from, to) => client.from("buckets").select("id, note").is("deletedAt", null).order("id").range(from, to)),
    pageAll<TodayGoalRow>((from, to) =>
      client
        .from("goals")
        .select("id, name, targetMinor, currency, linkedBucketId, linkedShareBp, isPlanSwitch")
        .is("deletedAt", null)
        .eq("isArchived", false)
        .order("createdAt")
        .order("id")
        .range(from, to),
    ),
    pageAll<{ ledgerEntryId: string | null; bucketId: string; amountMinor: number; confirmedAt: number; ledger_entries: { occurredAt: number } | null }>((from, to) =>
      client
        .from("allocations")
        .select("ledgerEntryId, bucketId, amountMinor, confirmedAt, ledger_entries!inner(occurredAt, deletedAt)")
        .is("deletedAt", null)
        .is("ledger_entries.deletedAt", null)
        .order("seq")
        .range(from, to),
    ),
    pageAll<{ ledgerEntryId: string; sourceId: string | null }>((from, to) =>
      client.from("income_meta").select("ledgerEntryId, sourceId").is("deletedAt", null).order("ledgerEntryId").range(from, to),
    ),
    pageAll<{ bucketId: string; ledger_entries: { amountMinor: number; occurredAt: number; categoryId: string | null; note: string | null; direction: number; origin: number } | null }>((from, to) =>
      client
        .from("entry_buckets")
        .select("bucketId, ledger_entries!inner(amountMinor, occurredAt, categoryId, note, direction, origin, deletedAt)")
        .is("deletedAt", null)
        .is("ledger_entries.deletedAt", null)
        // spending = outflows, plus balance adjustments (an inflow adjustment is negative spending)
        .or(`direction.eq.${MoneyDirection.outflow},origin.eq.${LedgerOrigin.adjustment}`, { referencedTable: "ledger_entries" })
        .neq("ledger_entries.origin", LedgerOrigin.transfer)
        .gte("ledger_entries.occurredAt", monthStartMs)
        .lt("ledger_entries.occurredAt", monthEndMs)
        .order("id")
        .range(from, to),
    ),
    pageAll<{ fromBucketId: string; toBucketId: string; amountMinor: number; occurredAt: number; note: string | null }>((from, to) =>
      client
        .from("bucket_covers")
        .select("fromBucketId, toBucketId, amountMinor, occurredAt, note")
        .is("deletedAt", null)
        .gte("occurredAt", monthStartMs)
        .lt("occurredAt", monthEndMs)
        .order("id")
        .range(from, to),
    ),
    pageAll<{ id: string; bucketId: string; accountId: string | null; amountMinor: number; occurredAt: number }>((from, to) =>
      client.from("bucket_starts").select("id, bucketId, accountId, amountMinor, occurredAt").is("deletedAt", null).order("occurredAt").order("id").range(from, to),
    ),
    pageAll<{ id: string; name: string }>((from, to) => client.from("categories").select("id, name").order("id").range(from, to)),
    client.from("week_reviews").select("weekStart").is("deletedAt", null),
    onboardedAt !== null
      ? client
          .from("ledger_entries")
          .select("id", { count: "exact", head: true })
          .is("deletedAt", null)
          .eq("direction", MoneyDirection.outflow)
          .neq("origin", LedgerOrigin.transfer)
          .neq("origin", LedgerOrigin.adjustment)
          .gt("createdAt", onboardedAt)
      : Promise.resolve({ count: 0, error: null }),
    client.from("accounts").select("id").limit(1),
    client.from("categories").select("id").limit(1),
    client.from("ledger_entries").select("id").limit(1),
  ]);
  for (const r of [leftRes, activeRes, reviewRes, loggedRes]) if (r.error) throw new Error(r.error.message);

  const notes = new Map(noteRows.map((n) => [n.id, n.note]));
  const buckets: TodayBucket[] = mi.buckets.map((b) => ({ ...b, note: notes.get(b.id) ?? null }));

  const flows: Record<string, BucketFlow> = {};
  for (const l of leftRes.data ?? []) flows[l.bucket_id] = { allocated: l.allocated, spent: l.spent, coversIn: l.covers_in, coversOut: l.covers_out, left: l.left_minor };

  const sourceOfEntry = new Map(metaRows.map((m) => [m.ledgerEntryId, m.sourceId]));
  const allocations: TodayAllocation[] = [];
  for (const a of allocRows) {
    if (!a.ledgerEntryId || !a.ledger_entries) continue;
    allocations.push({
      entryId: a.ledgerEntryId,
      bucketId: a.bucketId,
      amountMinor: a.amountMinor,
      confirmedAt: a.confirmedAt,
      occurredAt: a.ledger_entries.occurredAt,
      sourceId: sourceOfEntry.get(a.ledgerEntryId) ?? null,
    });
  }

  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));
  const spendingThisMonth: MonthSpend[] = [];
  for (const s of spendRows) {
    const le = s.ledger_entries;
    if (!le) continue;
    spendingThisMonth.push({
      bucketId: s.bucketId,
      dateIso: isoDateIn(le.occurredAt, timeZone),
      amountMinor: le.direction === MoneyDirection.inflow ? -le.amountMinor : le.amountMinor,
      label: le.origin === LedgerOrigin.adjustment ? "Balance adjustment" : (le.categoryId && categoryName.get(le.categoryId)) || le.note?.trim() || "Spending",
    });
  }
  const coversThisMonth: MonthCover[] = coverRows.map((c) => ({
    fromBucketId: c.fromBucketId,
    toBucketId: c.toBucketId,
    dateIso: isoDateIn(c.occurredAt, timeZone),
    amountMinor: c.amountMinor,
    note: c.note,
  }));
  const accountName = Object.fromEntries(mi.accounts.map((a) => [a.id, a.name]));
  const starts: TodayStart[] = startRows.map((r) => ({
    id: r.id,
    bucketId: r.bucketId,
    dateIso: isoDateIn(r.occurredAt, timeZone),
    amountMinor: r.amountMinor,
    accountName: r.accountId ? (accountName[r.accountId] ?? null) : null,
  }));

  const reviews = reviewRes.data ?? [];
  const activePlan: PlanKey = activeRes.data || "A";

  return {
    nowMs,
    timeZone,
    todayIso: isoDateIn(nowMs, timeZone),
    profile: {
      nextPaydayDate: profile?.nextPaydayDate ?? null,
      planMode: profile?.planMode ?? "plan",
      onboardedAt,
      reviewDay: profile?.reviewDay ?? 0,
      weekStartsOn,
    },
    week: { startIso: weekStartIso, endIso: isoDateIn(week.endMs, timeZone) },
    buckets,
    accountNames: Object.fromEntries(mi.accounts.map((a) => [a.id, a.name])),
    flows,
    activePlan,
    plan: mi.plan,
    sources: mi.sources,
    incomes: mi.incomes,
    transferPlan: mi.transferPlan,
    allocations,
    spendingThisMonth,
    coversThisMonth,
    starts,
    goals: goalRows,
    weekClosed: reviews.some((r) => r.weekStart === weekStartIso),
    anyWeekClosed: reviews.length > 0,
    spendingLoggedAfterOnboarding: (loggedRes.count ?? 0) > 0,
    syncOff: [anyAccount, anyCategory, anyEntry].every((r) => !r.error && (r.data?.length ?? 0) === 0),
  };
}
