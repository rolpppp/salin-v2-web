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

// ---------------------------------------------------------------- Plans v2: plan bar, drafts, labels

export type PlanChipModel = { key: string; name: string; isActive: boolean };

/** The plan bar: the plan that splits paydays first, then the rest in the order they were made. */
export function orderPlanChips(plans: ReadonlyArray<{ key: string; name: string }>, activeKey: string): PlanChipModel[] {
  const chips = plans.map((p) => ({ key: p.key, name: p.name, isActive: p.key === activeKey }));
  return [...chips.filter((c) => c.isActive), ...chips.filter((c) => !c.isActive)];
}

/** A from-scratch draft: every bucket at 0%. */
export function scratchDraft(bucketIds: readonly string[]): PlanDraft {
  return Object.fromEntries(bucketIds.map((id) => [id, "0"]));
}

/** The line under the total: "Adds up to 95%. Give 5% to a bucket." (empty string when it is exactly 100). */
export function totalHint(check: PlanCheck, badName?: string): string {
  if (check.invalid.length > 0) return `${badName ?? "A bucket"} needs a whole number from 0 to 100.`;
  if (check.total === 100) return "";
  if (check.total < 100) return `Adds up to ${check.total}%. Give ${100 - check.total}% to a bucket.`;
  return `Adds up to ${check.total}%. Take ${check.total - 100}% from a bucket.`;
}

/** What Save does or why it can't, for the sentence beside the button. */
export function saveNote(check: PlanCheck, opts: { isNew: boolean; dirty: boolean }): string {
  if (!check.valid) return opts.isNew ? "Not created yet. Save turns on at exactly 100%." : "Not saved yet. Your last saved version is still used for new paydays.";
  if (opts.isNew) return "Ready. Saving creates the plan.";
  return opts.dirty ? "Adds up to 100%. Save to use it from your next payday." : "Saved. Changes apply from your next payday, never to past ones.";
}

/** Save is enabled only at exactly 100%, and for an existing plan only when something changed. */
export function canSave(check: PlanCheck, opts: { isNew: boolean; dirty: boolean; busy: boolean; hasName: boolean }): boolean {
  return check.valid && !opts.busy && (opts.isNew ? opts.hasName : opts.dirty);
}

/** The stepper buttons: +/- one point on the typed value, kept inside 0..100. An unreadable value steps from 0. */
export function stepPercent(raw: string, delta: number): string {
  const n = parsePercent(raw) ?? 0;
  return String(Math.min(100, Math.max(0, n + delta)));
}

/** Pesos (centavos) a share of a typical pay comes to: integer maths only, rounded down. */
export function shareOfPay(payMinor: number, pct: number): number {
  return Math.floor((payMinor * pct) / 100);
}

/** A name for "Copy of {plan}" that isn't taken yet ("Copy of Plan A", "Copy of Plan A 2", ...), within 40 characters. */
export function copyName(source: string, taken: readonly string[]): string {
  const used = new Set(taken.map((n) => n.trim().toLowerCase()));
  const make = (n: number) => {
    const suffix = n === 1 ? "" : ` ${n}`;
    return `${`Copy of ${source}`.slice(0, 40 - suffix.length).trimEnd()}${suffix}`;
  };
  let n = 1;
  while (used.has(make(n).toLowerCase()) && n < 50) n += 1;
  return make(n);
}

/** Client-side name check before a round trip. The server still enforces uniqueness (case-insensitive). */
export function nameProblem(raw: string, taken: readonly string[]): string | null {
  const name = raw.trim();
  if (name.length === 0) return "Give it a name.";
  if (name.length > 40) return "Names can be up to 40 characters.";
  if (taken.some((n) => n.trim().toLowerCase() === name.toLowerCase())) return "You already have one with that name.";
  return null;
}

// ---------------------------------------------------------------- "Which plan splits your paydays"

export type ActiveChoice = { mode: "auto"; from: string; to: string } | { mode: "manual"; planKey: string };

/** The choice as saved. */
export function choiceFromSettings(s: { mode: "auto" | "manual"; activeKey: string; autoFrom: string; autoTo: string }): ActiveChoice {
  return s.mode === "manual" ? { mode: "manual", planKey: s.activeKey } : { mode: "auto", from: s.autoFrom, to: s.autoTo };
}

export function sameChoice(a: ActiveChoice, b: ActiveChoice): boolean {
  if (a.mode === "manual" && b.mode === "manual") return a.planKey === b.planKey;
  if (a.mode === "auto" && b.mode === "auto") return a.from === b.from && a.to === b.to;
  return false;
}

/** Why a choice can't be saved, or null. */
export function choiceProblem(c: ActiveChoice, liveKeys: readonly string[]): string | null {
  if (c.mode === "manual") return liveKeys.includes(c.planKey) ? null : "Pick one of your plans.";
  if (c.from === c.to) return "Pick two different plans for the automatic switch.";
  if (!liveKeys.includes(c.from) || !liveKeys.includes(c.to)) return "Pick two of your plans.";
  return null;
}

/** Which plan the automatic switch uses right now: `from` until the Emergency measure reaches the target, then `to`. */
export function autoActiveKey(from: string, to: string, nowMinor: number, targetMinor: number | null): string {
  return targetMinor !== null && targetMinor > 0 && nowMinor >= targetMinor ? to : from;
}

/** Text of the chip on the active plan. */
export const ACTIVE_MARKER = "Splitting your paydays";

// ---------------------------------------------------------------- archive flow

export type ArchiveState = { kind: "idle" } | { kind: "checking" } | { kind: "blocked"; reason: string } | { kind: "failed"; error: string };

/** What the row shows after asking `bucket_archive_reason`: a reason blocks the archive, null lets it go ahead. */
export function afterReasonCheck(r: { ok: true; reason: string | null } | { ok: false; error: string }): { next: ArchiveState; archive: boolean } {
  if (!r.ok) return { next: { kind: "failed", error: r.error }, archive: false };
  if (r.reason) return { next: { kind: "blocked", reason: r.reason }, archive: false };
  return { next: { kind: "checking" }, archive: true };
}

export const GROUP_LABELS: Record<"spend" | "save" | "set_aside", string> = { spend: "Spend", save: "Save", set_aside: "Set aside" };
