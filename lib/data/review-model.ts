/**
 * Review (SPEC §3): the pure model behind the weekly screen (no React, no Supabase). The week slip and its
 * reconciliation, the spending bars, the single observation, Emergency progress, the three checks, the
 * closed-week summary, dates and the sentences the live region speaks. The real writes are SQL functions
 * (`close_week`, `nudge_plan_percent`, `cover_bucket`); everything here is display and early refusal.
 *
 * WEEK SLIP TIME WINDOWS (BR §8.3). The slip must satisfy
 *     Came in = Spent + Put away + Tax set aside + Cushions & kept whole + To assign + Safe to spend
 * with the four bucket lines being each bucket's LEFT NOW (all time; that is what keeps it true when money
 * is spent from a set-aside such as a BIR payment from Tax, and when a cover moves money, since covers net
 * to zero). So the other half must be the same all-time books, split at the start of this week:
 *     Spent    = bucketed spending this week
 *     Came in  = income that landed this week + "carried in" from before this week
 *     carried in = income before the week - bucketed spending before the week (what earlier weeks left)
 * Then Came in = Spent + sum(left) + To assign exactly, with no fudge line. The SQL (`week_slip_figures`)
 * computes the three income/spending figures with the same filters as `bucket_left`, so the halves can't drift.
 * If the books ever disagree anyway, `weekSlip().difference` is non-zero and the screen says so out loud.
 */
import { addDays, dayNumber, floorDiv, formatPeso, formatPesoWhole, weekSlip, type IsoDate, type SlipBucket, type SlipRole, type WeekSlip } from "@/lib/money";

// ---------------------------------------------------------------- data shapes (what the server hands the screen)

export interface ReviewBucket {
  id: string;
  name: string;
  shortName: string | null;
  groupKey: string;
  hue: string | null;
  isArchived: boolean;
  /** bucket_left: all-time. */
  leftMinor: number;
  /** This week, from week_bucket_flows. */
  spentWeekMinor: number;
  coversInWeekMinor: number;
  /** Net change this week (allocated - spent + covers in - covers out). */
  changeWeekMinor: number;
  /** The same, for the week before. */
  changeLastWeekMinor: number;
}

export interface ReviewCategory {
  bucketId: string;
  name: string;
  amountMinor: number;
}

export interface SourceLine {
  name: string;
  amountMinor: number;
}

export interface ClosedWeek {
  /** The week_reviews row. */
  checks: { assign: boolean; transfers: boolean; living: boolean };
  safeToSpendMinor: number;
  observation: string | null;
  /** The day it was closed, in the user's zone. */
  closedDateIso: IsoDate;
}

export interface ReviewData {
  firstName: string | null;
  weekStart: IsoDate;
  /** Last day of the week, inclusive. */
  weekEnd: IsoDate;
  /** user_profiles.weekStartsOn (0 Sunday, 1 Monday) and reviewDay (0 Sunday .. 6 Saturday). */
  weekStartsOn: 0 | 1;
  reviewDay: number;
  todayIso: IsoDate;
  buckets: ReviewBucket[];
  /** Spending this week by bucket and category, biggest first. */
  categories: ReviewCategory[];
  /** Income that landed this week, one line per source. */
  sources: SourceLine[];
  cameInWeekMinor: number;
  carriedInMinor: number;
  spentWeekMinor: number;
  toAssignMinor: number;
  /** Anything happened before this week (income or a confirmed payday). */
  hasHistory: boolean;
  waitingCount: number;
  anyConfirmed: boolean;
  pendingTransfers: number;
  /** The active plan's Living share, in basis points; null when unknown. */
  livingPlanBp: number | null;
  emergency: { bucketId: string | null; savedMinor: number; targetMinor: number | null };
  closed: ClosedWeek | null;
}

// ---------------------------------------------------------------- week slip

/** Which slip line a bucket's `left` feeds (BR §8.3). */
export function slipRole(b: { groupKey: string; hue: string | null }): SlipRole {
  if (b.groupKey === "spend") return "spend";
  if (b.groupKey === "save") return "save";
  return b.hue === "tax" ? "tax" : "cushion";
}

export interface WeekSlipView {
  slip: WeekSlip;
  sources: SourceLine[];
  /** A line under the sources when earlier weeks left something behind (or overspent). Null when 0. */
  carriedInMinor: number;
}

export function buildWeekSlip(d: ReviewData): WeekSlipView {
  const buckets: SlipBucket[] = d.buckets.map((b) => ({ role: slipRole(b), left: b.leftMinor }));
  const slip = weekSlip({ cameIn: d.cameInWeekMinor + d.carriedInMinor, spent: d.spentWeekMinor, toAssign: d.toAssignMinor, buckets });
  return { slip, sources: d.sources, carriedInMinor: d.carriedInMinor };
}

/** Σ net change this week / last week over the Save & grow group: what "put away" means week on week. */
export function putAwayChange(buckets: readonly ReviewBucket[]): { week: number; lastWeek: number } {
  let week = 0;
  let lastWeek = 0;
  for (const b of buckets) {
    if (slipRole(b) !== "save") continue;
    week += b.changeWeekMinor;
    lastWeek += b.changeLastWeekMinor;
  }
  return { week, lastWeek };
}

/** The slip's footer (SPEC §3): how this week's put-away compares, or that there's nothing to compare yet. */
export function slipFooter(d: ReviewData): string {
  if (!d.hasHistory) return "Your first week in Salin Web, so there's no earlier week to compare yet. Next week you'll see the change.";
  const { week, lastWeek } = putAwayChange(d.buckets);
  const diff = week - lastWeek;
  if (diff > 0) return `${formatPeso(diff)} more put away than last week.`;
  if (diff < 0) return `${formatPeso(-diff)} less put away than last week.`;
  return "The same amount put away as last week.";
}

// ---------------------------------------------------------------- where spending went

export interface SpendBar {
  id: string;
  name: string;
  hue: string | null;
  spentMinor: number;
  /** What the bucket had to spend: left now + what went out this week. */
  hadMinor: number;
  /** 0..1 against the biggest figure in the list. */
  spentRatio: number;
}

export interface SpendSummary {
  bars: SpendBar[];
  /** Nothing logged at all this week. */
  empty: boolean;
  /** Spending this week that came from savings or set-asides (not the Spend group). */
  fromSavingsMinor: number;
  /** Names of the non-Spend buckets it came from. */
  fromSavingsNames: string[];
  text: string;
}

export function spendSummary(buckets: readonly ReviewBucket[]): SpendSummary {
  const spend = buckets.filter((b) => b.groupKey === "spend" && (!b.isArchived || b.spentWeekMinor > 0));
  const others = buckets.filter((b) => b.groupKey !== "spend" && b.spentWeekMinor > 0);
  const fromSavingsMinor = others.reduce((t, b) => t + b.spentWeekMinor, 0);
  const totalSpent = buckets.reduce((t, b) => t + b.spentWeekMinor, 0);
  const maxV = Math.max(1, ...spend.map((b) => Math.max(b.spentWeekMinor, b.leftMinor + b.spentWeekMinor)));
  const bars = spend.map((b) => ({
    id: b.id,
    name: b.name,
    hue: b.hue,
    spentMinor: b.spentWeekMinor,
    hadMinor: b.leftMinor + b.spentWeekMinor,
    spentRatio: Math.min(1, Math.max(0, b.spentWeekMinor / maxV)),
  }));
  const empty = totalSpent === 0;
  const had = bars.map((b) => `${b.name} had ${formatPeso(b.hadMinor)}`);
  const fromSavingsNames = others.map((b) => b.name);
  let text: string;
  if (empty) text = "Nothing logged this week. Log spending on your phone and it shows here.";
  else {
    const hadText = had.length ? `${had.join(" and ")} to spend. ` : "";
    text =
      fromSavingsMinor === 0
        ? `${hadText}Nothing came from savings or set-asides.`
        : `${hadText}${formatPeso(fromSavingsMinor)} came from savings or set-asides (${fromSavingsNames.join(", ")}).`;
  }
  return { bars, empty, fromSavingsMinor, fromSavingsNames, text };
}

// ---------------------------------------------------------------- one thing to look at

export type ObservationKind = "overspent" | "covered" | "positive" | "quiet";

export interface Observation {
  kind: ObservationKind;
  text: string;
  /** The overspent bucket (kind "overspent") the cover would go to. */
  bucketId: string | null;
  /** "Cover from Buffer" is offered (overspent and Buffer has something). */
  canCover: boolean;
  /** "Move 1% from Fun to Living" is offered. */
  canNudge: boolean;
}

const lower = (s: string) => s.toLowerCase();

/** The biggest category this week in one bucket. */
export function topCategory(categories: readonly ReviewCategory[], bucketId: string): ReviewCategory | null {
  let best: ReviewCategory | null = null;
  for (const c of categories) if (c.bucketId === bucketId && (!best || c.amountMinor > best.amountMinor)) best = c;
  return best;
}

/**
 * Exactly one observation, by priority (SPEC §3):
 *  1. a Spend bucket is overspent: name the biggest category, offer Cover from Buffer and Move 1% Fun -> Living;
 *  2. covered this week: suggest raising Living;
 *  3. nothing wrong: a positive fact that is true (never made up), or a quiet "nothing to fix yet".
 */
export function pickObservation(d: Pick<ReviewData, "buckets" | "categories" | "livingPlanBp" | "hasHistory">): Observation {
  const spend = d.buckets.filter((b) => b.groupKey === "spend" && !b.isArchived);
  const living = d.buckets.find((b) => b.hue === "living" && !b.isArchived) ?? null;
  const fun = d.buckets.find((b) => b.hue === "fun" && !b.isArchived) ?? null;
  const buffer = d.buckets.find((b) => b.hue === "buffer") ?? null;
  const nudgeOffered = living !== null && fun !== null;

  // 1. overspent: the deepest hole first (ties keep display order)
  let worst: ReviewBucket | null = null;
  for (const b of spend) if (b.leftMinor < 0 && (!worst || b.leftMinor < worst.leftMinor)) worst = b;
  if (worst) {
    const need = -worst.leftMinor;
    const top = topCategory(d.categories, worst.id);
    const clause = top ? ` ${top.name} was ${formatPeso(top.amountMinor)} of the ${formatPeso(worst.spentWeekMinor)} spent.` : "";
    const bufferLeft = buffer ? Math.max(0, buffer.leftMinor) : 0;
    const canCover = bufferLeft > 0;
    const noBuffer = canCover ? "" : " Buffer has nothing left to cover it.";
    return {
      kind: "overspent",
      text: `${worst.name} ran ${formatPeso(need)} short.${clause}${noBuffer}`,
      bucketId: worst.id,
      canCover,
      canNudge: living !== null && fun !== null && worst.id === living.id,
    };
  }

  // 2. covered this week
  const covered = spend.find((b) => b.coversInWeekMinor > 0);
  if (covered) {
    const top = topCategory(d.categories, covered.id);
    const pct = d.livingPlanBp !== null ? Math.floor(d.livingPlanBp / 100) + 1 : null;
    const ifClause = top ? `If ${lower(top.name)} stays this high` : "If spending stays this high";
    const need = pct !== null ? `Living may need ${pct}% of each payday.` : "Living may need a bigger share of each payday.";
    return {
      kind: "covered",
      text: `You covered ${covered.name} from Buffer this week. ${ifClause}, ${need}`,
      bucketId: covered.id,
      canCover: false,
      canNudge: nudgeOffered,
    };
  }

  // 3. a true, positive fact (or honestly nothing yet)
  const { week, lastWeek } = putAwayChange(d.buckets);
  const spentInSpend = spend.reduce((t, b) => t + b.spentWeekMinor, 0);
  const putAwayLeft = d.buckets.filter((b) => slipRole(b) === "save").reduce((t, b) => t + Math.max(0, b.leftMinor), 0);
  if (d.hasHistory && week > 0 && week > lastWeek && lastWeek >= 0) {
    return { kind: "positive", text: `You put away ${formatPeso(week)} this week, more than last week's ${formatPeso(lastWeek)}. Nothing to change.`, bucketId: null, canCover: false, canNudge: false };
  }
  if (spentInSpend > 0) {
    const stayed = living ? `${living.name} stayed above zero all week.` : "Every Spend bucket stayed above zero all week.";
    const away = putAwayLeft > 0 ? ` You have ${formatPeso(putAwayLeft)} put away for future you.` : "";
    return { kind: "positive", text: `${stayed}${away} Nothing to change.`, bucketId: null, canCover: false, canNudge: false };
  }
  if (week > 0) {
    return { kind: "positive", text: `You put away ${formatPeso(week)} this week. Nothing to change.`, bucketId: null, canCover: false, canNudge: false };
  }
  return {
    kind: "quiet",
    text: "Nothing to fix yet. Log a few days of spending and next week this card points to the one thing worth changing.",
    bucketId: null,
    canCover: false,
    canNudge: false,
  };
}

// ---------------------------------------------------------------- progress this week

export interface EmergencyProgress {
  /** Change in the fund THIS WEEK, not the total. */
  changeMinor: number;
  savedMinor: number;
  targetMinor: number | null;
  /** floor(saved / target), clamped to 0..100; null without a target. */
  percent: number | null;
  text: string;
}

export function emergencyProgress(d: Pick<ReviewData, "buckets" | "emergency">): EmergencyProgress {
  const b = d.emergency.bucketId ? d.buckets.find((x) => x.id === d.emergency.bucketId) : undefined;
  const changeMinor = b?.changeWeekMinor ?? 0;
  const { savedMinor, targetMinor } = d.emergency;
  if (targetMinor === null || targetMinor <= 0) return { changeMinor, savedMinor, targetMinor: null, percent: null, text: "No Plan B switch amount is set yet. Set one in Plans." };
  const percent = Math.min(100, Math.max(0, floorDiv(savedMinor * 100, targetMinor)));
  return { changeMinor, savedMinor, targetMinor, percent, text: `${percent}% of the ${formatPesoWhole(targetMinor)} that switches you to Plan B.` };
}

// ---------------------------------------------------------------- the three checks

export type CheckId = "assign" | "transfers" | "living";
export interface ReviewCheck {
  id: CheckId;
  label: string;
  on: boolean;
}

/** Mirrors `close_week`'s checks for display before closing; the stored row always comes from SQL. */
export function reviewChecks(d: Pick<ReviewData, "waitingCount" | "anyConfirmed" | "pendingTransfers" | "buckets">): ReviewCheck[] {
  const assign = d.waitingCount === 0;
  const living = d.buckets.filter((b) => b.hue === "living").every((b) => b.leftMinor >= 0);
  return [
    { id: "assign", label: "Every peso has a job", on: assign },
    { id: "transfers", label: "Transfers made", on: assign && d.anyConfirmed && d.pendingTransfers === 0 },
    { id: "living", label: "Living above zero", on: living },
  ];
}

export function openItemsCount(checks: readonly { on: boolean }[]): number {
  return checks.filter((c) => !c.on).length;
}

export const CHECK_LABELS: Record<CheckId, string> = {
  assign: "Every peso has a job",
  transfers: "Transfers made",
  living: "Living above zero",
};

/** The checks of a stored week, in display order. */
export function closedChecks(c: ClosedWeek): ReviewCheck[] {
  return (["assign", "transfers", "living"] as const).map((id) => ({ id, label: CHECK_LABELS[id], on: c.checks[id] }));
}

// ---------------------------------------------------------------- stepper

export interface ReviewStep {
  label: string;
  done: boolean;
}

/** Look back (always done once you're here) · Fix one thing · Close the week. */
export function reviewSteps(obs: Pick<Observation, "kind">, closed: boolean): ReviewStep[] {
  return [
    { label: "Look back", done: true },
    { label: "Fix one thing", done: closed || obs.kind !== "overspent" },
    { label: "Close the week", done: closed },
  ];
}

// ---------------------------------------------------------------- dates (calendar dates, no zones)

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** 0 = Sunday. 1970-01-01 was a Thursday. */
export function weekdayOf(d: IsoDate): number {
  return (((dayNumber(d) + 4) % 7) + 7) % 7;
}
export const weekdayName = (d: IsoDate): string => DAYS[weekdayOf(d)];
const parts = (d: IsoDate) => ({ m: Number(d.slice(5, 7)) - 1, day: Number(d.slice(8, 10)) });
const short = (m: number) => MONTHS[m].slice(0, 3);

/** "Oct 5 – 11", or "Sep 28 – Oct 4" across a month. */
export function formatWeekRange(start: IsoDate, end: IsoDate): string {
  const a = parts(start);
  const b = parts(end);
  return a.m === b.m ? `${short(a.m)} ${a.day} – ${b.day}` : `${short(a.m)} ${a.day} – ${short(b.m)} ${b.day}`;
}

/** "Sunday, October 18". */
export function formatLongDate(d: IsoDate): string {
  const p = parts(d);
  return `${weekdayName(d)}, ${MONTHS[p.m]} ${p.day}`;
}

/** "OCT 11" for the stamp. */
export function formatStampDate(d: IsoDate): string {
  const p = parts(d);
  return `${short(p.m).toUpperCase()} ${p.day}`;
}

/** The date the next review falls on: the first reviewDay on or after the start of next week. */
export function nextReviewDate(weekStart: IsoDate, reviewDay: number): IsoDate {
  const next = addDays(weekStart, 7);
  return addDays(next, (reviewDay - weekdayOf(next) + 7) % 7);
}

/** The start of the week containing `todayIso`, for a week that starts on `weekStartsOn`. */
export function weekStartOf(todayIso: IsoDate, weekStartsOn: 0 | 1): IsoDate {
  return addDays(todayIso, -((weekdayOf(todayIso) - weekStartsOn + 7) % 7));
}

// ---------------------------------------------------------------- closed week + sentences

export interface ClosedSummary {
  heading: string;
  checks: Array<ReviewCheck & { carries: boolean }>;
  startNext: string;
  nextReview: string;
  openItems: number;
}

/** "Week closed. Monday starts fresh." with the real first day of next week. */
export function closedHeading(weekStart: IsoDate): string {
  return `Week closed. ${weekdayName(addDays(weekStart, 7))} starts fresh.`;
}

export function closedSummary(d: Pick<ReviewData, "weekStart" | "reviewDay"> & { closed: ClosedWeek }): ClosedSummary {
  const checks = closedChecks(d.closed).map((c) => ({ ...c, carries: !c.on }));
  return {
    heading: closedHeading(d.weekStart),
    checks,
    startNext: `You start next week with ${formatPesoWhole(d.closed.safeToSpendMinor)} safe to spend`,
    nextReview: `Next review: ${formatLongDate(nextReviewDate(d.weekStart, d.reviewDay))}.`,
    openItems: openItemsCount(checks),
  };
}

const pct = (bp: number): string => (bp % 100 === 0 ? `${bp / 100}%` : `${(bp / 100).toFixed(2).replace(/0$/, "")}%`);

/** What the live region says after "Move 1% from Fun to Living": it names BOTH plans (D-18). */
export function nudgeMessage(rows: ReadonlyArray<{ planKey: string; fromBp: number; toBp: number }>, fromName: string, toName: string, movedBp: number): string {
  const per = rows.map((r) => `Plan ${r.planKey}: ${toName} ${pct(r.toBp)}, ${fromName} ${pct(r.fromBp)}`).join(". ");
  return `Moved ${pct(movedBp)} from ${fromName} to ${toName} in both plans. ${per}. It starts with your next payday.`;
}

/** After "Cover from Buffer": what moved, and what's still needed if Buffer couldn't cover it all (D-19). */
export function coverMessage(r: { coveredMinor: number; stillNeedsMinor: number }, toName: string): string {
  if (r.coveredMinor === 0) return `Buffer has nothing left to cover ${toName}. Pick another bucket to cover it from.`;
  if (r.stillNeedsMinor === 0) return `Covered ${toName} with ${formatPeso(r.coveredMinor)} from Buffer. ${toName} is back to zero.`;
  return `Covered ${formatPeso(r.coveredMinor)} from Buffer. ${toName} still needs ${formatPeso(r.stillNeedsMinor)}. Buffer is empty, so pick another bucket for the rest.`;
}
