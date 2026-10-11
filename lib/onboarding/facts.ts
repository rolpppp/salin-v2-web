import { isoDateIn } from "@/lib/data/money-in-model";
import { AccountType, CategoryType, LedgerOrigin, MoneyDirection, RecurringFrequency, enumName } from "@/lib/domain/enums";
import { addDays, autoMapCategory, detectIncomeSources, mulDivRound, PLAN_BUCKETS, type AccountKind, type DetectedSource, type IsoDate, type PhoneInflow, type PlanPercents } from "@/lib/money";
import { zonedMidnight, zonedParts } from "@/lib/time";
import type { DraftBucket } from "./draft";
import type { StepContext } from "./step";

/**
 * What the phone has synced, shaped for the app-path steps (SPEC §7.4, BR §12.4/§12.5). Plain JSON so it crosses
 * the server-action boundary. Built from raw mobile-shaped rows by `buildPhoneFacts` (pure, tested); the Supabase
 * reads live in `lib/data/onboarding.ts`.
 */

export interface PhoneAccount {
  id: string;
  name: string;
  type: AccountKind;
  currency: "PHP" | "AUD" | "USD";
}

export interface PhoneIncomeSource extends DetectedSource {
  /** Latest first, at most three. */
  recent: { id: string; amountMinor: number; date: IsoDate }[];
  /** The latest entry of this source: what "First pay" splits when this is the main pay. */
  latestEntryId: string;
  latestAccountId: string;
}

export interface WaitingIncome {
  entryId: string;
  categoryId: string;
  name: string;
  amountMinor: number;
  date: IsoDate;
}

export interface PhoneFacts {
  accounts: PhoneAccount[];
  /** Every non-deleted category, income and expense. */
  categoryCount: number;
  expenseCategories: { id: string; name: string; lastMonthSpendMinor: number }[];
  /** The 60-day window the two counts below cover. */
  sinceIso: IsoDate;
  entriesSince: number;
  incomeSinceMinor: number;
  sources: PhoneIncomeSource[];
  mainCategoryId: string | null;
  /** Income this calendar month (BR §12.4.6): what Money in will hold if it isn't split here. */
  waiting: WaitingIncome[];
}

export interface RawAccount {
  id: string;
  name: string;
  accountType: number;
  currency: string;
  isArchived: boolean;
}
export interface RawCategory {
  id: string;
  name: string;
  categoryType: number;
}
export interface RawEntry {
  id: string;
  accountId: string;
  categoryId: string | null;
  amountMinor: number;
  direction: number;
  origin: number;
  transferId: string | null;
  occurredAt: number;
}
export interface RawRecurringRule {
  amountMinor: number;
  frequency: number;
  interval: number;
  startDate: number;
  endDate: number | null;
}

const CURRENCIES = ["PHP", "AUD", "USD"] as const;
const isCurrency = (c: string): c is PhoneAccount["currency"] => (CURRENCIES as readonly string[]).includes(c);

/** The window of entries the loader must fetch: the last 90 days (BR §12.4.1), which also covers last calendar month. */
export function windowStartMs(todayIso: IsoDate, timeZone: string): number {
  const d = addDays(todayIso, -90);
  return zonedMidnight(Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10)), timeZone);
}

function monthStartIso(todayIso: IsoDate): IsoDate {
  return `${todayIso.slice(0, 8)}01`;
}

/** Calendar bounds [start, end) of last month, as ISO dates. */
function lastMonthIso(todayIso: IsoDate): { start: IsoDate; end: IsoDate } {
  const y = Number(todayIso.slice(0, 4));
  const m = Number(todayIso.slice(5, 7));
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return { start: `${py}-${String(pm).padStart(2, "0")}-01`, end: monthStartIso(todayIso) };
}

/** Every bucket "on": auto-mapping for spend figures should not depend on a plan that doesn't exist yet. */
export const ALL_BUCKETS_ON: PlanPercents = { living: 1, rent: 1, fun: 1, emergency: 1, invest: 1, sinking: 1, tax: 1, buffer: 1 };

export interface BuiltPhone {
  /** Null when nothing has synced yet (no active accounts and no recent entries). */
  facts: PhoneFacts | null;
  lastMonthSpendMinor: Partial<Record<DraftBucket, number>>;
}

export function buildPhoneFacts(input: { accounts: readonly RawAccount[]; categories: readonly RawCategory[]; entries: readonly RawEntry[]; todayIso: IsoDate; timeZone: string }): BuiltPhone {
  const { todayIso, timeZone } = input;
  const accounts: PhoneAccount[] = [];
  for (const a of input.accounts) {
    if (a.isArchived || !isCurrency(a.currency)) continue;
    const type = enumName(AccountType, a.accountType);
    if (!type) continue;
    accounts.push({ id: a.id, name: a.name, type, currency: a.currency });
  }
  if (accounts.length === 0 && input.entries.length === 0) return { facts: null, lastMonthSpendMinor: {} };

  const incomeNames = new Map<string, string>();
  const expenseNames = new Map<string, string>();
  for (const c of input.categories) {
    if (c.categoryType === CategoryType.income) incomeNames.set(c.id, c.name);
    else if (c.categoryType === CategoryType.expense) expenseNames.set(c.id, c.name);
  }

  const dated = input.entries.map((e) => ({ e, date: isoDateIn(e.occurredAt, timeZone) }));
  const isTransfer = (e: RawEntry) => e.origin === LedgerOrigin.transfer || e.transferId !== null;
  const sinceIso = addDays(todayIso, -60);

  let entriesSince = 0;
  let incomeSinceMinor = 0;
  const inflows: PhoneInflow[] = [];
  const spendLast = new Map<string, number>();
  const last = lastMonthIso(todayIso);
  for (const { e, date } of dated) {
    if (isTransfer(e)) continue;
    if (date >= sinceIso && date <= todayIso) {
      entriesSince += 1;
      if (e.direction === MoneyDirection.inflow) incomeSinceMinor += e.amountMinor;
    }
    if (e.direction === MoneyDirection.inflow) {
      const name = e.categoryId ? incomeNames.get(e.categoryId) : undefined;
      if (e.categoryId && name !== undefined && e.amountMinor > 0) inflows.push({ id: e.id, accountId: e.accountId, categoryId: e.categoryId, categoryName: name, amountMinor: e.amountMinor, occurredOn: date });
    } else if (e.categoryId && date >= last.start && date < last.end) {
      spendLast.set(e.categoryId, (spendLast.get(e.categoryId) ?? 0) + e.amountMinor);
    }
  }

  const detected = detectIncomeSources(inflows, todayIso);
  const byDateAsc = (a: PhoneInflow, b: PhoneInflow) => (a.occurredOn === b.occurredOn ? a.id.localeCompare(b.id) : a.occurredOn < b.occurredOn ? -1 : 1);
  const sources: PhoneIncomeSource[] = detected.sources.map((s) => {
    const mine = inflows.filter((i) => i.categoryId === s.categoryId).sort(byDateAsc);
    const latest = mine[mine.length - 1] as PhoneInflow;
    return {
      ...s,
      recent: [...mine].reverse().slice(0, 3).map((i) => ({ id: i.id, amountMinor: i.amountMinor, date: i.occurredOn })),
      latestEntryId: latest.id,
      latestAccountId: latest.accountId,
    };
  });
  // Main pay first, then by how often it comes in.
  sources.sort((a, b) => Number(b.categoryId === detected.mainCategoryId) - Number(a.categoryId === detected.mainCategoryId) || b.entriesLast60Days - a.entriesLast60Days || a.name.localeCompare(b.name));

  const monthStart = monthStartIso(todayIso);
  const waiting: WaitingIncome[] = inflows
    .filter((i) => i.occurredOn >= monthStart && i.occurredOn <= todayIso)
    .sort((a, b) => byDateAsc(b, a))
    .map((i) => ({ entryId: i.id, categoryId: i.categoryId, name: i.categoryName, amountMinor: i.amountMinor, date: i.occurredOn }));

  const expenseCategories = [...expenseNames].map(([id, name]) => ({ id, name, lastMonthSpendMinor: spendLast.get(id) ?? 0 })).sort((a, b) => a.name.localeCompare(b.name));

  const byBucket: Partial<Record<DraftBucket, number>> = {};
  for (const c of expenseCategories) {
    if (c.lastMonthSpendMinor <= 0) continue;
    const b = autoMapCategory(c.name, ALL_BUCKETS_ON).bucket;
    byBucket[b] = (byBucket[b] ?? 0) + c.lastMonthSpendMinor;
  }
  const ordered: Partial<Record<DraftBucket, number>> = {};
  for (const b of PLAN_BUCKETS) if (byBucket[b] !== undefined) ordered[b] = byBucket[b];

  return {
    facts: {
      accounts,
      categoryCount: input.categories.length,
      expenseCategories,
      sinceIso,
      entriesSince,
      incomeSinceMinor,
      sources,
      mainCategoryId: detected.mainCategoryId,
      waiting,
    },
    lastMonthSpendMinor: ordered,
  };
}

const PER_YEAR: Partial<Record<number, number>> = {
  [RecurringFrequency.daily]: 365,
  [RecurringFrequency.weekly]: 52,
  [RecurringFrequency.monthly]: 12,
  [RecurringFrequency.quarterly]: 4,
  [RecurringFrequency.yearly]: 1,
};

/**
 * Monthly fixed bills from mobile outflow `recurring_rules` (SPEC §7.4 Priorities). Each rule becomes a monthly
 * equivalent (integer, half up); ended rules are ignored, custom-frequency rules can't be normalised and are
 * skipped. `startsOn` is the earliest start date still in the future (bills that start later).
 */
export function phoneBillsFrom(rules: readonly RawRecurringRule[], nowMs: number, timeZone: string): StepContext["phoneBills"] {
  let total = 0;
  let startsMs: number | null = null;
  let any = false;
  for (const r of rules) {
    if (r.endDate !== null && r.endDate < nowMs) continue;
    const perYear = PER_YEAR[r.frequency];
    if (!perYear || r.interval < 1 || r.amountMinor <= 0) continue;
    any = true;
    total += mulDivRound(r.amountMinor, perYear, 12 * r.interval);
    if (r.startDate > nowMs && (startsMs === null || r.startDate < startsMs)) startsMs = r.startDate;
  }
  if (!any) return null;
  return { totalMinor: total, startsOn: startsMs === null ? null : isoDateIn(startsMs, timeZone) };
}

export function todayIsoIn(nowMs: number, timeZone: string): IsoDate {
  const p = zonedParts(nowMs, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
