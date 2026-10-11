import type { IncomeRule } from "@/lib/data/income-kinds";
import { bpToPercent, parsePercent, percentToBp } from "../shared";

/** Draft text per bucket id for one source's own split. */
export type SplitDraft = Record<string, string>;

export type OwnCheck = {
  total: number;
  /** Buckets whose field isn't a whole number from 0 to 100. */
  invalid: string[];
  /** Storable: every field valid and the total at most 100. */
  savable: boolean;
  /** Usable by the engine: savable and exactly 100. */
  complete: boolean;
};

/** An empty own-split field means 0 (skipped). */
export function checkOwnSplit(draft: SplitDraft, bucketIds: readonly string[]): OwnCheck {
  let total = 0;
  const invalid: string[] = [];
  for (const id of bucketIds) {
    const n = parsePercent(draft[id] ?? "", true);
    if (n === null) invalid.push(id);
    else total += n;
  }
  const savable = invalid.length === 0 && total <= 100;
  return { total, invalid, savable, complete: savable && total === 100 };
}

/** "90% · needs 100%" or "100%". The words carry the meaning, colour only backs them up. */
export function ownTotalLabel(total: number): string {
  return total === 100 ? "100%" : `${total}% · needs 100%`;
}

export function ownDraftFromBp(split: Record<string, number>, bucketIds: readonly string[]): SplitDraft {
  const out: SplitDraft = {};
  for (const id of bucketIds) out[id] = String(bpToPercent(split[id] ?? 0));
  return out;
}

/** Lines to save: buckets above 0 only (0 = skipped, no line). */
export function ownDraftToLines(draft: SplitDraft, bucketIds: readonly string[]): Array<{ bucketId: string; percentBp: number }> {
  return bucketIds
    .map((bucketId) => ({ bucketId, percentBp: percentToBp(parsePercent(draft[bucketId] ?? "", true) ?? 0) }))
    .filter((l) => l.percentBp > 0);
}

export function ownDiffers(a: SplitDraft, b: SplitDraft, bucketIds: readonly string[]): boolean {
  return bucketIds.some((id) => parsePercent(a[id] ?? "", true) !== parsePercent(b[id] ?? "", true));
}

/** Why an own split can't be saved, in the voice of the rest of the screen. */
export function ownProblem(check: OwnCheck, badName?: string): string | null {
  if (check.invalid.length > 0) return `${badName ?? "A bucket"} needs a whole number from 0 to 100.`;
  if (check.total > 100) return `The split adds up to ${check.total}%. Take ${check.total - 100}% out.`;
  return null;
}

/** One line saying what the rule does (SPEC 4.2). */
export function ruleDescription(args: { rule: IncomeRule; activePlan: string; wholeBucketName?: string | null; ownTotal: number }): string {
  switch (args.rule) {
    case "plan":
      return `Uses Plan ${args.activePlan} percentages.`;
    case "ask":
      return "You pick a job when the money arrives.";
    case "whole":
      return args.wholeBucketName ? `All of it stays in ${args.wholeBucketName}. Nothing is split.` : "Nothing is split.";
    case "own":
      return args.ownTotal === 100
        ? "Splits each income by the percentages below."
        : `Its split adds up to ${args.ownTotal}%, so each income from this source needs a job until it adds up to 100%.`;
  }
}

/** The bucket a source is kept whole in when the person first picks "Keep it whole". */
export function defaultWholeBucket(kind: string, buckets: ReadonlyArray<{ id: string; hue: string | null }>): string | null {
  const wanted = kind === "scholarship" ? "dost" : kind === "allowance" ? "living" : "emergency";
  return (buckets.find((b) => b.hue === wanted) ?? buckets[0])?.id ?? null;
}
