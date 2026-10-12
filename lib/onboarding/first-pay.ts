import { z } from "zod";
import { pairKey } from "@/lib/data/transfers-model";
import { shortDate } from "@/lib/data/money-in-model";
import { formatPeso, justTrackPlan, PLAN_BUCKETS, planToLines, splitByPlan, transferPlan, type PlanBucket, type PlanPercents, type TransferAllocation } from "@/lib/money";
import type { OnboardingDraft } from "./draft";
import { bucketLabel } from "./labels";

/**
 * Pure logic behind First pay (SPEC §7.5): which stage the draft is on, the split and the transfer checklist as the
 * user will see them (the engine's own split, `splitByPlan`, over the draft's plan; the same grouping the SQL
 * `transfer_plan()` does), ticked-transfer bookkeeping, and the lines of the Done card.
 *
 * The stage is derived from the draft alone (the shell's step hooks are pure over it), using only the fields the
 * contract already has:
 *   choice null                         -> entry   ("Has money come in?")
 *   choice later                        -> later   ("That's fine. Payday is the moment.")
 *   choice yes, web path, entryId null  -> form    (amount + date; the entry id is made when the form is submitted)
 *   choice yes, split not confirmed     -> split
 *   choice yes, split confirmed, N > 0  -> move
 * Nothing is written until Finish.
 */

export type FirstPayStage = "entry" | "form" | "split" | "move" | "later";

type FirstPay = OnboardingDraft["firstPay"];
export type TickedPair = FirstPay["ticked"][number];

const MAX_MINOR = 1_000_000_000;

// ------------------------------------------------------------------ preview

export interface PreviewLine {
  bucket: PlanBucket;
  label: string;
  amountMinor: number;
}

export interface PreviewTransfer {
  key: string;
  fromAccountId: string;
  toAccountId: string;
  fromName: string;
  toName: string;
  amountMinor: number;
  labels: string[];
  ticked: boolean;
}

export interface PreviewKeep {
  accountId: string;
  name: string;
  amountMinor: number;
  labels: string[];
}

export interface FirstPayPreview {
  totalMinor: number;
  /** Buckets that get money, in plan order. */
  lines: PreviewLine[];
  /** Set when the bills bucket's share goes to Emergency until the bills start. */
  billsNote: string | null;
  keeps: PreviewKeep[];
  transfers: PreviewTransfer[];
  sentCount: number;
  allSent: boolean;
}

const accountName = (draft: Pick<OnboardingDraft, "accounts">, id: string): string => draft.accounts.find((a) => a.id === id)?.name ?? "an account";

/** Plan A as the engine will apply it: the draft's plan, or Spending 100% when the plan was skipped. */
function planFor(draft: OnboardingDraft): PlanPercents | null {
  if (draft.skipped) return justTrackPlan(draft.landingAccountId ?? "").plan;
  return draft.planA;
}

/**
 * The split of the first pay and the checklist that follows, or null while an input is missing (no amount, no plan, a
 * plan that doesn't total 100, no landing account). `ticked` marks transfers by account pair.
 */
export function previewFirstPay(draft: OnboardingDraft): FirstPayPreview | null {
  const f = draft.firstPay;
  const amount = f.amountMinor;
  const landing = draft.landingAccountId;
  const plan = planFor(draft);
  if (!amount || amount <= 0 || !landing || !plan) return null;
  if (PLAN_BUCKETS.reduce((t, k) => t + plan[k], 0) !== 100) return null;

  const redirect = !draft.skipped && draft.billsStart ? { rentBucketId: "rent", startDate: draft.billsStart } : null;
  const onDate = f.date ?? "9999-12-31";
  const split = splitByPlan(amount, planToLines(plan), { onDate, buckets: PLAN_BUCKETS, emergencyBucketId: "emergency", rentRedirect: redirect });
  const lines: PreviewLine[] = split.filter((l) => l.amount > 0).map((l) => ({ bucket: l.bucketId as PlanBucket, label: bucketLabel(l.bucketId as PlanBucket, draft), amountMinor: l.amount }));

  const allocations: TransferAllocation[] = lines.map((l) => ({
    fromAccountId: landing,
    destAccountId: (!draft.skipped && draft.homes?.[l.bucket]) || landing,
    amount: l.amountMinor,
    label: l.label,
  }));
  const tp = transferPlan(allocations);
  const tickedKeys = new Set(f.ticked.map((t) => pairKey(t.fromAccountId, t.toAccountId)));
  const transfers: PreviewTransfer[] = tp.transfers.map((t) => ({
    key: pairKey(t.fromAccountId, t.toAccountId),
    fromAccountId: t.fromAccountId,
    toAccountId: t.toAccountId,
    fromName: accountName(draft, t.fromAccountId),
    toName: accountName(draft, t.toAccountId),
    amountMinor: t.amount,
    labels: t.labels,
    ticked: tickedKeys.has(pairKey(t.fromAccountId, t.toAccountId)),
  }));
  const sentCount = transfers.filter((t) => t.ticked).length;

  const rentShifted = redirect !== null && plan.rent > 0 && onDate < redirect.startDate;
  return {
    totalMinor: amount,
    lines,
    billsNote: rentShifted && draft.billsStart ? `${bucketLabel("rent", draft)}'s ${plan.rent}% goes to your Emergency fund until ${shortDate(draft.billsStart)}.` : null,
    keeps: tp.keeps.map((k) => ({ accountId: k.accountId, name: accountName(draft, k.accountId), amountMinor: k.amount, labels: k.labels })),
    transfers,
    sentCount,
    allSent: transfers.length > 0 && sentCount === transfers.length,
  };
}

// ------------------------------------------------------------------ stage

export function stageOf(draft: OnboardingDraft): FirstPayStage {
  const f = draft.firstPay;
  if (f.choice === "later") return "later";
  if (f.choice !== "yes") return "entry";
  if (draft.path !== "app" && f.entryId === null) return "form";
  if (!f.splitConfirmed) return "split";
  const p = previewFirstPay(draft);
  return p && p.transfers.length > 0 ? "move" : "split";
}

/** Transfers on payday for this draft (0 when the plan is skipped or everything lives where the pay lands). */
export const transferTotal = (draft: OnboardingDraft): number => previewFirstPay(draft)?.transfers.length ?? 0;

/** What the primary does on the stage the draft is on, when it finishes onboarding: show Done, or go straight to Today. */
export function finishAfter(draft: OnboardingDraft): "done" | "today" | null {
  const stage = stageOf(draft);
  if (stage === "later") return "today";
  if (stage === "split" && draft.firstPay.splitConfirmed) return "done"; // confirmed, and nothing to move
  if (stage === "move" && previewFirstPay(draft)?.allSent) return "done";
  return null;
}

// ------------------------------------------------------------------ form

/** The entry form (web path): amount and date. */
export function validateEntry(draft: OnboardingDraft, todayIso: string): { field: string; message: string } | null {
  const { amountMinor, date } = draft.firstPay;
  if (!amountMinor || amountMinor <= 0) return { field: "ob-fp-amount", message: "Enter what came in, above ₱0." };
  if (amountMinor > MAX_MINOR) return { field: "ob-fp-amount", message: "That amount looks too large. Check the number of zeros." };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { field: "ob-fp-date", message: "Pick the day it came in." };
  if (date > todayIso) return { field: "ob-fp-date", message: "Pick today or an earlier day. The money has to have landed already." };
  return null;
}

// ------------------------------------------------------------------ patches

type Patch = Partial<OnboardingDraft>;
const withFirstPay = (draft: OnboardingDraft, patch: Partial<FirstPay>): Patch => ({ firstPay: { ...draft.firstPay, ...patch } });

/** "Yes, I'll add it" / "Give it a job": the web path starts with the usual amount (the date defaults to today in the form). */
export function chooseYes(draft: OnboardingDraft): Patch {
  return withFirstPay(draft, { choice: "yes", amountMinor: draft.firstPay.amountMinor ?? draft.income.amountMinor });
}

/** Form submitted: the entry gets its id once (a mobile-shaped UUID), so Finish inserts the inflow idempotently and a retry reuses it. */
export function submitEntry(draft: OnboardingDraft, makeId: () => string): Patch {
  return withFirstPay(draft, { entryId: draft.firstPay.entryId ?? makeId(), splitConfirmed: false });
}

/** Confirm split: staged only; stale ticks (an account pair the plan no longer has) are dropped. */
export function confirmSplit(draft: OnboardingDraft): Patch {
  const keys = new Set((previewFirstPay(draft)?.transfers ?? []).map((t) => t.key));
  return withFirstPay(draft, { splitConfirmed: true, ticked: draft.firstPay.ticked.filter((t) => keys.has(pairKey(t.fromAccountId, t.toAccountId))) });
}

export function setTick(ticked: FirstPay["ticked"], from: string, to: string, on: boolean): FirstPay["ticked"] {
  const rest = ticked.filter((t) => !(t.fromAccountId === from && t.toAccountId === to));
  return on ? [...rest, { fromAccountId: from, toAccountId: to }] : rest;
}

/** Back, one stage at a time. Null = leave the step (only from the entry stage). */
export function backPatch(draft: OnboardingDraft): Patch | null {
  switch (stageOf(draft)) {
    case "entry":
      return null;
    case "form":
    case "later":
      return withFirstPay(draft, { choice: null, splitConfirmed: false });
    case "split":
      return draft.path === "app" ? withFirstPay(draft, { choice: null, splitConfirmed: false }) : withFirstPay(draft, { entryId: null, splitConfirmed: false });
    case "move":
      return withFirstPay(draft, { splitConfirmed: false });
  }
}

// ------------------------------------------------------------------ copy

export function sourceName(draft: OnboardingDraft): string {
  return draft.sources.find((s) => s.isMain)?.name ?? "your pay";
}

// ------------------------------------------------------------------ Done card

/** The summary `finish_onboarding` returns (DATA_MODEL / ticket 16). Every field optional: a missing one falls back to the draft. */
export const finishSummarySchema = z
  .object({
    bucketsCount: z.number().int(),
    splitMinor: z.number().int(),
    splitBucketsCount: z.number().int(),
    transfersCount: z.number().int(),
    transfersTicked: z.number().int(),
    safeToSpendMinor: z.number().int(),
    emergencyLeftMinor: z.number().int(),
    spendingBeforeMinor: z.number().int(),
  })
  .partial();
export type FinishSummary = z.infer<typeof finishSummarySchema>;

export function parseSummary(json: unknown): FinishSummary | null {
  const r = finishSummarySchema.safeParse(json);
  return r.success ? r.data : null;
}

export interface DoneLine {
  key: string;
  text: string;
  /** "sun" is the Emergency fund line (spark icon). */
  tone: "check" | "sun";
}

const bucketsText = (n: number) => `${n} ${n === 1 ? "bucket" : "buckets"}`;

/** SPEC §7.5 step 3. Numbers come from the SQL summary where it has them; the rest from the draft's own preview. */
export function doneLines(draft: OnboardingDraft, summary: FinishSummary | null): DoneLine[] {
  const p = previewFirstPay(draft);
  const total = summary?.splitMinor ?? p?.totalMinor ?? draft.firstPay.amountMinor ?? 0;
  const buckets = summary?.splitBucketsCount ?? p?.lines.length ?? 0;
  const moved = (summary?.transfersCount ?? p?.transfers.length ?? 0) > 0;
  const out: DoneLine[] = [
    { key: "split", text: `${formatPeso(total)} split into ${bucketsText(buckets)}`, tone: "check" },
    { key: "match", text: moved ? "Your accounts match your plan" : "Everything stays where it landed", tone: "check" },
  ];

  const spend = (p?.lines ?? []).filter((l) => l.bucket === "living" || l.bucket === "fun").reduce((t, l) => t + l.amountMinor, 0);
  const safe = summary?.safeToSpendMinor ?? spend;
  const before = summary?.spendingBeforeMinor ?? 0;
  const until = draft.income.nextPayday ? shortDate(draft.income.nextPayday) : "your next payday";
  out.push({ key: "safe", text: `Safe to spend until ${until}: ${formatPeso(safe)}${before > 0 ? ", after what you've already spent" : ""}`, tone: "check" });

  const emergency = summary?.emergencyLeftMinor ?? p?.lines.find((l) => l.bucket === "emergency")?.amountMinor ?? 0;
  if (emergency > 0) out.push({ key: "emergency", text: `Your Emergency fund has started: ${formatPeso(emergency)}`, tone: "sun" });
  return out;
}

/** The `onboarding_completed` event's props (ROADMAP §4) for a finished draft. */
export function completedProps(draft: OnboardingDraft, minutes: number) {
  const confirmed = draft.firstPay.choice === "yes" && draft.firstPay.splitConfirmed;
  const keys = new Set((previewFirstPay(draft)?.transfers ?? []).map((t) => t.key));
  const ticked = confirmed ? draft.firstPay.ticked.filter((t) => keys.has(pairKey(t.fromAccountId, t.toAccountId))).length : 0;
  return {
    path: (draft.path ?? "web") as "web" | "app",
    plan_mode: draft.skipped ? "track" : "plan",
    first_pay: (confirmed ? "confirmed" : "later") as "confirmed" | "later",
    transfers_ticked: ticked,
    minutes: Math.max(0, Math.round(minutes)),
  };
}

/** The draft as Finish should see it: ticks the plan no longer has are dropped (the SQL refuses an unknown pair). */
export function finalDraft(draft: OnboardingDraft): OnboardingDraft {
  if (draft.firstPay.choice !== "yes") return draft;
  const keys = new Set((previewFirstPay(draft)?.transfers ?? []).map((t) => t.key));
  return { ...draft, firstPay: { ...draft.firstPay, ticked: draft.firstPay.ticked.filter((t) => keys.has(pairKey(t.fromAccountId, t.toAccountId))) } };
}
