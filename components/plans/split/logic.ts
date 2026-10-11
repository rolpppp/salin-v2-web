import { bpToPercent, parsePercent, percentToBp } from "../shared";

/** Draft text per bucket id for one plan. */
export type PlanDraft = Record<string, string>;

export type PlanCheck = {
  /** Sum of the valid fields, in whole percent. */
  total: number;
  /** Buckets whose field isn't a whole number from 0 to 100. */
  invalid: string[];
  /** True when the plan can be saved: every field valid and the total is exactly 100. */
  valid: boolean;
};

export function checkPlan(draft: PlanDraft, bucketIds: readonly string[]): PlanCheck {
  let total = 0;
  const invalid: string[] = [];
  for (const id of bucketIds) {
    const n = parsePercent(draft[id] ?? "");
    if (n === null) invalid.push(id);
    else total += n;
  }
  return { total, invalid, valid: invalid.length === 0 && total === 100 };
}

/** The sentence under the table when a plan can't be saved (SPEC 4.1). `badName` names the first invalid field. */
export function planMessage(planKey: string, check: PlanCheck, badName?: string): string | null {
  if (check.invalid.length > 0) return `${badName ?? "A bucket"} needs a whole number from 0 to 100 in Plan ${planKey}.`;
  if (check.total === 100) return null;
  if (check.total < 100) return `Plan ${planKey} adds up to ${check.total}%. Add ${100 - check.total}% to another bucket.`;
  return `Plan ${planKey} adds up to ${check.total}%. Take ${check.total - 100}% from another bucket.`;
}

export function draftFromBp(lines: Record<string, number>, bucketIds: readonly string[]): PlanDraft {
  const out: PlanDraft = {};
  for (const id of bucketIds) out[id] = String(bpToPercent(lines[id] ?? 0));
  return out;
}

/** Lines to send to the save function: every plan bucket, whole percent -> basis points. */
export function draftToLines(draft: PlanDraft, bucketIds: readonly string[]): Array<{ bucketId: string; percentBp: number }> {
  return bucketIds.map((bucketId) => ({ bucketId, percentBp: percentToBp(parsePercent(draft[bucketId] ?? "") ?? 0) }));
}

/** True when the draft's numbers differ from what is saved (ignores formatting like "05"). */
export function differsFromSaved(draft: PlanDraft, saved: PlanDraft, bucketIds: readonly string[]): boolean {
  return bucketIds.some((id) => parsePercent(draft[id] ?? "") !== parsePercent(saved[id] ?? ""));
}
