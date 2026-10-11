import { bpShare } from "@/lib/money/core";
import { formatPesoWhole } from "@/lib/money/format";
import { splitByPlan } from "@/lib/money/split";
import type { SplitLine } from "@/lib/money/split";
import { PLAN_BUCKETS, justTrackPlan, planToLines, planTotal, safetyNetTarget, suggestPlan } from "@/lib/money/suggest";
import type { PlanBucket, PlanPercents, PlanPreset } from "@/lib/money/suggest";
import type { DraftBucket, OnboardingDraft } from "./draft";
import type { StepContext, StepError } from "./step";

/** Pure logic for the "Your plan" step (SPEC §7.3 step 4, BR §12.1, §12.2). */

export const PLAN_TOTAL_FIELD = "plan-total";
export const PLAN_TARGET_FIELD = "plan-target";

export const PRESETS: ReadonlyArray<{ value: PlanPreset; label: string }> = [
  { value: "suggested", label: "Suggested for you" },
  { value: "fifty_thirty_twenty", label: "50/30/20" },
  { value: "simple", label: "Simple" },
];
export const presetName = (p: PlanPreset): string => (p === "suggested" ? "Suggested for you" : p === "simple" ? "Simple" : "50/30/20");

export const PURPOSE: Record<PlanBucket, string> = {
  living: "Food, transport, load, laundry. Day-to-day needs.",
  rent: "Fixed bills, set aside first so they never surprise you.",
  fun: "Guilt-free spending: eating out, hobbies, treats.",
  emergency: "Only for real emergencies. Your safety net.",
  invest: "Long-term money you leave alone.",
  sinking: "Planned things: gadgets, gifts, school.",
  tax: "For freelance income: set aside for BIR, filed quarterly.",
  buffer: "Absorbs exchange-rate dips, fees and slow months.",
};

const BUCKET_NAME: Record<DraftBucket, string> = {
  living: "Living",
  rent: "Bills",
  fun: "Fun money",
  emergency: "Emergency fund",
  invest: "Investments",
  sinking: "Sinking funds",
  tax: "Tax set-aside",
  buffer: "Buffer",
  scholarship: "Scholarship",
};
const BILL_LABEL = { rent: "Rent", tuition: "Tuition", utilities: "Utilities", internet: "Internet", loan: "Loan" } as const;

/** Display name of a bucket: Bills is renamed to the one bill kind picked; Living reads "Spending" when just tracking. */
export function bucketName(draft: OnboardingDraft, key: DraftBucket): string {
  if (key === "rent") return draft.billKinds.length === 1 ? BILL_LABEL[draft.billKinds[0] as keyof typeof BILL_LABEL] : "Bills";
  if (key === "living") return draft.skipped ? "Spending" : "Living";
  return BUCKET_NAME[key];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** `2027-01-01` -> `Jan 1, 2027`. */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? "Jan"} ${d ?? 1}, ${y ?? 0}`;
}

const FREQ_TEXT = { monthly: "monthly", twice: "twice a month", biweekly: "every 2 weeks", weekly: "weekly", varies: "on no fixed schedule" } as const;
const PRIO_SHORT = { safety: "Safety net first", goal: "Saving for something", grow: "Growing it for later", control: "Spending in check" } as const;

// ---------------------------------------------------------------- inputs and fingerprint

function inputs(draft: OnboardingDraft, preset: PlanPreset = draft.preset) {
  return {
    amountMinor: draft.income.amountMinor ?? 0,
    frequency: draft.income.frequency ?? "monthly",
    billsMinor: draft.billsMinor,
    priority: draft.priority ?? "control",
    kind: draft.income.kind,
    paidInOtherCurrency: draft.income.paidInOtherCurrency,
    preset,
  } as const;
}

/** What the suggestion depends on. A change re-suggests (SPEC §7.3 step 4). */
export function planInputsSig(draft: OnboardingDraft): string {
  const i = inputs(draft);
  return JSON.stringify([i.preset, draft.priority, i.billsMinor, draft.billsStart !== null && i.billsMinor > 0, i.amountMinor, i.frequency, i.paidInOtherCurrency, i.kind]);
}

export function monthlyOf(draft: OnboardingDraft): number {
  return suggestPlan(inputs(draft)).monthlyMinor;
}

export interface Suggestion {
  plan: PlanPercents;
  targetMinor: number;
  planBOn: boolean;
  billsWarning: { coveredMinor: number; billsMinor: number } | null;
}

export function suggestionFor(draft: OnboardingDraft, preset: PlanPreset = draft.preset): Suggestion {
  const s = suggestPlan(inputs(draft, preset));
  return {
    plan: s.plan,
    targetMinor: safetyNetTarget(s.monthlyMinor, s.plan.living, s.plan.rent),
    planBOn: s.planB !== null,
    billsWarning: s.billsWarning,
  };
}

function planPatch(draft: OnboardingDraft, preset: PlanPreset): Partial<OnboardingDraft> {
  const s = suggestionFor(draft, preset);
  return { preset, planA: s.plan, planEdited: false, planInputsSig: planInputsSig({ ...draft, preset }), planBOn: s.planBOn, targetMinor: s.targetMinor };
}

// ---------------------------------------------------------------- enter / refresh / preset

export const ANSWERS_CHANGED = "Your answers changed, so the plan was suggested again.";

/**
 * What entering the step should do. Silent (`announce` null): copy the suggestion in (no plan yet, or the answers changed
 * and nothing was edited). Announced: the answers changed under the user's edits, so the plan is replaced and the user is told.
 */
export function planRefresh(draft: OnboardingDraft): { patch: Partial<OnboardingDraft>; announce: string | null } | null {
  if (draft.skipped) return null;
  if (draft.planA !== null && draft.planInputsSig === planInputsSig(draft)) return null;
  const replacing = draft.planA !== null && draft.planEdited;
  return { patch: planPatch(draft, draft.preset), announce: replacing ? ANSWERS_CHANGED : null };
}

/**
 * Shell hook. The silent case is applied here. The announced case is left to `Body` (its mount effect calls `planRefresh`
 * and `announce`), because `onEnter` has no way to announce.
 */
export function planOnEnter(draft: OnboardingDraft): Partial<OnboardingDraft> | null {
  const r = planRefresh(draft);
  return r && r.announce === null ? r.patch : null;
}

export function switchPreset(draft: OnboardingDraft, preset: PlanPreset): { patch: Partial<OnboardingDraft>; announce: string } {
  return { patch: planPatch(draft, preset), announce: `Switched to ${presetName(preset)}.${draft.planEdited ? " Your edits were replaced." : ""}` };
}

/** Set one bucket's whole percent (clamped 0-100). Marks the plan edited; keeps Plan B and the target coherent. */
export function setPercent(draft: OnboardingDraft, bucket: PlanBucket, raw: number): Partial<OnboardingDraft> | null {
  const prev = draft.planA;
  if (!prev || !Number.isFinite(raw)) return null;
  const pct = Math.min(100, Math.max(0, Math.trunc(raw)));
  if (pct === prev[bucket]) return null;
  const next: PlanPercents = { ...prev, [bucket]: pct };
  const m = monthlyOf(draft);
  const patch: Partial<OnboardingDraft> = { planA: next, planEdited: true };
  // The target follows Living + Bills until the user types their own.
  if (draft.targetMinor === null || draft.targetMinor === safetyNetTarget(m, prev.living, prev.rent)) patch.targetMinor = safetyNetTarget(m, next.living, next.rent);
  if (prev.emergency < 10 && next.emergency >= 10) patch.planBOn = true;
  if (next.emergency < 10) patch.planBOn = false;
  return patch;
}

/** Plan B is only offered when Emergency is at least 10% (BR §12.1.6). */
export const planBOffered = (planA: PlanPercents | null): boolean => planA !== null && planA.emergency >= 10;

// ---------------------------------------------------------------- amounts

/** Same split rule as the engine; falls back to plain rounding while the total isn't 100 (the engine refuses those). */
export function splitPlan(amountMinor: number, plan: PlanPercents, opts: { onDate: string; billsStart: string | null }): Record<PlanBucket, number> {
  const out = Object.fromEntries(PLAN_BUCKETS.map((k) => [k, 0])) as Record<PlanBucket, number>;
  if (amountMinor <= 0) return out;
  if (planTotal(plan) === 100) {
    const lines: SplitLine[] = splitByPlan(amountMinor, planToLines(plan), {
      onDate: opts.onDate,
      buckets: PLAN_BUCKETS,
      emergencyBucketId: "emergency",
      rentRedirect: opts.billsStart ? { rentBucketId: "rent", startDate: opts.billsStart } : null,
    });
    for (const l of lines) out[l.bucketId as PlanBucket] = l.amount;
    return out;
  }
  for (const k of PLAN_BUCKETS) out[k] = bpShare(amountMinor, plan[k] * 100);
  return out;
}

const billsStartApplies = (d: OnboardingDraft): string | null => (d.billsMinor > 0 ? d.billsStart : null);
const payDate = (d: OnboardingDraft, ctx: StepContext): string => d.income.nextPayday ?? ctx.todayIso;

/** ₱ per pay for the main pay, including the rent redirect when the next payday is before bills start. */
export function perPay(draft: OnboardingDraft, ctx: StepContext, plan: PlanPercents, amountMinor: number = draft.income.amountMinor ?? 0): Record<PlanBucket, number> {
  return splitPlan(amountMinor, plan, { onDate: payDate(draft, ctx), billsStart: billsStartApplies(draft) });
}

/** ≈ ₱ a month: the plan applied to monthly income, no redirect (the row says "to Emergency until ..." instead). */
export function perMonth(draft: OnboardingDraft, plan: PlanPercents): Record<PlanBucket, number> {
  return splitPlan(monthlyOf(draft), plan, { onDate: "9999-12-31", billsStart: null });
}

export interface PlanRow {
  key: PlanBucket;
  name: string;
  purpose: string;
  pct: number;
  perPayMinor: number;
  perMonthMinor: number;
  /** Bills row only, when bills start after the next payday: "to Emergency until Jan 1, 2027". */
  redirectUntil: string | null;
}

export function planRows(draft: OnboardingDraft, ctx: StepContext, plan: PlanPercents): PlanRow[] {
  const pay = perPay(draft, ctx, plan);
  const mo = perMonth(draft, plan);
  const start = billsStartApplies(draft);
  return PLAN_BUCKETS.map((key) => ({
    key,
    name: bucketName(draft, key),
    purpose: key === "sinking" && draft.priority === "goal" && draft.goal ? `Saving for ${draft.goal.name}, plus gadgets and gifts.` : PURPOSE[key],
    pct: plan[key],
    perPayMinor: pay[key],
    perMonthMinor: mo[key],
    redirectUntil: key === "rent" && start !== null && plan.rent > 0 && payDate(draft, ctx) < start ? formatIsoDate(start) : null,
  }));
}

export function totalStatus(plan: PlanPercents): { total: number; ok: boolean; text: string } {
  const total = planTotal(plan);
  if (total === 100) return { total, ok: true, text: "100% · Every peso of this pay has a job." };
  if (total > 100) return { total, ok: false, text: `${total}% · Take ${total - 100}% from a bucket.` };
  return { total, ok: false, text: `${total}% · ${100 - total}% still needs a job` };
}

export function planQuestion(draft: OnboardingDraft): string {
  const a = draft.income.amountMinor;
  return a ? `Here's a plan for your ${formatPesoWhole(a)} pay` : "Here's a plan for your pay";
}

export function planReason(draft: OnboardingDraft): string {
  const why = [
    draft.priority ? PRIO_SHORT[draft.priority] : "",
    draft.billsMinor > 0 ? `${formatPesoWhole(draft.billsMinor)} bills a month` : "",
    `paid ${FREQ_TEXT[draft.income.frequency ?? "monthly"]}`,
    draft.income.kind === "side_hustle" || draft.income.paidInOtherCurrency ? "6% set aside for tax" : "",
    draft.income.paidInOtherCurrency ? "a buffer for exchange rates" : "",
  ].filter(Boolean);
  return `Built from your answers: ${why.join(", ")}. Change any share; it's yours.`;
}

// ---------------------------------------------------------------- reality checks

export interface RealityCheck {
  key: string;
  bucket: PlanBucket;
  short: boolean;
  /** Visible lead word so colour is never the only signal. */
  lead: "Short" | "Room to spare";
  text: string;
}

export function realityChecks(draft: OnboardingDraft, ctx: StepContext, plan: PlanPercents): RealityCheck[] {
  const mo = perMonth(draft, plan);
  const out: RealityCheck[] = [];
  const bills = draft.billsMinor;
  if (bills > 0 && draft.billsStart === null && mo.rent < bills) {
    const name = bucketName(draft, "rent");
    out.push({
      key: "bills",
      bucket: "rent",
      short: true,
      lead: "Short",
      text:
        `Your bills are ${formatPesoWhole(bills)} a month, but ${name} gets about ${formatPesoWhole(mo.rent)}. ` +
        (bills > monthlyOf(draft) ? "They're more than your pay, so the plan can't cover them yet." : `Give ${name} a bigger share, or plan to pay the rest from Living.`),
    });
  }
  const spend = ctx.path === "app" ? ctx.lastMonthSpendMinor : null;
  if (spend) {
    for (const key of ["living", "fun"] as const) {
      const spent = spend[key];
      if (!spent || spent <= 0 || plan[key] <= 0) continue;
      const short = mo[key] < spent;
      out.push({
        key,
        bucket: key,
        short,
        lead: short ? "Short" : "Room to spare",
        text: `${bucketName(draft, key)} gets about ${formatPesoWhole(mo[key])} a month. Last month you spent ${formatPesoWhole(spent)} on its categories.${short ? " Consider a bigger share." : ""}`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- validate

export function validatePlan(draft: OnboardingDraft): StepError | null {
  if (draft.skipped) return null;
  const plan = draft.planA;
  if (!plan) return { field: PLAN_TOTAL_FIELD, message: "Your plan isn't ready yet. Go back one step and come forward again." };
  const total = planTotal(plan);
  if (total === 100) {
    if (planBOffered(plan) && draft.planBOn && (draft.targetMinor ?? 0) < 100_000) {
      return { field: PLAN_TARGET_FIELD, message: "Set the safety net target to at least ₱1,000, or turn off the Plan B switch." };
    }
    return null;
  }
  return {
    field: PLAN_TOTAL_FIELD,
    message: total > 100 ? `Your shares add up to ${total}%. Take ${total - 100}% from a bucket so they total 100%.` : `Your shares add up to ${total}%. Give the other ${100 - total}% a job so they total 100%.`,
  };
}

/** The plan in force: the just-track plan when skipped, else Plan A. */
export function effectivePlan(draft: OnboardingDraft): PlanPercents | null {
  return draft.skipped ? justTrackPlan(draft.landingAccountId ?? "").plan : draft.planA;
}
