/**
 * Simple Today: the pure read model (no React, no Supabase). Rows in, one serialisable view model out.
 * Contract: docs/pm/SIMPLE_MONEY.md. The money numbers are not recomputed here: spendable left is Σ left over the
 * Spend group from `bucket_left` (the same `spendSafe` as safe to spend), days come from `daysUntil` semantics
 * (min 1), and the per-day maths lives in lib/money/pace.ts. Money is integer centavos throughout.
 */
import { dayWithWeekday, daysUntilDay, pace, resolveUntil, spendByDay, streak, weekLeft, weekStrip } from "@/lib/money";
import type { AccountBalance } from "./balances";
import type { LogBucket } from "./log-spending-model";
import { spendSafe } from "./log-spending-model";

export type SimpleTodayModel = {
  firstName: string;
  todayLeftMinor: number; // hero
  weekLeftMinor: number;
  paceMinor: number;
  until: { day: string; label: string; source: "chosen" | "payday" | "week-end" };
  daysUntil: number;
  week: Array<{ day: string; label: string; state: "past" | "today" | "future"; spentMinor: number; leftMinor: number | null }>;
  streak: { days: number; todayDone: boolean; noSpendToday: boolean; milestone: 3 | 7 | 14 | 30 | null };
  accounts: Array<{ id: string; name: string; balanceMinor: number; pendingInMinor: number; pendingOutMinor: number }>;
  spendableLeftMinor: number; // all of Spending
  keptAsideMinor: number; // everything not in the Spend group
  hasAccounts: boolean;
  receive: {
    accounts: Array<{ id: string; name: string }>;
    defaultReceivedInId: string | null;
    spendingBucketId: string;
    keepBucketId: string;
    sources: Array<{ id: string; name: string }>;
    lastSourceId: string | null;
  };
};

/** A spending entry attached to a bucket (outflows, and balance adjustments as signed amounts), any date in the window. */
export interface SimpleSpend {
  bucketId: string;
  occurredAt: number;
  /** Negative for an inflow balance adjustment (negative spending). */
  amountMinor: number;
}

/** One `transfer_plan` row of kind 'transfer'. */
export interface SimpleTransfer {
  from: string;
  to: string;
  amountMinor: number;
  sentMinor: number;
}

export interface SimpleTodayInput {
  timeZone: string;
  todayIso: string;
  /** First day of the user's current week. */
  weekStartIso: string;
  profile: {
    firstName: string | null;
    nextPaydayDate: string | null;
    spendUntil: string | null;
    keepBucketId: string | null;
  };
  buckets: ReadonlyArray<Pick<LogBucket, "id" | "name" | "groupKey" | "hue" | "displayOrder">>;
  /** `bucket_left` per bucket. */
  lefts: Readonly<Record<string, number>>;
  spending: readonly SimpleSpend[];
  /** Days (ISO, user's zone) on which any spending was logged. */
  loggedSpendDays: readonly string[];
  noSpendDays: readonly string[];
  /** Home-currency balances, live and not archived, in display order. */
  accounts: ReadonlyArray<Pick<AccountBalance, "id" | "name" | "balanceMinor">>;
  transfers: readonly SimpleTransfer[];
  sources: ReadonlyArray<{ id: string; name: string }>;
  lastSourceId: string | null;
  lastReceivedInId: string | null;
}

/** The bucket spending money goes to: Living, else the first Spend bucket. Empty string when there is none. */
export function spendingBucketId(buckets: SimpleTodayInput["buckets"]): string {
  const spend = buckets.filter((b) => b.groupKey === "spend").slice().sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));
  return (spend.find((b) => b.hue === "living") ?? spend[0])?.id ?? "";
}

/** The bucket "kept aside" goes to: the one the user picked (if it is still a live non-Spend bucket), else Emergency, else the first non-Spend bucket. */
export function keepBucketIdOf(buckets: SimpleTodayInput["buckets"], picked: string | null): string {
  const keep = buckets.filter((b) => b.groupKey !== "spend").slice().sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));
  if (picked && keep.some((b) => b.id === picked)) return picked;
  return (keep.find((b) => b.hue === "emergency") ?? keep[0])?.id ?? "";
}

/** Money in analytics is never sent exactly: a band only. */
export function amountBand(amountMinor: number): string {
  const pesos = amountMinor / 100;
  if (pesos < 500) return "under_500";
  if (pesos < 2000) return "500_to_2k";
  if (pesos < 10000) return "2k_to_10k";
  if (pesos < 50000) return "10k_to_50k";
  return "50k_plus";
}

export function buildSimpleToday(input: SimpleTodayInput): SimpleTodayModel {
  const { todayIso, weekStartIso, timeZone } = input;
  const spendIds = new Set(input.buckets.filter((b) => b.groupKey === "spend").map((b) => b.id));
  const spendableLeftMinor = spendSafe(input.buckets, input.lefts);
  const keptAsideMinor = input.buckets.filter((b) => b.groupKey !== "spend").reduce((t, b) => t + (input.lefts[b.id] ?? 0), 0);

  const until = resolveUntil({ today: todayIso, spendUntil: input.profile.spendUntil, nextPayday: input.profile.nextPaydayDate, weekStart: weekStartIso });
  const daysUntil = daysUntilDay(todayIso, until.day);

  const byDay = spendByDay(input.spending.filter((s) => spendIds.has(s.bucketId)), timeZone);
  const spentToday = byDay[todayIso] ?? 0;
  const p = pace({ spendableLeftMinor, spentTodayMinor: spentToday, daysUntil });

  const st = streak({ today: todayIso, spendDays: input.loggedSpendDays, noSpendDays: input.noSpendDays });

  const remaining = new Map<string, { in: number; out: number }>();
  for (const t of input.transfers) {
    const rest = Math.max(0, t.amountMinor - t.sentMinor);
    if (rest === 0) continue;
    const to = remaining.get(t.to) ?? { in: 0, out: 0 };
    to.in += rest;
    remaining.set(t.to, to);
    const from = remaining.get(t.from) ?? { in: 0, out: 0 };
    from.out += rest;
    remaining.set(t.from, from);
  }

  const firstAccount = input.accounts[0]?.id ?? null;
  return {
    firstName: input.profile.firstName?.trim() ?? "",
    todayLeftMinor: p.todayLeftMinor,
    weekLeftMinor: weekLeft({ weekStart: weekStartIso, today: todayIso, spendableLeftMinor, daysUntil }),
    paceMinor: p.paceMinor,
    until: { day: until.day, label: dayWithWeekday(until.day), source: until.source },
    daysUntil,
    week: weekStrip({ weekStart: weekStartIso, today: todayIso, spentByDay: byDay, spendableLeftMinor, daysUntil }),
    streak: { days: st.days, todayDone: st.todayDone, noSpendToday: st.noSpendToday, milestone: st.milestone },
    accounts: input.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      balanceMinor: a.balanceMinor,
      pendingInMinor: remaining.get(a.id)?.in ?? 0,
      pendingOutMinor: remaining.get(a.id)?.out ?? 0,
    })),
    spendableLeftMinor,
    keptAsideMinor,
    hasAccounts: input.accounts.length > 0,
    receive: {
      accounts: input.accounts.map((a) => ({ id: a.id, name: a.name })),
      defaultReceivedInId: input.lastReceivedInId && input.accounts.some((a) => a.id === input.lastReceivedInId) ? input.lastReceivedInId : firstAccount,
      spendingBucketId: spendingBucketId(input.buckets),
      keepBucketId: keepBucketIdOf(input.buckets, input.profile.keepBucketId),
      sources: input.sources.map((s) => ({ id: s.id, name: s.name })),
      lastSourceId: input.lastSourceId && input.sources.some((s) => s.id === input.lastSourceId) ? input.lastSourceId : null,
    },
  };
}
