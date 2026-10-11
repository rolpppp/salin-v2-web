import { shortDate } from "@/lib/data/money-in-model";
import { bpShare, formatPeso, justTrackPlan, PLAN_BUCKETS, planToLines, splitByPlan, transferCount, type HomeMap, type PlanBucket, type PlanPercents } from "@/lib/money";
import type { OnboardingDraft } from "./draft";
import { bucketLabel, FREQUENCY_SLIP, PRIORITY_SHORT, slipDate } from "./labels";
import type { StepContext } from "./step";

/** The plan slip as data (SPEC §7.2): one line per answer, then the split, then payday. `null` values print "· · ·". */
export interface SlipRowModel {
  key: string;
  label: string;
  value: string | null;
}
export interface SlipSplitLineModel {
  bucket: PlanBucket;
  label: string;
  pct: number;
  amountText: string;
}
export interface SlipModel {
  dateLine: string;
  rows: SlipRowModel[];
  /** Null until the plan exists (the slip shows one "Your split" placeholder). */
  split: { lines: SlipSplitLineModel[]; totalPct: number } | null;
  /** "2 transfers", "no transfers", or null before Where it lives. */
  payday: string | null;
  /** Extra footer sentence when bills start later. */
  billsNote: string | null;
}

function effectivePlan(draft: OnboardingDraft): PlanPercents | null {
  return draft.planA ?? (draft.skipped ? justTrackPlan(draft.landingAccountId ?? "").plan : null);
}

/** Shares in whole percent with the engine's remainder rule when the plan totals 100; plain rounded shares while it doesn't yet. */
function splitAmounts(plan: PlanPercents, amountMinor: number | null, todayIso: string): Record<PlanBucket, number> | null {
  if (!amountMinor || amountMinor <= 0) return null;
  const total = PLAN_BUCKETS.reduce((t, k) => t + plan[k], 0);
  if (total === 100) {
    const lines = splitByPlan(amountMinor, planToLines(plan), { onDate: todayIso, buckets: PLAN_BUCKETS, emergencyBucketId: "emergency" });
    return Object.fromEntries(lines.map((l) => [l.bucketId, l.amount])) as Record<PlanBucket, number>;
  }
  return Object.fromEntries(PLAN_BUCKETS.map((k) => [k, bpShare(amountMinor, plan[k] * 100)])) as Record<PlanBucket, number>;
}

export function buildSlip(draft: OnboardingDraft, ctx: Pick<StepContext, "todayIso">): SlipModel {
  const amount = draft.income.amountMinor && draft.income.amountMinor > 0 ? draft.income.amountMinor : null;
  const landing = draft.accounts.find((a) => a.id === draft.landingAccountId);
  const rows: SlipRowModel[] = [
    { key: "for", label: "For", value: draft.firstName?.trim() || null },
    { key: "in", label: "Comes in", value: amount ? formatPeso(amount) : null },
    { key: "freq", label: "How often", value: amount && draft.income.frequency ? FREQUENCY_SLIP[draft.income.frequency] : null },
    { key: "next", label: "Next payday", value: draft.income.nextPayday ? shortDate(draft.income.nextPayday) : null },
    { key: "accts", label: "Accounts", value: draft.accounts.length > 0 ? String(draft.accounts.length) : null },
    { key: "lands", label: "Lands in", value: landing?.name ?? null },
    { key: "first", label: "First", value: draft.skipped ? "Just tracking" : draft.priority ? PRIORITY_SHORT[draft.priority] : null },
  ];

  const plan = effectivePlan(draft);
  let split: SlipModel["split"] = null;
  if (plan) {
    const amounts = splitAmounts(plan, amount, ctx.todayIso);
    split = {
      lines: PLAN_BUCKETS.filter((k) => plan[k] > 0).map((k) => ({ bucket: k, label: bucketLabel(k, draft), pct: plan[k], amountText: amounts ? formatPeso(amounts[k]) : "· · ·" })),
      totalPct: PLAN_BUCKETS.reduce((t, k) => t + plan[k], 0),
    };
  }

  let payday: string | null = null;
  if (plan && draft.landingAccountId && (draft.homes !== null || draft.skipped)) {
    const landingId = draft.landingAccountId;
    const homes = Object.fromEntries(PLAN_BUCKETS.map((k) => [k, (!draft.skipped && draft.homes?.[k]) || landingId])) as HomeMap;
    const n = transferCount(homes, plan, landingId);
    payday = n === 0 ? "no transfers" : n === 1 ? "1 transfer" : `${n} transfers`;
  }

  const billsNote = plan && plan.rent > 0 && draft.billsStart && draft.billsStart > ctx.todayIso ? `${bucketLabel("rent", draft)}'s share goes to Emergency until ${shortDate(draft.billsStart)}.` : null;
  return { dateLine: slipDate(ctx.todayIso), rows, split, payday, billsNote };
}
