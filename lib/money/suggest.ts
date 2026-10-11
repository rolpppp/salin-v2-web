import { addDays, assertMinor, ceilDiv, dayNumber, daysBetween, medianInt, mulDivRound } from "./core";
import type { IsoDate, Minor } from "./core";
import type { PercentLine } from "./split";

// ---------------------------------------------------------------- plan buckets

/** The eight plan buckets onboarding deals with. `rent` is the Bills bucket (renamed to the bill kind picked). */
export type PlanBucket = "living" | "rent" | "fun" | "emergency" | "invest" | "sinking" | "tax" | "buffer";
export const PLAN_BUCKETS: readonly PlanBucket[] = ["living", "rent", "fun", "emergency", "invest", "sinking", "tax", "buffer"];
/** Whole percents per bucket; total 100. */
export type PlanPercents = Record<PlanBucket, number>;

export type PayFrequency = "monthly" | "twice" | "biweekly" | "weekly" | "varies";
export type Priority = "safety" | "goal" | "grow" | "control";
export type IncomeKind = "salary" | "side_hustle" | "scholarship" | "allowance";
export type PlanPreset = "suggested" | "fifty_thirty_twenty" | "simple";

/** Pays per month as an exact fraction: monthly x1, twice x2, every 2 weeks x26/12, weekly x52/12, varies x1. */
export const FREQUENCY_FACTOR: Record<PayFrequency, readonly [num: number, den: number]> = {
  monthly: [1, 1],
  twice: [2, 1],
  biweekly: [26, 12],
  weekly: [52, 12],
  varies: [1, 1],
};

/** M = round(A × f), half up, in integer math. */
export function monthlyIncome(amountPerPay: Minor, frequency: PayFrequency): Minor {
  assertMinor(amountPerPay);
  const [n, d] = FREQUENCY_FACTOR[frequency];
  return mulDivRound(amountPerPay, n, d);
}

export interface SuggestPlanInput {
  amountMinor: Minor;
  frequency: PayFrequency;
  /** Monthly fixed bills; 0 if none. */
  billsMinor: Minor;
  priority: Priority;
  kind: IncomeKind;
  paidInOtherCurrency: boolean;
  /** Default "suggested". */
  preset?: PlanPreset;
}

export interface SuggestedPlan {
  monthlyMinor: Minor;
  billsPct: number;
  /** Bills were capped at 45% (D-30). */
  billsCapped: boolean;
  /** What billsPct actually covers per month: round(M × billsPct / 100). */
  billsCoveredMinor: Minor;
  /** Set when capped and the share is less than the bills: show "₱13,500 < ₱20,000". */
  billsWarning: { coveredMinor: Minor; billsMinor: Minor } | null;
  plan: PlanPercents;
  /** null unless Emergency >= 10. */
  planB: PlanPercents | null;
}

export const BILLS_CAP_PCT = 45;

const PROFILES: Record<Priority, Pick<PlanPercents, "fun" | "emergency" | "invest" | "sinking">> = {
  safety: { fun: 10, emergency: 25, invest: 5, sinking: 10 },
  goal: { fun: 10, emergency: 10, invest: 5, sinking: 25 },
  grow: { fun: 10, emergency: 10, invest: 25, sinking: 5 },
  control: { fun: 20, emergency: 15, invest: 5, sinking: 10 },
};

/** Trim order (BR §12.1.5): [bucket, floor]. */
const TRIM_ORDER: readonly (readonly [PlanBucket, number])[] = [
  ["fun", 5],
  ["sinking", 5],
  ["invest", 0],
  ["emergency", 5],
  ["living", 10],
  ["fun", 0],
  ["sinking", 0],
  ["emergency", 0],
];

export const planTotal = (p: PlanPercents): number => PLAN_BUCKETS.reduce((t, k) => t + p[k], 0);

/** Plan B (BR §12.1.6): Plan A with Emergency 5% and the difference added to Investments; only if Emergency >= 10. */
export function planBFrom(planA: PlanPercents): PlanPercents | null {
  if (planA.emergency < 10) return null;
  return { ...planA, invest: planA.invest + planA.emergency - 5, emergency: 5 };
}

/** BR §12.1 suggested plan. */
export function suggestPlan(input: SuggestPlanInput): SuggestedPlan {
  assertMinor(input.amountMinor);
  assertMinor(input.billsMinor);
  const preset = input.preset ?? "suggested";
  const M = monthlyIncome(input.amountMinor, input.frequency);
  const rawBillsPct = input.billsMinor > 0 && M > 0 ? ceilDiv(input.billsMinor * 100, M) : 0;
  const billsPct = input.billsMinor > 0 ? Math.min(BILLS_CAP_PCT, rawBillsPct) : 0;
  const billsCapped = rawBillsPct > BILLS_CAP_PCT;
  const p: PlanPercents = { living: 0, rent: billsPct, fun: 0, emergency: 0, invest: 0, sinking: 0, tax: 0, buffer: 0 };
  if (preset === "fifty_thirty_twenty") {
    Object.assign(p, { living: Math.max(10, 50 - billsPct), fun: 30, emergency: 10, invest: 5, sinking: 5 });
  } else if (preset === "simple") {
    Object.assign(p, { living: Math.max(10, 60 - billsPct), fun: 20, emergency: 20, invest: 0, sinking: 0 });
  } else {
    Object.assign(p, { living: Math.max(10, 50 - billsPct) }, PROFILES[input.priority]);
  }
  p.tax = input.kind === "side_hustle" || input.paidInOtherCurrency ? 6 : 0;
  p.buffer = input.paidInOtherCurrency ? 3 : input.frequency === "varies" ? 5 : 0;
  let over = planTotal(p) - 100;
  for (const [k, floor] of TRIM_ORDER) {
    if (over <= 0) break;
    const take = Math.min(over, Math.max(0, p[k] - floor));
    p[k] -= take;
    over -= take;
  }
  if (over < 0) p.emergency -= over;
  const billsCoveredMinor = mulDivRound(M, billsPct, 100);
  return {
    monthlyMinor: M,
    billsPct,
    billsCapped,
    billsCoveredMinor,
    billsWarning: billsCapped && billsCoveredMinor < input.billsMinor ? { coveredMinor: billsCoveredMinor, billsMinor: input.billsMinor } : null,
    plan: p,
    planB: planBFrom(p),
  };
}

/** Plan percentages as bp lines for `splitByPlan` (whole percent × 100). Zero-percent buckets are included. */
export function planToLines(p: PlanPercents): PercentLine[] {
  return PLAN_BUCKETS.map((k) => ({ bucketId: k, bp: p[k] * 100 }));
}

/**
 * BR §12.2: target = ceil(3 × round(M × (Living% + Bills%) / 100) / ₱1,000) × ₱1,000, min ₱1,000.
 * Returns centavos.
 */
export function safetyNetTarget(monthlyMinor: Minor, livingPct: number, billsPct: number): Minor {
  const need = mulDivRound(monthlyMinor, livingPct + billsPct, 100) * 3;
  return Math.max(100_000, ceilDiv(need, 100_000) * 100_000);
}

/** BR §12.7: Plan A = Spending (the Living bucket, renamed) 100%, Plan B off, every bucket in L, no goals. */
export function justTrackPlan(landingAccountId: string): {
  plan: PlanPercents;
  planB: null;
  homes: Record<PlanBucket, string>;
  goals: never[];
  categoryMapSource: "auto";
} {
  const plan: PlanPercents = { living: 100, rent: 0, fun: 0, emergency: 0, invest: 0, sinking: 0, tax: 0, buffer: 0 };
  const homes = Object.fromEntries(PLAN_BUCKETS.map((k) => [k, landingAccountId])) as Record<PlanBucket, string>;
  return { plan, planB: null, homes, goals: [], categoryMapSource: "auto" };
}

// ---------------------------------------------------------------- 12.3 homes

export type AccountKind = "cash" | "bank" | "savings" | "eWallet" | "creditCard" | "debitCard" | "investment";

export interface HomeAccount {
  id: string;
  /** Names follow the mobile `AccountType` enum. */
  kind: AccountKind;
  currency?: string;
}

export type HomeMap = Record<PlanBucket, string>;

/**
 * BR §12.3: suggested account per bucket over the user's PHP accounts (in the given order),
 * with L = the account pay lands in. "First/second" refer to that order; "savings"/"bank"
 * exclude L (prototype behaviour), investment does not.
 */
export function suggestHomes(accounts: readonly HomeAccount[], landingId: string): HomeMap {
  const php = accounts.filter((a) => (a.currency ?? "PHP") === "PHP");
  const ids = (kind: AccountKind, excludeL: boolean): string[] => php.filter((a) => a.kind === kind && !(excludeL && a.id === landingId)).map((a) => a.id);
  const pick = (...lists: readonly string[][]): string => {
    for (const l of lists) if (l[0] !== undefined) return l[0];
    return landingId;
  };
  const wallets = ids("eWallet", false);
  const savings = ids("savings", true);
  const banks = ids("bank", true);
  const cash = ids("cash", false);
  const emergency = pick(savings, banks);
  return {
    living: pick(wallets, cash),
    fun: wallets[1] ?? pick(wallets, cash),
    rent: landingId,
    tax: landingId,
    buffer: landingId,
    emergency,
    sinking: savings[1] ?? pick(savings, banks),
    invest: pick(ids("investment", false), savings, banks),
  };
}

/** Transfers each payday: distinct homes other than L among buckets that have a share. */
export function transferCount(homes: HomeMap, plan: PlanPercents, landingId: string): number {
  const set = new Set<string>();
  for (const k of PLAN_BUCKETS) if (plan[k] > 0 && homes[k] !== landingId) set.add(homes[k]);
  return set.size;
}

// ---------------------------------------------------------------- 12.4 income detection

export interface PhoneInflow {
  id: string;
  accountId: string;
  /** Income category id; entries without one are skipped here (they go to "Others", D-25). */
  categoryId: string;
  categoryName: string;
  amountMinor: Minor;
  occurredOn: IsoDate;
  /** Transfers are not income. */
  isTransfer?: boolean;
}

export type Cadence = "once" | "weekly" | "biweekly" | "twice_monthly" | "monthly" | "varies";

export const CADENCE_DAYS = { weekly: 7, biweekly: 14, twice_monthly: 15, monthly: 30 } as const;

/**
 * BR §12.4.2. `datesAsc` are entry dates in ascending order. Uses the last three entries; the
 * median gap (average of two gaps, half up) decides: 6–8 weekly, 13–16 every 2 weeks or twice
 * a month (twice a month when the first and third of those entries fall within 1 day of the
 * same day of month; with only two entries it is "biweekly"), 28–31 monthly, else varies.
 */
export function detectCadence(datesAsc: readonly IsoDate[]): { cadence: Cadence; medianGap: number | null } {
  if (datesAsc.length <= 1) return { cadence: "once", medianGap: null };
  const last = datesAsc.slice(-3);
  const gaps = last.slice(1).map((d, i) => daysBetween(last[i] as IsoDate, d));
  const gap = medianInt(gaps);
  if (gap >= 6 && gap <= 8) return { cadence: "weekly", medianGap: gap };
  if (gap >= 13 && gap <= 16) {
    if (last.length === 3) {
      const dom = (d: IsoDate): number => Number(d.slice(8, 10));
      const a = dom(last[0] as IsoDate);
      const c = dom(last[2] as IsoDate);
      if (Math.abs(a - c) <= 1) return { cadence: "twice_monthly", medianGap: gap };
    }
    return { cadence: "biweekly", medianGap: gap };
  }
  if (gap >= 28 && gap <= 31) return { cadence: "monthly", medianGap: gap };
  return { cadence: "varies", medianGap: gap };
}

export type GuessedKind = "salary" | "scholarship" | "allowance" | "other";
export type GuessedRule = "plan" | "whole" | "ask";

/** BR §12.4.5: kind from the category name; rule follows the kind's default; other -> ask. */
export function guessKind(categoryName: string): { kind: GuessedKind; rule: GuessedRule } {
  const n = categoryName.toLowerCase();
  if (/salary|payroll|wage/.test(n)) return { kind: "salary", rule: "plan" };
  if (/stipend|scholar/.test(n)) return { kind: "scholarship", rule: "whole" };
  if (/allowance/.test(n)) return { kind: "allowance", rule: "whole" };
  return { kind: "other", rule: "ask" };
}

export interface DetectedSource {
  categoryId: string;
  name: string;
  landsInAccountId: string;
  entryCount: number;
  entriesLast60Days: number;
  totalLast60Days: Minor;
  latestAmountMinor: Minor;
  latestDate: IsoDate;
  cadence: Cadence;
  nextPayday: IsoDate | null;
  kind: GuessedKind;
  rule: GuessedRule;
}

export interface DetectedIncome {
  sources: DetectedSource[];
  /** Category id of the main pay (most entries in 60 days; ties: larger total), or null. */
  mainCategoryId: string | null;
}

/**
 * BR §12.4: group inflows (not transfers) of the last 90 days by income category. Each group is
 * a source named after its category, landing in the account most of its entries landed in
 * (tie: the account of the latest tied entry). Main pay = most entries in the last 60 days
 * (ties: larger total in those 60 days). Next payday = latest + median gap, moved forward by
 * whole gaps to today or later.
 */
export function detectIncomeSources(entries: readonly PhoneInflow[], today: IsoDate): DetectedIncome {
  const groups = new Map<string, PhoneInflow[]>();
  for (const e of entries) {
    if (e.isTransfer) continue;
    const age = daysBetween(e.occurredOn, today);
    if (age < 0 || age > 90) continue;
    const list = groups.get(e.categoryId) ?? [];
    list.push(e);
    groups.set(e.categoryId, list);
  }
  const sources: DetectedSource[] = [];
  for (const [categoryId, list] of groups) {
    const asc = [...list].sort((a, b) => dayNumber(a.occurredOn) - dayNumber(b.occurredOn) || a.id.localeCompare(b.id));
    const latest = asc[asc.length - 1] as PhoneInflow;
    const counts = new Map<string, number>();
    for (const e of asc) counts.set(e.accountId, (counts.get(e.accountId) ?? 0) + 1);
    const top = Math.max(...counts.values());
    const lands = [...asc].reverse().find((e) => counts.get(e.accountId) === top) as PhoneInflow;
    const recent = asc.filter((e) => daysBetween(e.occurredOn, today) <= 60);
    const { cadence, medianGap } = detectCadence(asc.map((e) => e.occurredOn));
    let nextPayday: IsoDate | null = null;
    if (medianGap !== null && medianGap > 0) {
      let next = addDays(latest.occurredOn, medianGap);
      while (daysBetween(today, next) < 0) next = addDays(next, medianGap);
      nextPayday = next;
    }
    const g = guessKind(latest.categoryName);
    sources.push({
      categoryId,
      name: latest.categoryName,
      landsInAccountId: lands.accountId,
      entryCount: asc.length,
      entriesLast60Days: recent.length,
      totalLast60Days: recent.reduce((t, e) => t + e.amountMinor, 0),
      latestAmountMinor: latest.amountMinor,
      latestDate: latest.occurredOn,
      cadence,
      nextPayday,
      kind: g.kind,
      rule: g.rule,
    });
  }
  const main = [...sources].sort((a, b) => b.entriesLast60Days - a.entriesLast60Days || b.totalLast60Days - a.totalLast60Days)[0];
  return { sources, mainCategoryId: main && main.entriesLast60Days > 0 ? main.categoryId : null };
}

// ---------------------------------------------------------------- 12.5 category auto-mapping

const CATEGORY_RULES: readonly (readonly [PlanBucket, RegExp])[] = [
  ["living", /grocer|food|lunch|meal|transport|commute|fare|load|data|laundry|utilit|electric|water|medicine|pharm/i],
  ["rent", /rent|tuition|dorm|internet|wifi/i],
  ["fun", /movie|going out|eating out|shopping|coffee|game|hobb|treat|dining/i],
  ["sinking", /school|gadget|health|gift|travel/i],
  ["tax", /tax|bir/i],
  ["buffer", /fee|fx|exchange/i],
];

export interface AutoMapped {
  bucket: PlanBucket;
  /** false = "not sure": the user checks these first. */
  sure: boolean;
}

/**
 * BR §12.5: first matching rule in order; if the matched bucket has no share in the plan, or
 * nothing matches, Living and "not sure". Just-track plans (Living 100%) map everything to
 * Living as sure (pass `justTrack: true`).
 */
export function autoMapCategory(name: string, plan: PlanPercents, opts: { justTrack?: boolean } = {}): AutoMapped {
  if (opts.justTrack) return { bucket: "living", sure: true };
  const hit = CATEGORY_RULES.find(([, re]) => re.test(name));
  if (!hit) return { bucket: "living", sure: false };
  const bucket = hit[0];
  return plan[bucket] > 0 ? { bucket, sure: true } : { bucket: "living", sure: false };
}
