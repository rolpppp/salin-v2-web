/**
 * Today: the pure read model (no React, no Supabase). Rows in, one serialisable view model out.
 * SPEC §1, BR §4 (safe to spend, per day, overspent), §7 (goals, milestones), §8 and §12.6 (week loop,
 * next step), §2.1.5 (waiting income previewed as the active plan). Money is integer centavos throughout;
 * the only ratios are shelf proportions in basis points, which are drawing, not money.
 *
 * The balances themselves come from SQL (`bucket_left`, `active_plan`, `transfer_plan`); this file only
 * arranges them. G9 and G10 (BR §10) are asserted against `buildTodayView` in today-model.test.ts.
 */
import {
  addDays,
  bucketNeeds,
  ceilDiv,
  coverFromBuffer,
  dayNumber,
  daysBetween,
  floorDiv,
  formatPeso,
  formatPesoWhole,
  milestonesCrossed,
  nextStep,
  paydaysToGo,
  perDay,
  safeToSpend,
  weekLoopSteps,
  type LoopPhase,
  type Milestone,
  type PlanKey,
  type StepId,
} from "@/lib/money";
import { buildGoals, goalSaved } from "./goals";
import {
  computePreviews,
  isoDateIn,
  isValidIsoDate,
  pctText,
  shortDate,
  sortQueue,
  type Choice,
  type MiIncome,
  type MiSource,
  type MiTransferRow,
  type PlanContext,
} from "./money-in-model";

// ---------------------------------------------------------------- input (what the loader hands over)

export interface TodayBucket {
  id: string;
  name: string;
  shortName: string | null;
  groupKey: string;
  hue: string | null;
  note: string | null;
  keptInAccountId: string | null;
  planless: boolean;
  displayOrder: number;
  isArchived: boolean;
}

/** One bucket's `bucket_left()` row. */
export interface BucketFlow {
  allocated: number;
  spent: number;
  coversIn: number;
  coversOut: number;
  left: number;
}

/** A live allocation line joined with its income. */
export interface TodayAllocation {
  entryId: string;
  bucketId: string;
  amountMinor: number;
  /** When the income was confirmed (ms). */
  confirmedAt: number;
  /** When the income landed (ms). */
  occurredAt: number;
  sourceId: string | null;
}

export interface MonthSpend {
  bucketId: string;
  dateIso: string;
  amountMinor: number;
  /** Category name, else the note, else "Spending". */
  label: string;
}

export interface MonthCover {
  fromBucketId: string;
  toBucketId: string;
  dateIso: string;
  amountMinor: number;
}

export interface TodayGoalRow {
  id: string;
  name: string;
  targetMinor: number;
  currency: string;
  linkedBucketId: string | null;
  linkedShareBp: number;
  isPlanSwitch: boolean;
}

export interface TodayInput {
  nowMs: number;
  timeZone: string;
  /** Today's calendar date in the user's zone. */
  todayIso: string;
  profile: {
    nextPaydayDate: string | null;
    planMode: string;
    onboardedAt: number | null;
    /** 0 = Sunday .. 6 = Saturday. */
    reviewDay: number;
    weekStartsOn: 0 | 1;
  };
  /** This week, `[startIso, endIso)` in the user's zone. */
  week: { startIso: string; endIso: string };
  buckets: TodayBucket[];
  accountNames: Record<string, string>;
  flows: Record<string, BucketFlow>;
  /** From `active_plan()`. */
  activePlan: PlanKey;
  plan: PlanContext;
  sources: MiSource[];
  /** Incomes waiting for a job. */
  incomes: MiIncome[];
  transferPlan: MiTransferRow[];
  allocations: TodayAllocation[];
  spendingThisMonth: MonthSpend[];
  coversThisMonth: MonthCover[];
  goals: TodayGoalRow[];
  /** A `week_reviews` row exists for this week's start. */
  weekClosed: boolean;
  /** Any week has ever been closed (ends the "Getting started" first week). */
  anyWeekClosed: boolean;
  /** An expense entered after `onboardedAt` (BR §11.4). */
  spendingLoggedAfterOnboarding: boolean;
  syncOff: boolean;
}

// ---------------------------------------------------------------- small helpers

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_LETTERS = "SMTWTFS";

const weekdayOf = (iso: string): number => new Date(dayNumber(iso) * 86_400_000).getUTCDay();
const monthIndex = (iso: string): number => Number(iso.slice(5, 7)) - 1;

/** `2026-10-21` -> `Oct 21`. */
export const dayLabel = shortDate;
/** `2026-10-21` -> `Wednesday, Oct 21`. */
export const longDayLabel = (iso: string): string => `${WEEKDAYS_LONG[weekdayOf(iso)]}, ${shortDate(iso)}`;
/** `2027-01-01` -> `Jan 2027`. */
export const monthYear = (iso: string): string => `${MONTHS_SHORT[monthIndex(iso)]} ${iso.slice(0, 4)}`;

/** "Oct 5 to 11", or "Sep 28 to Oct 4" when the week crosses a month. endIso is exclusive. */
export function weekRangeLabel(startIso: string, endIso: string): string {
  const last = addDays(endIso, -1);
  return monthIndex(startIso) === monthIndex(last) ? `${shortDate(startIso)} to ${Number(last.slice(8, 10))}` : `${shortDate(startIso)} to ${shortDate(last)}`;
}

/** Whole days from today to payday; null when unknown, malformed or already past (the date is stale). */
export function daysUntilPayday(todayIso: string, nextPaydayDate: string | null): number | null {
  if (!nextPaydayDate || !isValidIsoDate(nextPaydayDate)) return null;
  const d = daysBetween(todayIso, nextPaydayDate);
  return d < 0 ? null : d;
}

/** "10 days until payday", "1 day until payday", "Payday is today"; null when unknown. */
export function daysUntilText(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return "Payday is today";
  return `${days} day${days === 1 ? "" : "s"} until payday`;
}

function joinNames(names: readonly string[], conj: "and" | "&" = "and"): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ${conj} ${names[names.length - 1]}`;
}

const shortName = (b: Pick<TodayBucket, "name" | "shortName">): string => b.shortName?.trim() || b.name;

const flowOf = (flows: Readonly<Record<string, BucketFlow>>, id: string): BucketFlow => flows[id] ?? { allocated: 0, spent: 0, coversIn: 0, coversOut: 0, left: 0 };

// ---------------------------------------------------------------- shelf (SPEC §1)

/** Ribbons are drawn to one scale. Prototype floor of ₱14,000, growing in ₱2,000 steps so nothing clips. */
export const SHELF_MIN_SCALE = 1_400_000;
export const SHELF_STEP = 200_000;

export function shelfScale(maxMinor: number): number {
  return Math.max(SHELF_MIN_SCALE, ceilDiv(Math.max(0, maxMinor), SHELF_STEP) * SHELF_STEP);
}

export type ShelfTag = { kind: "needs" | "starts" | "planless"; text: string };

export interface ShelfSlot {
  id: string;
  name: string;
  shortName: string;
  hue: string | null;
  keptIn: string | null;
  leftMinor: number;
  /** What was left before today's confirms (the grow animation's start); equals `leftMinor` when nothing landed today. */
  prevLeftMinor: number;
  /** > 0 when overspent (coral "Needs ₱X", no ribbon). */
  needsMinor: number;
  /** Ribbon height as basis points of the shared scale (0 when nothing to draw). */
  ribbonBp: number;
  /** Very short ribbons get the thinner top edge. */
  tiny: boolean;
  /** What waiting income would add here (0 when none). */
  pendingAddMinor: number;
  /** The dashed preview's height in basis points of the scale. */
  pendingBp: number;
  /** Put the "+₱X" inside the dashed box (tall enough) rather than under it. */
  pendingLabelInside: boolean;
  tag: ShelfTag | null;
  ariaLabel: string;
}

export interface ShelfGroup {
  key: "spend" | "save" | "set_aside";
  title: string;
  hint: string;
  slots: ShelfSlot[];
}

export interface ShelfView {
  groups: ShelfGroup[];
  scaleMinor: number;
  totalMinor: number;
  /** Waiting income previewed on the ribbons. */
  preview: { totalMinor: number; /** "Gift shown as Plan A" */ note: string | null } | null;
}

/**
 * A bucket is on show when money moved through it, the plan gives it a share, or a source keeps money in it
 * (SPEC §1 "Shelf visibility"). Archived buckets show only while they hold or spent money.
 */
export function bucketOnShelf(b: TodayBucket, flow: BucketFlow, plan: Pick<PlanContext, "planA" | "planB" | "switchOn">, sources: readonly MiSource[]): boolean {
  if (flow.allocated !== 0 || flow.spent !== 0 || flow.coversIn !== 0 || flow.coversOut !== 0) return true;
  if (b.isArchived) return false;
  if (sources.some((s) => !s.isArchived && ((s.rule === "whole" && s.wholeBucketId === b.id) || (s.rule === "own" && s.splitLines.some((l) => l.bucketId === b.id && l.bp > 0))))) return true;
  if (b.planless) return false;
  const bp = (lines: PlanContext["planA"]) => lines.find((l) => l.bucketId === b.id)?.bp ?? 0;
  return bp(plan.planA) > 0 || (plan.switchOn && bp(plan.planB) > 0);
}

const GROUPS: readonly { key: ShelfGroup["key"]; title: string; hint: string }[] = [
  { key: "spend", title: "Spend", hint: "day to day" },
  { key: "save", title: "Save & grow", hint: "future you" },
  { key: "set_aside", title: "Set aside", hint: "bills, cushions & scholarship" },
];

/** The "Set aside" hint names what is really there: "bills, cushions & scholarship". */
export function setAsideHint(buckets: readonly Pick<TodayBucket, "hue" | "planless">[]): string {
  const parts: string[] = [];
  if (buckets.some((b) => b.hue === "rent" || b.hue === "tax")) parts.push("bills");
  if (buckets.some((b) => b.hue === "buffer")) parts.push("cushions");
  if (buckets.some((b) => b.hue === "dost" || b.planless)) parts.push("scholarship");
  return parts.length ? joinNames(parts, "&") : "";
}

/**
 * What each bucket would gain from the waiting incomes, in confirm order. An income with no job is previewed
 * as if split by the active plan (BR §2.1.5), and its name is returned so the legend can say so.
 */
export function previewWaiting(input: Pick<TodayInput, "incomes" | "sources" | "buckets" | "plan">): { add: Map<string, number>; asPlan: string[]; totalMinor: number } {
  const add = new Map<string, number>();
  if (input.incomes.length === 0) return { add, asPlan: [], totalMinor: 0 };
  const data = { incomes: input.incomes, sources: input.sources, buckets: input.buckets.map(toMiBucket), plan: input.plan };
  const first = computePreviews(data, {});
  const needing = sortQueue(input.incomes).filter((i) => first.get(i.id)?.kind === "needs");
  const choices: Record<string, Choice> = {};
  for (const i of needing) choices[i.id] = { pick: "plan", oneBucketId: null };
  const previews = needing.length ? computePreviews(data, choices) : first;
  let total = 0;
  for (const inc of input.incomes) {
    const p = previews.get(inc.id);
    if (!p || p.kind !== "ready") continue;
    total += inc.amountMinor;
    for (const l of p.lines) add.set(l.bucketId, (add.get(l.bucketId) ?? 0) + l.amount);
  }
  const asPlan = needing.filter((i) => previews.get(i.id)?.kind === "ready").map((i) => input.sources.find((s) => s.id === i.sourceId)?.name ?? "Unknown source");
  return { add, asPlan, totalMinor: total };
}

const toMiBucket = (b: TodayBucket) => ({
  id: b.id,
  name: b.name,
  shortName: b.shortName,
  groupKey: b.groupKey,
  hue: b.hue,
  keptInAccountId: b.keptInAccountId,
  planless: b.planless,
  displayOrder: b.displayOrder,
  isArchived: b.isArchived,
});

/** What today's confirms put in each bucket (by local date). Basis for "before" values in the grow animation. */
function allocatedToday(input: TodayInput): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of input.allocations) {
    if (isoDateIn(a.confirmedAt, input.timeZone) !== input.todayIso) continue;
    m.set(a.bucketId, (m.get(a.bucketId) ?? 0) + a.amountMinor);
  }
  return m;
}

export function buildShelf(input: TodayInput): ShelfView | null {
  const on = input.buckets.filter((b) => bucketOnShelf(b, flowOf(input.flows, b.id), input.plan, input.sources));
  if (on.length === 0) return null;
  const { add, asPlan, totalMinor: previewTotal } = previewWaiting(input);

  let maxV = 0;
  for (const b of on) {
    const l = flowOf(input.flows, b.id).left;
    maxV = Math.max(maxV, l, l + (add.get(b.id) ?? 0));
  }
  const scale = shelfScale(maxV);
  const rent = input.plan.rentRedirect;
  const todayAlloc = allocatedToday(input);

  const slotOf = (b: TodayBucket): ShelfSlot => {
    const l = flowOf(input.flows, b.id).left;
    const addMinor = add.get(b.id) ?? 0;
    const grow = Math.max(0, l + addMinor) - Math.max(0, l);
    const ribbonBp = l > 0 ? floorDiv(l * 10_000, scale) : 0;
    const pendingBp = grow > 0 ? floorDiv(grow * 10_000, scale) : 0;
    const needs = bucketNeeds(l);
    let tag: ShelfTag | null = null;
    if (needs > 0) tag = { kind: "needs", text: `Needs ${formatPeso(needs)}` };
    else if (rent && b.id === rent.rentBucketId && l === 0 && input.todayIso < rent.startDate) {
      tag = { kind: "starts", text: `Starts ${monthYear(rent.startDate)}. Until then it goes to ${input.buckets.find((x) => x.id === input.plan.emergencyBucketId)?.name ?? "Emergency"}.` };
    } else if (b.planless && l === 0) tag = { kind: "planless", text: `${b.name} money lands here, kept whole.` };
    const keptIn = b.keptInAccountId ? (input.accountNames[b.keptInAccountId] ?? null) : null;
    return {
      id: b.id,
      name: b.name,
      shortName: shortName(b),
      hue: b.hue,
      keptIn,
      leftMinor: l,
      prevLeftMinor: Math.min(l, l - (todayAlloc.get(b.id) ?? 0)),
      needsMinor: needs,
      ribbonBp,
      tiny: ribbonBp > 0 && ribbonBp < 600,
      pendingAddMinor: addMinor > 0 && grow > 0 ? addMinor : 0,
      pendingBp,
      pendingLabelInside: pendingBp >= 1500,
      tag,
      ariaLabel: `${b.name}: ${needs > 0 ? `needs ${formatPeso(needs)}` : `${formatPeso(l)} left`}${keptIn ? `, kept in ${keptIn}` : ""}`,
    };
  };

  const groups: ShelfGroup[] = [];
  for (const g of GROUPS) {
    const members = on
      .filter((b) => (b.groupKey === "spend" || b.groupKey === "save" ? b.groupKey : "set_aside") === g.key)
      .sort((a, b) => a.displayOrder - b.displayOrder || (a.id < b.id ? -1 : 1));
    if (members.length === 0) continue;
    groups.push({ key: g.key, title: g.title, hint: g.key === "set_aside" ? setAsideHint(members) || g.hint : g.hint, slots: members.map(slotOf) });
  }

  const planName = `Plan ${input.activePlan}`;
  return {
    groups,
    scaleMinor: scale,
    totalMinor: on.reduce((t, b) => t + flowOf(input.flows, b.id).left, 0),
    preview: input.incomes.length
      ? { totalMinor: previewTotal, note: asPlan.length ? `${joinNames(asPlan)} shown as ${planName}` : null }
      : null,
  };
}

// ---------------------------------------------------------------- safe to spend (BR §4.4)

export interface StripDay {
  label: string;
  pay: boolean;
}

export interface SafeView {
  safeMinor: number;
  /** Safe to spend before today's confirms (the grow animation's start). */
  prevSafeMinor: number;
  /** "Living and Fun money, until your next payday." */
  caption: string;
  daysUntilPayday: number | null;
  /** Never below 0 (BR §4.4). Null when the payday date is unknown. */
  perDayMinor: number | null;
  /** "About ₱34 a day for 10 days": whole-peso floor (P-2). */
  perDayText: string | null;
  strip: StripDay[];
  paydayLabel: string | null;
  putAwayMinor: number;
  /** "October". */
  month: string;
  /** Null when no Tax bucket is on show. */
  taxMinor: number | null;
}

export function buildSafe(input: TodayInput): SafeView | null {
  const spend = input.buckets.filter((b) => b.groupKey === "spend");
  const shown = spend.filter((b) => bucketOnShelf(b, flowOf(input.flows, b.id), input.plan, input.sources));
  if (spend.length === 0) return null;
  const safe = safeToSpend(spend.map((b) => flowOf(input.flows, b.id).left));
  const todayAlloc = allocatedToday(input);
  const prevSafe = safeToSpend(spend.map((b) => Math.min(flowOf(input.flows, b.id).left, flowOf(input.flows, b.id).left - (todayAlloc.get(b.id) ?? 0))));
  const days = daysUntilPayday(input.todayIso, input.profile.nextPaydayDate);

  let perDayMinor: number | null = null;
  let perDayText: string | null = null;
  let strip: StripDay[] = [];
  if (days !== null) {
    perDayMinor = perDay(safe, days);
    perDayText = days === 0 ? `About ${formatPesoWhole(perDayMinor)} for today` : `About ${formatPesoWhole(perDayMinor)} a day for ${days} day${days === 1 ? "" : "s"}`;
    const n = Math.min(Math.max(days, 1), 31);
    strip = Array.from({ length: n }, (_, i) => ({ label: i === n - 1 ? "Pay" : (WEEKDAY_LETTERS[weekdayOf(addDays(input.todayIso, i + 1))] ?? ""), pay: i === n - 1 }));
  }

  const month = input.todayIso.slice(0, 7);
  const inMonth = (a: TodayAllocation) => isoDateIn(a.occurredAt, input.timeZone).slice(0, 7) === month;
  const groupOf = new Map(input.buckets.map((b) => [b.id, b.groupKey]));
  const putAway = input.allocations.filter((a) => inMonth(a) && groupOf.get(a.bucketId) === "save").reduce((t, a) => t + a.amountMinor, 0);
  const tax = input.buckets.find((b) => b.hue === "tax" && bucketOnShelf(b, flowOf(input.flows, b.id), input.plan, input.sources));
  const taxMinor = tax ? input.allocations.filter((a) => inMonth(a) && a.bucketId === tax.id).reduce((t, a) => t + a.amountMinor, 0) : null;

  // "Fun money" reads "Fun and Living money", so the trailing word is dropped from each name.
  const names = joinNames((shown.length ? shown : spend).map((b) => shortName(b).replace(/ money$/i, "")));
  return {
    safeMinor: safe,
    prevSafeMinor: prevSafe,
    caption: `${names} money${days === null ? "." : ", until your next payday."}`,
    daysUntilPayday: days,
    perDayMinor,
    perDayText,
    strip,
    paydayLabel: days !== null && input.profile.nextPaydayDate ? `Payday ${shortDate(input.profile.nextPaydayDate)}` : null,
    putAwayMinor: putAway,
    month: MONTHS_LONG[monthIndex(input.todayIso)] ?? "",
    taxMinor,
  };
}

// ---------------------------------------------------------------- week loop and next step (BR §8, §12.6)

export interface WeekView {
  title: "This week" | "Getting started";
  doneCount: number;
  total: number;
  steps: { id: StepId; label: string; done: boolean }[];
}

export type NextKind = "assign" | "move" | "living" | "review" | "pay" | "log" | "make_plan" | "done";

export interface NextView {
  kind: NextKind;
  heading: string;
  body: string;
  /** The one primary action, when it is a link. */
  cta: { label: string; href: string } | null;
  /** Source chips for `assign`: every waiting income, with whether it still needs a job. */
  chips: { id: string; name: string; amountMinor: number; needsJob: boolean }[];
  /** `living`: the cover on offer. */
  cover: CoverInfo | null;
  hint: string | null;
}

export interface CoverInfo {
  toBucketId: string;
  toName: string;
  fromName: string;
  needsMinor: number;
  /** min(deficit, left(Buffer)): what one tap moves. */
  coverMinor: number;
  stillNeededMinor: number;
  bufferLeftMinor: number;
}

/** The cover on offer for an overspent bucket, or null (not overspent, or no Buffer bucket to cover from). */
export function coverOffer(input: Pick<TodayInput, "buckets" | "flows">, bucketId: string): CoverInfo | null {
  const buffer = input.buckets.find((b) => b.hue === "buffer" && !b.isArchived);
  const to = input.buckets.find((b) => b.id === bucketId);
  if (!buffer || !to || to.id === buffer.id) return null;
  const left = flowOf(input.flows, to.id).left;
  if (left >= 0) return null;
  const bufferLeft = flowOf(input.flows, buffer.id).left;
  const { cover, stillNeeded } = coverFromBuffer(left, bufferLeft);
  return { toBucketId: to.id, toName: to.name, fromName: buffer.name, needsMinor: -left, coverMinor: cover, stillNeededMinor: stillNeeded, bufferLeftMinor: bufferLeft };
}

/** What the person is told after pressing Cover (the action's result in words). */
export function coverMessage(c: { toName: string; fromName: string }, r: { coveredMinor: number; stillNeedsMinor: number }): { tone: "good" | "warm"; text: string } {
  if (r.coveredMinor > 0 && r.stillNeedsMinor === 0) return { tone: "good", text: `Covered. ${c.fromName} topped up ${c.toName} by ${formatPeso(r.coveredMinor)}.` };
  if (r.coveredMinor > 0) return { tone: "warm", text: `Covered ${formatPeso(r.coveredMinor)} from ${c.fromName}. ${c.toName} still needs ${formatPeso(r.stillNeedsMinor)}, so ${c.fromName} couldn't cover it all.` };
  if (r.stillNeedsMinor > 0) return { tone: "warm", text: `${c.fromName} has nothing left to cover with. ${c.toName} still needs ${formatPeso(r.stillNeedsMinor)}.` };
  return { tone: "good", text: `${c.toName} isn't below zero any more.` };
}

function loopPhase(input: TodayInput): LoopPhase {
  const starting = input.profile.onboardedAt !== null && !input.anyWeekClosed;
  if (!starting) return "regular";
  return input.profile.planMode === "track" ? "starting_track" : "starting_plan";
}

function workPaydayFacts(input: TodayInput): { thisWeek: boolean; last: { entryId: string; occurredAt: number } | null } {
  const salary = new Set(input.sources.filter((s) => s.kind === "salary").map((s) => s.id));
  const weekStart = input.week.startIso;
  const weekEnd = input.week.endIso;
  const inWeek = (ms: number) => {
    const d = isoDateIn(ms, input.timeZone);
    return d >= weekStart && d < weekEnd;
  };
  let thisWeek = false;
  let last: { entryId: string; occurredAt: number } | null = null;
  for (const a of input.allocations) {
    if (!a.sourceId || !salary.has(a.sourceId)) continue;
    if (inWeek(a.occurredAt) || inWeek(a.confirmedAt)) thisWeek = true;
    if (!last || a.occurredAt > last.occurredAt) last = { entryId: a.entryId, occurredAt: a.occurredAt };
  }
  return { thisWeek, last };
}

const pendingTransfers = (rows: readonly MiTransferRow[]) => rows.filter((r) => r.kind === "transfer" && !r.done);

export function buildWeekAndNext(input: TodayInput): { week: WeekView; next: NextView } {
  const phase = loopPhase(input);
  const waiting = input.incomes.length;
  const pending = pendingTransfers(input.transferPlan);
  const living = input.buckets.find((b) => b.hue === "living");
  const livingLeft = living ? flowOf(input.flows, living.id).left : 0;
  const confirmedCount = new Set(input.allocations.map((a) => a.entryId)).size;
  const steps = weekLoopSteps({
    phase,
    waitingCount: waiting,
    confirmedCount,
    hasConfirmedWorkPaydayThisWeek: workPaydayFacts(input).thisWeek,
    pendingTransfers: pending.length,
    livingLeft,
    weekClosed: phase === "regular" ? input.weekClosed : false,
    anyAllocation: confirmedCount > 0,
    anyPayRecorded: confirmedCount > 0 || waiting > 0,
    hasPlan: input.profile.planMode !== "track" || input.plan.planA.some((l) => l.bp > 0 && l.bucketId !== living?.id),
    spendingLoggedAfterOnboarding: input.spendingLoggedAfterOnboarding,
  });
  const week: WeekView = {
    title: phase === "regular" ? "This week" : "Getting started",
    doneCount: steps.filter((s) => s.done).length,
    total: steps.length,
    steps: steps.map((s) => ({ id: s.id, label: s.label, done: s.done })),
  };

  // Next step: waiting income first, then the first unfinished step. In the regular loop the first step
  // ("Last payday split") is the endowed one and never drives the card; "Transfers made" with nothing to send
  // means nothing has ever been confirmed, so the honest next move is to add income.
  const actionable = phase === "regular" ? steps.filter((s) => s.id !== "payday") : steps;
  let id: StepId | null = nextStep(actionable, waiting);
  if (id === "move" && pending.length === 0) id = "pay";
  if (id === "living" && !living) id = null;

  return { week, next: buildNext(input, id, phase, pending, living ?? null) };
}

function buildNext(input: TodayInput, id: StepId | null, phase: LoopPhase, pending: readonly MiTransferRow[], living: TodayBucket | null): NextView {
  const base: NextView = { kind: "done", heading: "", body: "", cta: null, chips: [], cover: null, hint: null };
  const starting = phase !== "regular";
  const weekLabel = weekRangeLabel(input.week.startIso, input.week.endIso);
  const nextWeekDay = WEEKDAYS_LONG[weekdayOf(input.week.endIso)] ?? "Monday";

  if (id === null) {
    const review = nextReviewIso(input.week.endIso, input.profile.reviewDay);
    const payday = input.profile.nextPaydayDate && isValidIsoDate(input.profile.nextPaydayDate) && input.profile.nextPaydayDate >= input.todayIso ? input.profile.nextPaydayDate : null;
    return {
      ...base,
      kind: "done",
      heading: "Every peso has a job this week.",
      body: `Next review is ${longDayLabel(review)}.${payday ? ` Your next payday is ${shortDate(payday)}.` : ""}`,
    };
  }

  switch (id) {
    case "assign": {
      const queue = sortQueue(input.incomes);
      const previews = computePreviews({ incomes: input.incomes, sources: input.sources, buckets: input.buckets.map(toMiBucket), plan: input.plan }, {});
      const chips = queue.map((i) => ({
        id: i.id,
        name: input.sources.find((s) => s.id === i.sourceId)?.name ?? "Unknown source",
        amountMinor: i.amountMinor,
        needsJob: previews.get(i.id)?.kind !== "ready",
      }));
      const n = chips.length;
      const needs = chips.filter((c) => c.needsJob).map((c) => c.name);
      const readyN = n - needs.length;
      const total = queue.reduce((t, i) => t + i.amountMinor, 0);
      const body =
        needs.length === 0
          ? "Each source already has a rule, so this takes about a minute: check, confirm, done."
          : `${readyN ? `${readyN} already know${readyN === 1 ? "s" : ""} their job. ` : ""}${joinNames(needs)} need${needs.length === 1 ? "s" : ""} you to pick one.`;
      return {
        ...base,
        kind: "assign",
        heading: n === 1 ? `${formatPeso(total)} from ${chips[0]?.name} is waiting` : `${formatPesoWhole(total)} from ${n} incomes is waiting for a job`,
        body,
        chips,
        cta: { label: `Give ${n === 1 ? "it" : "them"} a job`, href: "/money-in" },
        hint: "The dashed outlines below show where it goes.",
      };
    }
    case "move": {
      const amount = pending.reduce((t, r) => t + r.sendMore, 0);
      const accounts = new Set(pending.map((r) => r.toAccountId)).size;
      return {
        ...base,
        kind: "move",
        heading: `Send ${formatPeso(amount)} to ${accounts} account${accounts === 1 ? "" : "s"}`,
        body: "Tick each one after you send it in your banking app, so your accounts match your buckets.",
        cta: { label: "Make transfers", href: "/money-in" },
      };
    }
    case "living": {
      const cover = living ? coverOffer(input, living.id) : null;
      const name = living?.name ?? "Living";
      const needsMinor = living ? bucketNeeds(flowOf(input.flows, living.id).left) : 0;
      let body: string;
      if (!cover) body = "There's no Buffer to cover it from. See what happened, and cover it from another bucket.";
      else if (cover.stillNeededMinor === 0) body = `Cover it from ${cover.fromName} and ${name} is back to zero. ${cover.fromName} keeps ${formatPeso(cover.bufferLeftMinor - cover.coverMinor)}.`;
      else if (cover.coverMinor === 0) body = `${cover.fromName} has nothing left to cover with, so ${name} stays below zero until money comes in.`;
      else body = `${cover.fromName} can cover ${formatPeso(cover.coverMinor)} of it. ${formatPeso(cover.stillNeededMinor)} would still be needed.`;
      return { ...base, kind: "living", heading: `${name} needs ${formatPeso(needsMinor)}`, body, cover: cover && cover.coverMinor > 0 ? cover : null };
    }
    case "review":
      return {
        ...base,
        kind: "review",
        heading: starting ? "Close your first week" : "Close the week",
        body: starting
          ? `${WEEKDAYS_LONG[input.profile.reviewDay]} is review day: look back at ${weekLabel}, fix one thing, then start ${nextWeekDay} fresh.`
          : `Look back at ${weekLabel}, then start ${nextWeekDay} fresh.`,
        cta: { label: "Start review", href: "/review" },
        hint: "About 5 minutes.",
      };
    case "make_plan":
      return {
        ...base,
        kind: "make_plan",
        heading: "Give your money more jobs",
        body: "Right now everything you get goes to Spending. A plan splits each payday so saving happens first, not with what's left.",
        // Not a link: the card's button is a server action that reopens onboarding at Priorities (SPEC §7.6).
        cta: null,
        hint: "Applies to your next paydays. Money already in stays as it is.",
      };
    case "log":
      return {
        ...base,
        kind: "log",
        heading: "Log your first spending",
        body: "Every peso you log comes out of a bucket, so safe to spend stays true. It takes about five seconds.",
      };
    case "pay":
    case "payday":
    default: {
      const payday = input.profile.nextPaydayDate && isValidIsoDate(input.profile.nextPaydayDate) && input.profile.nextPaydayDate >= input.todayIso ? input.profile.nextPaydayDate : null;
      return {
        ...base,
        kind: "pay",
        heading: "Add your pay when it lands",
        body: `${payday ? `Your next payday is ${longDayLabel(payday)}. ` : ""}Add it here and Salin splits it by your plan. You check, confirm, done.`,
        cta: { label: "+ Add income", href: "/money-in?add=1" },
      };
    }
  }
}

/** The first date on or after `fromIso` (a week's start) that falls on `reviewDay` (0 = Sunday). */
export function nextReviewIso(fromIso: string, reviewDay: number): string {
  const delta = (reviewDay - weekdayOf(fromIso) + 7) % 7;
  return addDays(fromIso, delta);
}

// ---------------------------------------------------------------- goals (BR §7)

export interface GoalCardView {
  id: string;
  name: string;
  main: boolean;
  savedMinor: number;
  targetMinor: number;
  progressBp: number;
  /** Floored whole percent, as shown. */
  percent: number;
  /** Progress before today's confirms, so the grow animation has a starting point. */
  prevProgressBp: number;
  toGoMinor: number;
  reached: boolean;
  /** The sentence after "₱X to go.", or the whole line when reached. */
  tail: string;
  /** 25 / 50 / 75 ticks already hit. */
  hitTicks: (25 | 50 | 75)[];
  /** The highest milestone crossed by today's confirms; the "Passed 25% today" chip. */
  passedToday: Milestone | null;
}

export interface GoalsView {
  cards: GoalCardView[];
  /** Names of goals beyond the first three. */
  moreNames: string[];
}

export function buildGoalsView(input: TodayInput): GoalsView {
  const flows = new Map<string, { allocated: number; left: number }>(Object.entries(input.flows).map(([id, f]) => [id, { allocated: f.allocated, left: f.left }]));
  const todayAllocByBucket = new Map<string, number>();
  for (const a of input.allocations) {
    if (isoDateIn(a.confirmedAt, input.timeZone) !== input.todayIso) continue;
    todayAllocByBucket.set(a.bucketId, (todayAllocByBucket.get(a.bucketId) ?? 0) + a.amountMinor);
  }
  const before = new Map<string, { allocated: number; left: number }>();
  for (const [id, f] of flows) {
    const t = todayAllocByBucket.get(id) ?? 0;
    before.set(id, { allocated: f.allocated - t, left: f.left - t });
  }

  const ordered = [...input.goals].sort((a, b) => Number(b.isPlanSwitch) - Number(a.isPlanSwitch));
  const built = buildGoals({ goals: ordered, buckets: input.buckets.map((b) => ({ id: b.id, name: b.name })), flows });
  const last = workPaydayFacts(input).last;

  const cards = built.slice(0, 3).map((g): GoalCardView => {
    const row = ordered.find((x) => x.id === g.id) as TodayGoalRow;
    const prevSaved = goalSaved(row, row.linkedBucketId ? (before.get(row.linkedBucketId) ?? null) : null);
    const crossed = g.targetMinor > 0 ? milestonesCrossed(prevSaved, g.savedMinor, g.targetMinor) : [];
    const prevBp = g.targetMinor > 0 ? Math.min(10_000, floorDiv(Math.max(0, prevSaved) * 10_000, g.targetMinor)) : 0;
    const toGo = Math.max(0, g.targetMinor - g.savedMinor);
    const reached = g.targetMinor > 0 && g.savedMinor >= g.targetMinor;
    const main = g.isPlanSwitch;

    let tail = "";
    if (reached) tail = `Target reached.${main && input.activePlan === "B" ? " Plan B is active." : ""}`;
    else if (main) {
      const bucket = g.linkedBucketId ?? input.plan.emergencyBucketId;
      const share = last && bucket ? input.allocations.filter((a) => a.entryId === last.entryId && a.bucketId === bucket).reduce((t, a) => t + a.amountMinor, 0) : null;
      const n = paydaysToGo(g.savedMinor, g.targetMinor, share);
      if (n !== null && last) tail = `About ${n} more payday${n === 1 ? "" : "s"} like ${shortDate(isoDateIn(last.occurredAt, input.timeZone))}${input.plan.switchOn && input.activePlan === "A" ? ", then Plan B starts" : ""}.`;
    } else tail = g.feed;

    return {
      id: g.id,
      name: g.name,
      main,
      savedMinor: g.savedMinor,
      targetMinor: g.targetMinor,
      progressBp: g.progressBp,
      percent: floorDiv(g.progressBp, 100),
      prevProgressBp: prevBp,
      toGoMinor: toGo,
      reached,
      tail,
      hitTicks: ([25, 50, 75] as const).filter((m) => g.progressBp >= m * 100),
      passedToday: crossed.length ? (crossed[crossed.length - 1] as Milestone) : null,
    };
  });
  return { cards, moreNames: ordered.slice(3).map((g) => g.name) };
}

// ---------------------------------------------------------------- drawer (SPEC §1)

export interface DrawerLine {
  kind: "in" | "out" | "cover_in" | "cover_out" | "before";
  label: string;
  /** Signed: + in, − out. */
  amountMinor: number;
}

export interface DrawerView {
  bucketId: string;
  name: string;
  hue: string | null;
  keptIn: string | null;
  leftMinor: number;
  needsMinor: number;
  note: string | null;
  /** "20% of each payday on Plan A, 10% on Plan B." / "Not part of the payday split." + the rent line. */
  planText: string;
  monthName: string;
  lines: DrawerLine[];
  cover: CoverInfo | null;
}

export function buildDrawers(input: TodayInput): Record<string, DrawerView> {
  const month = input.todayIso.slice(0, 7);
  const monthName = MONTHS_LONG[monthIndex(input.todayIso)] ?? "";
  const nameOf = new Map(input.buckets.map((b) => [b.id, b.name]));
  const sourceName = new Map(input.sources.map((s) => [s.id, s.name]));
  const out: Record<string, DrawerView> = {};

  for (const b of input.buckets) {
    const f = flowOf(input.flows, b.id);
    const dated: { dateIso: string; line: DrawerLine }[] = [];
    for (const a of input.allocations) {
      if (a.bucketId !== b.id || a.amountMinor === 0) continue;
      const dateIso = isoDateIn(a.occurredAt, input.timeZone);
      if (dateIso.slice(0, 7) !== month) continue;
      dated.push({ dateIso, line: { kind: "in", label: `${shortDate(dateIso)} ${(a.sourceId && sourceName.get(a.sourceId)) || "Payday"}`, amountMinor: a.amountMinor } });
    }
    for (const s of input.spendingThisMonth) {
      if (s.bucketId === b.id) dated.push({ dateIso: s.dateIso, line: { kind: s.amountMinor < 0 ? "in" : "out", label: `${shortDate(s.dateIso)} ${s.label}`, amountMinor: -s.amountMinor } });
    }
    for (const c of input.coversThisMonth) {
      if (c.toBucketId === b.id) dated.push({ dateIso: c.dateIso, line: { kind: "cover_in", label: `${shortDate(c.dateIso)} From ${nameOf.get(c.fromBucketId) ?? "another bucket"}`, amountMinor: c.amountMinor } });
      if (c.fromBucketId === b.id) dated.push({ dateIso: c.dateIso, line: { kind: "cover_out", label: `${shortDate(c.dateIso)} To ${nameOf.get(c.toBucketId) ?? "another bucket"}`, amountMinor: -c.amountMinor } });
    }
    dated.sort((x, y) => (x.dateIso < y.dateIso ? -1 : x.dateIso > y.dateIso ? 1 : 0));
    const lines = dated.map((d) => d.line);
    // The month's lines don't always add up to Left (earlier months count too), so say so: the slip must reconcile.
    const before = f.left - lines.reduce((t, l) => t + l.amountMinor, 0);
    if (before !== 0) lines.unshift({ kind: "before", label: `Before ${monthName}`, amountMinor: before });

    const bp = (ls: PlanContext["planA"]) => ls.find((l) => l.bucketId === b.id)?.bp ?? 0;
    let planText: string;
    if (b.planless) planText = "Not part of the payday split.";
    else {
      planText = `${pctText(bp(input.plan.planA))} of each payday on Plan A${input.plan.switchOn ? `, ${pctText(bp(input.plan.planB))} on Plan B` : ""}.`;
      const r = input.plan.rentRedirect;
      if (r && b.id === r.rentBucketId) {
        const em = nameOf.get(input.plan.emergencyBucketId ?? "") ?? "Emergency fund";
        planText += ` Until ${monthYear(r.startDate)} this share goes to ${/fund$/i.test(em) ? `the ${em}` : em}.`;
      }
    }

    out[b.id] = {
      bucketId: b.id,
      name: b.name,
      hue: b.hue,
      keptIn: b.keptInAccountId ? (input.accountNames[b.keptInAccountId] ?? null) : null,
      leftMinor: f.left,
      needsMinor: bucketNeeds(f.left),
      note: b.note?.trim() || null,
      planText,
      monthName,
      lines,
      cover: coverOffer(input, b.id),
    };
  }
  return out;
}

// ---------------------------------------------------------------- the whole page

export interface TodayView {
  daysUntilPayday: number | null;
  daysText: string | null;
  syncOff: boolean;
  safe: SafeView | null;
  week: WeekView;
  next: NextView;
  shelf: ShelfView | null;
  goals: GoalsView;
  drawers: Record<string, DrawerView>;
  /** The Living bucket's id, for "See what happened". */
  livingBucketId: string | null;
}

export function buildTodayView(input: TodayInput): TodayView {
  const days = daysUntilPayday(input.todayIso, input.profile.nextPaydayDate);
  const { week, next } = buildWeekAndNext(input);
  return {
    daysUntilPayday: days,
    daysText: daysUntilText(days),
    syncOff: input.syncOff,
    safe: buildSafe(input),
    week,
    next,
    shelf: buildShelf(input),
    goals: buildGoalsView(input),
    drawers: buildDrawers(input),
    livingBucketId: input.buckets.find((b) => b.hue === "living")?.id ?? null,
  };
}
