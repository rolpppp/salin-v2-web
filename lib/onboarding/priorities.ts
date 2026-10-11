import { justTrackPlan } from "@/lib/money/suggest";
import type { OnboardingDraft } from "./draft";
import type { StepContext, StepError } from "./step";

/** Pure logic for the "Priorities" step (SPEC §7.3 step 3, §7.4 step 3, §7.6, BR §12.7). */

export const DEFAULT_BILLS_START = "2027-01-01";

export const PRIORITY_OPTIONS = [
  { value: "safety", title: "Build a safety net", help: "Money for emergencies, so a surprise bill isn't a crisis." },
  { value: "goal", title: "Save for something", help: "A laptop, a trip, tuition. Name it and watch it fill." },
  { value: "grow", title: "Grow it for later", help: "Invest a steady share of every payday." },
  { value: "control", title: "Keep spending in check", help: "Know what's safe to spend each day, and stick to it." },
] as const;

export const BILL_KIND_OPTIONS = [
  { value: "rent", label: "Rent" },
  { value: "tuition", label: "Tuition" },
  { value: "utilities", label: "Utilities" },
  { value: "internet", label: "Internet" },
  { value: "loan", label: "Loan" },
] as const;

/** Field ids the shell focuses on error. */
export const PRIO_FIELDS = {
  priority: "prio-safety", // the first radio
  goalName: "prio-goal-name",
  goalCost: "prio-goal-cost",
  bills: "prio-bills",
  billsStart: "prio-bills-start",
} as const;

export function validatePriorities(draft: OnboardingDraft, ctx: StepContext): StepError | null {
  if (draft.skipped) return null;
  if (!draft.priority) return { field: PRIO_FIELDS.priority, message: "Pick what you want your money to do first." };
  if (draft.priority === "goal") {
    if (!draft.goal || draft.goal.name.trim() === "") return { field: PRIO_FIELDS.goalName, message: "Name the thing you're saving for." };
    if (!(draft.goal.costMinor > 0)) return { field: PRIO_FIELDS.goalCost, message: "Add how much it costs, so you can see it fill." };
  }
  if (draft.billsMinor > 0 && draft.billsStart !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.billsStart)) return { field: PRIO_FIELDS.billsStart, message: "Pick the date your bills start." };
    if (draft.billsStart <= ctx.todayIso) return { field: PRIO_FIELDS.billsStart, message: "Pick a start date after today, or turn off \"These start later\"." };
  }
  return null;
}

/**
 * App path, first entry: prefill fixed bills from the phone's recurring outflows (and their future start date).
 * "First entry" = nothing typed yet (no bills, no kinds, no start date); once the user has anything there it is theirs.
 */
export function prioritiesOnEnter(draft: OnboardingDraft, ctx: StepContext): Partial<OnboardingDraft> | null {
  const pb = ctx.phoneBills;
  if (ctx.path !== "app" || !pb || pb.totalMinor <= 0) return null;
  if (draft.billsMinor > 0 || draft.billKinds.length > 0 || draft.billsStart !== null) return null;
  return { billsMinor: pb.totalMinor, billsStart: pb.startsOn };
}

/** Quiet "Skip the plan, just track for now": a one-bucket Spending plan, Plan B off, every bucket kept where pay lands (BR §12.7). */
export function skipPatch(draft: OnboardingDraft): Partial<OnboardingDraft> {
  const landing = draft.landingAccountId;
  const jt = landing ? justTrackPlan(landing) : null;
  return {
    skipped: true,
    priority: null,
    goal: null,
    planA: jt ? jt.plan : { living: 100, rent: 0, fun: 0, emergency: 0, invest: 0, sinking: 0, tax: 0, buffer: 0 },
    planEdited: false,
    planInputsSig: null,
    planBOn: false,
    targetMinor: null,
    homes: jt ? { ...jt.homes, scholarship: landing as string } : null,
    homesUserSet: [],
  };
}

/** Picking a priority again undoes the skip. The stale just-track plan is dropped so the plan step suggests afresh. */
export function pickPriorityPatch(draft: OnboardingDraft, priority: NonNullable<OnboardingDraft["priority"]>): Partial<OnboardingDraft> {
  // A goal only belongs to "Save for something"; clearing it keeps a stale goal out of Finish.
  const patch: Partial<OnboardingDraft> = priority === "goal" ? { priority } : { priority, goal: null };
  if (draft.skipped) Object.assign(patch, { skipped: false, planA: null, planEdited: false, planInputsSig: null, homes: null, homesUserSet: [] });
  return patch;
}

export function setBillsPatch(draft: OnboardingDraft, billsMinor: number): Partial<OnboardingDraft> {
  const patch: Partial<OnboardingDraft> = { billsMinor };
  if (billsMinor <= 0) patch.billsStart = null;
  return patch;
}

/** "These start later" toggle. Turning it off clears the date; on defaults to 2027-01-01 (or the phone's date). */
export function setBillsLaterPatch(ctx: StepContext, later: boolean): Partial<OnboardingDraft> {
  if (!later) return { billsStart: null };
  const phone = ctx.path === "app" ? ctx.phoneBills?.startsOn : null;
  return { billsStart: phone && phone > ctx.todayIso ? phone : DEFAULT_BILLS_START };
}

export function toggleBillKind(draft: OnboardingDraft, kind: OnboardingDraft["billKinds"][number]): Partial<OnboardingDraft> {
  const has = draft.billKinds.includes(kind);
  return { billKinds: has ? draft.billKinds.filter((k) => k !== kind) : BILL_KIND_OPTIONS.map((o) => o.value).filter((k) => k === kind || draft.billKinds.includes(k)) };
}

export const PRIORITIES_QUESTION = "What should your money do first?";
export const PRIORITIES_REASON = "Pick one. Salin weights your plan toward it; everything else still gets a share.";
