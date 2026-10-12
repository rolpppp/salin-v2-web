/**
 * Money in: the pure model behind the screen (no React, no Supabase). Queue ordering, job choice and
 * resolution, the live split preview (the TS mirror in lib/money, which has proven parity with SQL),
 * slip math, Add income validation. The real write is the SQL function `confirm_incomes_with_jobs`;
 * everything here is for display and for refusing bad input early.
 */
import {
  activePlan,
  allocateIncome,
  effectivePlanBp,
  formatPercent,
  formatPeso,
  moneyErrorMessage,
  parseMoney,
  ratePerAud,
  resolveJob,
  planLinesOf,
  splitOwn,
  type ActivePlanSetting,
  type JobKind,
  type PercentLine,
  type PlanKey,
  type RentRedirect,
  type SourceRule,
  type SplitLine,
} from "@/lib/money";
import { zonedParts } from "@/lib/time";

// ---------------------------------------------------------------- data shapes (what the server hands the screen)

export type SourceKind = "salary" | "scholarship" | "side_hustle" | "allowance" | "gift" | "refund" | "other";

export interface MiBucket {
  id: string;
  name: string;
  shortName: string | null;
  groupKey: string;
  hue: string | null;
  keptInAccountId: string | null;
  planless: boolean;
  displayOrder: number;
  isArchived: boolean;
}

export interface MiAccount {
  id: string;
  name: string;
  currency: string;
  isArchived: boolean;
}

export interface MiSource {
  id: string;
  name: string;
  kind: SourceKind;
  rule: SourceRule;
  wholeBucketId: string | null;
  landsInAccountId: string | null;
  categoryId: string | null;
  isArchived: boolean;
  splitLines: PercentLine[];
}

/** One income waiting for a job: an inflow with an `income_meta` row and no allocations. */
export interface MiIncome {
  /** The ledger entry id. */
  id: string;
  sourceId: string | null;
  amountMinor: number;
  occurredAt: number;
  /** Calendar date in the user's zone, for display. */
  dateIso: string;
  /** Calendar date in Asia/Manila, which is how SQL reads it (rent redirect). */
  engineDate: string;
  accountId: string;
  /** The pick stored on income_meta, if any. */
  metaJob: JobKind | null;
  oneBucketId: string | null;
  /** A$ sent, in centavos of AUD, when the user recorded it. */
  sentMinor: number | null;
  sentCurrency: string | null;
}

/** A confirmed income in the current transfer cycle. */
export interface MiDone {
  entryId: string;
  name: string;
  how: string;
  amountMinor: number;
}

/** One row of the latest cycle's checklist, as `transfer_plan()` returns it (SQL is the source of truth). */
export interface MiTransferRow {
  kind: "keep" | "transfer";
  fromAccountId: string;
  /** Equals `fromAccountId` on a keep row. */
  toAccountId: string;
  amount: number;
  /** Money that stays put because of netting. */
  netted: number;
  /** Running total sent for this pair in the cycle. */
  sent: number;
  done: boolean;
  status: "keep" | "unsent" | "partial" | "done" | "oversent";
  sendMore: number;
  bucketIds: string[];
}

export interface PlanContext {
  /** Every live plan's lines, by key (`A`, `B`, `p_xxxxxxxx`). */
  plans: Record<string, PercentLine[]>;
  /** Every live plan's name, by key. */
  planNames: Record<string, string>;
  /** Which plan splits paydays: one chosen plan, or automatic from -> to at the switch target (P-9). */
  activePlan: ActivePlanSetting;
  emergencyBucketId: string | null;
  rentRedirect: RentRedirect | null;
  /** Σ of all Emergency allocations already confirmed (D-14). */
  emergencyAllocatedSoFar: number;
  switchTarget: number;
  switchOn: boolean;
}

/** A plan's name for display; "Plan A" / "Plan B" for the original two when the name is missing. */
export function planLabel(plan: Pick<PlanContext, "planNames">, key: string): string {
  return plan.planNames[key] ?? (key.length === 1 ? `Plan ${key}` : "Your plan");
}

/** The keys of the plans that can split a payday now: the chosen plan, or both ends of the automatic switch. */
export function planKeysInPlay(plan: Pick<PlanContext, "activePlan" | "switchOn">): string[] {
  const s = plan.activePlan;
  return s.mode === "manual" ? [s.planKey] : plan.switchOn ? [s.from, s.to] : [s.from];
}

export interface MoneyInData {
  homeCurrency: string;
  /** Today's calendar date in the user's zone. */
  todayIso: string;
  timeZone: string;
  buckets: MiBucket[];
  accounts: MiAccount[];
  sources: MiSource[];
  /** Waiting incomes, oldest first. */
  incomes: MiIncome[];
  /** The latest transfer cycle's checklist (`transfer_plan()`); empty before the first confirm. */
  transferPlan: MiTransferRow[];
  /** Incomes confirmed in the latest transfer cycle, oldest first. */
  done: MiDone[];
  cycle: { id: string; closedAt: number | null } | null;
  plan: PlanContext;
}

// ---------------------------------------------------------------- small helpers

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-10-07` -> `Oct 7`. */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1] ?? "?"} ${Number(m[3])}`;
}

/** `2026-10-11` -> `OCT 11` (the stamp). */
export function stampDate(iso: string): string {
  return shortDate(iso).toUpperCase();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar date of an instant in a zone, `YYYY-MM-DD`. */
export function isoDateIn(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(s: string): boolean {
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

const KIND_LABELS: Record<SourceKind, string> = {
  salary: "Salary",
  scholarship: "Scholarship",
  side_hustle: "Side hustle",
  allowance: "Allowance",
  gift: "Gift",
  refund: "Refund",
  other: "Other",
};

export function kindLabel(kind: SourceKind): string {
  return KIND_LABELS[kind];
}

/** The kind chip text, or null when the source's name already says it ("Side hustle", "Scholarship"). */
export function kindChipText(source: Pick<MiSource, "name" | "kind">): string | null {
  const label = KIND_LABELS[source.kind];
  const n = source.name.toLowerCase();
  if (n.includes(label.toLowerCase()) || n.includes(label.toLowerCase().replace(" ", ""))) return null;
  return label;
}

const HUES = new Set(["living", "fun", "emergency", "invest", "sinking", "tax", "buffer", "rent", "dost"]);

/** CSS colour for a bucket's hue. Unknown hues fall back to the neutral buffer colour. */
export function hueVar(hue: string | null | undefined): string {
  return `var(--b-${hue && HUES.has(hue) ? hue : "buffer"})`;
}

/** Whole-percent text for basis points: 1000 -> "10%", 1250 -> "12.5%". */
export function pctText(bp: number): string {
  return formatPercent(bp, bp % 100 === 0 ? 0 : bp % 10 === 0 ? 1 : 2);
}

function bucketName(buckets: readonly MiBucket[], id: string | null | undefined): string {
  return buckets.find((b) => b.id === id)?.name ?? "a bucket";
}

function bucketShort(buckets: readonly MiBucket[], id: string): string {
  const b = buckets.find((x) => x.id === id);
  return b ? (b.shortName?.trim() || b.name) : "a bucket";
}

/** Waiting queue order: oldest first (BR §2.2.1), ties by id so it matches SQL. */
export function sortQueue<T extends { occurredAt: number; id: string }>(incomes: readonly T[]): T[] {
  return [...incomes].sort((a, b) => a.occurredAt - b.occurredAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---------------------------------------------------------------- job choice (BR §2.1)

/** What the radio cards offer. `rule` = "Use its rule". */
export type JobPick = "rule" | "plan" | "one";

export interface Choice {
  pick: JobPick;
  /** For `one`: the bucket picked now (null = Emergency fund, BR §2.5). */
  oneBucketId: string | null;
}

export function initialChoice(income: Pick<MiIncome, "metaJob" | "oneBucketId">): Choice {
  if (income.metaJob === "plan") return { pick: "plan", oneBucketId: null };
  if (income.metaJob === "one") return { pick: "one", oneBucketId: income.oneBucketId };
  return { pick: "rule", oneBucketId: null };
}

/** The job as it is stored on income_meta (null = the source's rule decides). */
export function storedJob(income: Pick<MiIncome, "metaJob">, choice: Choice): { job: JobKind | null; oneBucketId: string | null } {
  if (choice.pick === "plan") return { job: "plan", oneBucketId: null };
  if (choice.pick === "one") return { job: "one", oneBucketId: choice.oneBucketId };
  // "Use its rule": keep an own/whole pick that was already stored, otherwise clear it.
  return { job: income.metaJob === "own" || income.metaJob === "whole" ? income.metaJob : null, oneBucketId: null };
}

export type NoJobReason = "ask" | "own_split_incomplete" | "whole_bucket_missing" | "no_source";

/** The text for an income with no job (BR §2.1). */
export function needsJobText(reason: NoJobReason, totalBp?: number): string {
  if (reason === "own_split_incomplete") {
    return `Its split adds to ${pctText(totalBp ?? 0)}, fix it in Plans`;
  }
  if (reason === "whole_bucket_missing") return "No bucket to keep it in, fix it in Plans";
  return "Needs a job";
}

export type Preview =
  | { kind: "ready"; job: JobKind; planKey?: PlanKey; lines: SplitLine[]; bps: Map<string, number> }
  | { kind: "needs"; reason: NoJobReason; totalBp?: number }
  | { kind: "error"; message: string };

export const PLAN_BROKEN = "Your plan doesn't add up to 100%, fix it in Plans";

/**
 * The live split of every waiting income, evaluated in confirm order so an earlier income can switch
 * the plan for the next one (BR §2.2.1). Mirrors `confirm_incomes`; a plan that can't be split gives
 * an `error` preview instead of throwing, so the row can say so.
 */
export function computePreviews(
  data: Pick<MoneyInData, "incomes" | "sources" | "buckets" | "plan">,
  choices: Readonly<Record<string, Choice | undefined>>,
): Map<string, Preview> {
  const out = new Map<string, Preview>();
  const { plan } = data;
  let emergency = plan.emergencyAllocatedSoFar;
  const allIds = data.buckets.map((b) => b.id);
  const rentId = plan.rentRedirect?.rentBucketId ?? data.buckets.find((b) => b.hue === "rent")?.id ?? null;

  for (const inc of sortQueue(data.incomes)) {
    const source = data.sources.find((s) => s.id === inc.sourceId);
    const choice = choices[inc.id] ?? initialChoice(inc);
    const stored = storedJob(inc, choice);
    const resolved = source
      ? resolveJob({ job: stored.job, oneBucketId: stored.oneBucketId }, { rule: source.rule, wholeBucketId: source.wholeBucketId, splitLines: source.splitLines })
      : stored.job
        ? resolveJob({ job: stored.job, oneBucketId: stored.oneBucketId }, { rule: "ask" })
        : ({ kind: "no_job", reason: "no_source", totalBp: undefined } as const);
    if (resolved.kind === "no_job") {
      out.set(inc.id, { kind: "needs", reason: resolved.reason, ...(resolved.totalBp !== undefined ? { totalBp: resolved.totalBp } : {}) });
      continue;
    }
    try {
      if (!plan.emergencyBucketId) throw new Error("no emergency bucket");
      const bucketId = resolved.job === "one" ? (resolved.bucketId ?? plan.emergencyBucketId) : null;
      if (resolved.job === "one" && bucketId === rentId) {
        out.set(inc.id, { kind: "error", message: "Rent can't be picked for a one-off. Choose another bucket." });
        continue;
      }
      const planKey = activePlan(emergency, plan.switchTarget, plan.activePlan, plan.switchOn);
      const ctx = {
        plans: plan.plans,
        activePlan: plan.activePlan,
        buckets: allIds,
        emergencyBucketId: plan.emergencyBucketId,
        rentRedirect: plan.rentRedirect,
        emergencyAllocatedSoFar: emergency,
        switchTarget: plan.switchTarget,
        switchOn: plan.switchOn,
      };
      const job = resolved.job === "one" ? ({ ...resolved, bucketId } as typeof resolved) : resolved;
      const all = allocateIncome(inc.amountMinor, inc.engineDate, job, planKey, ctx);
      const lines = all.filter((l) => l.amount > 0);
      emergency += lines.filter((l) => l.bucketId === plan.emergencyBucketId).reduce((t, l) => t + l.amount, 0);

      const bps = new Map<string, number>();
      if (resolved.job === "plan") {
        const eff = effectivePlanBp(planLinesOf(plan, planKey), {
          onDate: inc.engineDate,
          buckets: allIds,
          emergencyBucketId: plan.emergencyBucketId,
          rentRedirect: plan.rentRedirect,
        });
        allIds.forEach((id, i) => bps.set(id, eff[i] ?? 0));
      } else if (resolved.job === "own") {
        for (const l of resolved.lines) bps.set(l.bucketId, l.bp);
      } else if (lines[0]) {
        bps.set(lines[0].bucketId, 10_000);
      }
      out.set(inc.id, { kind: "ready", job: resolved.job, ...(resolved.job === "plan" ? { planKey } : {}), lines, bps });
    } catch {
      out.set(inc.id, { kind: "error", message: PLAN_BROKEN });
    }
  }
  return out;
}

/** The row's job line: "Split by Plan A", "Own split: Tax 10 · Sinking 40 · Fun 50", "Kept whole in Scholarship", or the reason it has none. */
export function jobText(preview: Preview, income: MiIncome, source: MiSource | undefined, buckets: readonly MiBucket[], plan?: Pick<PlanContext, "planNames">): string {
  if (preview.kind === "needs") return needsJobText(preview.reason, preview.totalBp);
  if (preview.kind === "error") return preview.message;
  switch (preview.job) {
    case "plan":
      return `Split by ${planLabel(plan ?? { planNames: {} }, preview.planKey ?? "A")}`;
    case "own":
      return `Own split: ${(source?.splitLines ?? [])
        .filter((l) => l.bp > 0)
        .map((l) => `${bucketShort(buckets, l.bucketId)} ${Math.round(l.bp / 100)}`)
        .join(" · ")}`;
    case "whole":
      return `Kept whole in ${bucketName(buckets, source?.wholeBucketId)}`;
    case "one":
      return `One-off: all to ${bucketName(buckets, preview.lines[0]?.bucketId)}`;
  }
}

/** `ruleText` for the "Use its rule" card and the Add income "Its job" line, or null when the rule gives no job. */
export function ruleJobText(source: MiSource, buckets: readonly MiBucket[], planKey: PlanKey = "A", plan?: Pick<PlanContext, "planNames">): { kind: "job" | "pick"; text: string } {
  switch (source.rule) {
    case "plan":
      return { kind: "job", text: `Split by ${planLabel(plan ?? { planNames: {} }, planKey)}` };
    case "own": {
      const r = splitOwn(0, source.splitLines);
      if (r.kind !== "split") {
        return { kind: "pick", text: `Its own split adds to ${pctText(r.totalBp ?? 0)}, so you'll pick a job after adding it.` };
      }
      return {
        kind: "job",
        text: `Own split: ${source.splitLines
          .filter((l) => l.bp > 0)
          .map((l) => `${bucketShort(buckets, l.bucketId)} ${Math.round(l.bp / 100)}`)
          .join(" · ")}`,
      };
    }
    case "whole":
      return source.wholeBucketId
        ? { kind: "job", text: `Kept whole in ${bucketName(buckets, source.wholeBucketId)}` }
        : { kind: "pick", text: "It has no bucket to keep the money in, so you'll pick a job after adding it." };
    case "ask":
      return { kind: "pick", text: "You'll pick its job after adding it." };
  }
}

/** Why the split came out this way, for the slip foot and the "why" note (BR §2.2, §2.6). */
export function whyText(preview: Preview, income: MiIncome, data: Pick<MoneyInData, "plan" | "buckets">): string | null {
  if (preview.kind !== "ready") return null;
  const { plan, buckets } = data;
  if (preview.job !== "plan") {
    if (preview.job === "own") return "Its own split, applied to this amount.";
    if (preview.job === "whole") return "Kept whole in one bucket. Nothing is split.";
    return "A one-off: all of it goes to the bucket you chose.";
  }
  const parts: string[] = [];
  const r = plan.rentRedirect;
  if (r && income.engineDate < r.startDate) {
    const planLines = plan.plans[preview.planKey ?? ""] ?? [];
    const rentBp = planLines.find((l) => l.bucketId === r.rentBucketId)?.bp ?? 0;
    if (rentBp > 0) {
      parts.push(`${bucketName(buckets, r.rentBucketId)}'s ${pctText(rentBp)} went to ${bucketName(buckets, plan.emergencyBucketId)} until ${shortDate(r.startDate)}, ${r.startDate.slice(0, 4)}.`);
    }
  }
  const setting = plan.activePlan;
  parts.push(
    setting.mode === "auto" && plan.switchOn && plan.switchTarget > 0
      ? preview.planKey === setting.to
        ? `${planLabel(plan, setting.to)} applies now that the Emergency fund reached ${formatPeso(plan.switchTarget)}.`
        : `${planLabel(plan, preview.planKey ?? setting.from)} runs until the Emergency fund reaches ${formatPeso(plan.switchTarget)}.`
      : "Your plan's percentages, applied to this amount.",
  );
  return parts.join(" ");
}

// ---------------------------------------------------------------- the queue as a whole

export interface QueueSummary {
  /** Ids that can be confirmed now, in confirm order. */
  readyIds: string[];
  readyTotal: number;
  /** Names of incomes that still need a job (in queue order). */
  needNames: string[];
  total: number;
}

export function summarizeQueue(data: Pick<MoneyInData, "incomes" | "sources">, previews: ReadonlyMap<string, Preview>): QueueSummary {
  const ordered = sortQueue(data.incomes);
  const ready = ordered.filter((i) => previews.get(i.id)?.kind === "ready");
  const needs = ordered.filter((i) => previews.get(i.id)?.kind !== "ready");
  return {
    readyIds: ready.map((i) => i.id),
    readyTotal: ready.reduce((t, i) => t + i.amountMinor, 0),
    needNames: needs.map((i) => data.sources.find((s) => s.id === i.sourceId)?.name ?? "Unknown source"),
    total: ordered.length,
  };
}

/** The label on the primary button: "Confirm all 3 · ₱X", "Confirm 2 · ₱X", "Confirm · ₱X". */
export function confirmAllLabel(s: QueueSummary): string {
  const n = s.readyIds.length;
  const head = n === s.total && n > 1 ? `Confirm all ${n}` : n > 1 ? `Confirm ${n}` : "Confirm";
  return `${head} · ${formatPeso(s.readyTotal)}`;
}

/** "Logo commissions need a job first." */
export function needsHelper(names: readonly string[], total: number): string {
  if (names.length === 0) return total > 1 ? "Each one uses the job shown on its row." : "";
  const joined = names.length > 2 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join(" and ");
  return `${joined} ${names.length > 1 ? "need" : "needs"} a job first.`;
}

export type MoneyInPhase = "empty" | "waiting" | "move" | "all_done";

/**
 * Which state the screen is in. `all_done` needs the latest transfer cycle to be closed (every transfer
 * sent, P-3) and only holds for the day it closed, so last month's completion doesn't greet you today.
 */
export function moneyInPhase(data: Pick<MoneyInData, "incomes" | "done" | "cycle" | "timeZone">, nowMs: number): MoneyInPhase {
  if (data.incomes.length > 0) return "waiting";
  if (data.done.length === 0 || !data.cycle) return "empty";
  if (data.cycle.closedAt === null) return "move";
  return isoDateIn(data.cycle.closedAt, data.timeZone) === isoDateIn(nowMs, data.timeZone) ? "all_done" : "empty";
}

export function headerCopy(phase: MoneyInPhase, waiting: number): { title: string; lede: string } {
  switch (phase) {
    case "waiting":
      return {
        title: "Give your money a job",
        lede: `${waiting} ${waiting > 1 ? "incomes are" : "income is"} waiting. Each source has its own rule, so most of the work is done. Check, then confirm.`,
      };
    case "move":
      return { title: "Move the money", lede: "Tick each transfer once you've sent it in your banking app." };
    case "all_done":
      return { title: "Every peso has a home", lede: "Everything that came in is split and sent." };
    case "empty":
      return { title: "Nothing waiting", lede: "Money from any source shows up here: salary, scholarship, side hustle, allowance." };
  }
}

// ---------------------------------------------------------------- slip (SPEC §2.5)

export interface SlipLineModel {
  bucketId: string;
  name: string;
  hue: string | null;
  amount: number;
  /** Basis points, when the slip is for one income. */
  bp?: number;
}

export interface SlipModel {
  scope: "one" | "all";
  title: string;
  meta: string;
  lines: SlipLineModel[];
  /** Sum of the lines. */
  total: number;
  /** Money in the queue that has no job yet (only for the combined slip). */
  unassigned: number;
  why: string | null;
  /** The slip never shows a split it can't compute. */
  note: string | null;
}

/** The slip for the selected income, or for all waiting income combined when nothing is selected. */
export function buildSlip(
  data: Pick<MoneyInData, "incomes" | "sources" | "buckets" | "accounts" | "plan">,
  previews: ReadonlyMap<string, Preview>,
  selectedId: string | null,
): SlipModel {
  const nameOf = (id: string) => data.buckets.find((b) => b.id === id);
  const lineFor = (bucketId: string, amount: number, bp?: number): SlipLineModel => ({
    bucketId,
    name: nameOf(bucketId)?.name ?? "A bucket",
    hue: nameOf(bucketId)?.hue ?? null,
    amount,
    ...(bp !== undefined ? { bp } : {}),
  });
  const order = new Map(data.buckets.map((b, i) => [b.id, i]));
  const byOrder = (a: SlipLineModel, b: SlipLineModel) => (order.get(a.bucketId) ?? 0) - (order.get(b.bucketId) ?? 0);

  const sel = selectedId ? data.incomes.find((i) => i.id === selectedId) : undefined;
  if (sel) {
    const source = data.sources.find((s) => s.id === sel.sourceId);
    const p = previews.get(sel.id);
    const account = data.accounts.find((a) => a.id === sel.accountId);
    const lines = p?.kind === "ready" ? p.lines.map((l) => lineFor(l.bucketId, l.amount, p.bps.get(l.bucketId))).sort(byOrder) : [];
    return {
      scope: "one",
      title: source?.name ?? "Income",
      meta: `${shortDate(sel.dateIso)} · landed in ${account?.name ?? "an account"}`,
      lines,
      total: lines.reduce((t, l) => t + l.amount, 0),
      unassigned: p?.kind === "ready" ? 0 : sel.amountMinor,
      why: p ? whyText(p, sel, data) : null,
      note: p?.kind === "ready" ? null : p?.kind === "error" ? p.message : p ? needsJobText(p.reason, p.totalBp) : null,
    };
  }

  const sums = new Map<string, number>();
  let unassigned = 0;
  for (const inc of data.incomes) {
    const p = previews.get(inc.id);
    if (p?.kind !== "ready") {
      unassigned += inc.amountMinor;
      continue;
    }
    for (const l of p.lines) sums.set(l.bucketId, (sums.get(l.bucketId) ?? 0) + l.amount);
  }
  const lines = [...sums].map(([id, amount]) => lineFor(id, amount)).sort(byOrder);
  const n = data.incomes.length;
  return {
    scope: "all",
    title: "All waiting income",
    meta: n === 0 ? "Nothing waiting" : `${n} ${n === 1 ? "income" : "incomes"}`,
    lines,
    total: lines.reduce((t, l) => t + l.amount, 0),
    unassigned,
    why: null,
    note: unassigned > 0 ? `${formatPeso(unassigned)} has no job yet and isn't counted above.` : null,
  };
}

// ---------------------------------------------------------------- done list

/** "How" for a confirmed income, from the snapshot stored with its allocations (BR §2.6). */
export function doneHow(trace: unknown, bucketNames: readonly string[]): string {
  const t = (trace && typeof trace === "object" ? trace : {}) as Record<string, unknown>;
  switch (t.job) {
    case "plan":
      return `Split by Plan ${typeof t.planKey === "string" ? t.planKey : "A"}`;
    case "own":
      return "Own split";
    case "whole":
      return `Kept whole in ${bucketNames[0] ?? "one bucket"}`;
    case "one":
      return `One-off to ${bucketNames[0] ?? "one bucket"}`;
    default:
      return "Confirmed";
  }
}

// ---------------------------------------------------------------- Add income (SPEC §2.2)

export interface AddIncomeInput {
  sourceId: string;
  /** What the user typed, e.g. "17,410". */
  amount: string;
  /** `YYYY-MM-DD`. */
  date: string;
  landedIn: string;
  /** What the user typed for A$ sent; "" when left empty. */
  aud: string;
}

export type AddIncomeField = "source" | "amount" | "date" | "landedIn" | "aud";
export type AddIncomeErrors = Partial<Record<AddIncomeField, string>>;

/** Field order for focus: the first error in this order gets focus. */
export const ADD_INCOME_FIELD_ORDER: readonly AddIncomeField[] = ["source", "amount", "date", "landedIn", "aud"];

export type AddIncomeValidation =
  | { ok: true; value: { sourceId: string; amountMinor: number; date: string; landedIn: string; audMinor: number | null } }
  | { ok: false; errors: AddIncomeErrors; first: AddIncomeField };

/** `showAud`: the AUD field only exists for salary sources, so it is ignored for the others. */
export function validateAddIncome(input: AddIncomeInput, opts: { todayIso: string; showAud: boolean }): AddIncomeValidation {
  const errors: AddIncomeErrors = {};
  if (!input.sourceId) errors.source = "Pick where the money came from.";
  const amount = parseMoney(input.amount);
  if (!amount.ok) errors.amount = moneyErrorMessage("received", amount.error);
  if (!isValidIsoDate(input.date)) errors.date = "Pick the date you received it.";
  else if (input.date > opts.todayIso) errors.date = "Pick today or an earlier date. Money that hasn't arrived yet can't be added.";
  if (!input.landedIn) errors.landedIn = "Pick the account it landed in.";
  let audMinor: number | null = null;
  if (opts.showAud && input.aud.trim() !== "") {
    const aud = parseMoney(input.aud);
    if (aud.ok) audMinor = aud.minor;
    else errors.aud = moneyErrorMessage("aud", aud.error);
  }
  const first = ADD_INCOME_FIELD_ORDER.find((f) => errors[f]);
  if (first || !amount.ok) {
    return { ok: false, errors, first: first ?? "amount" };
  }
  return { ok: true, value: { sourceId: input.sourceId, amountMinor: amount.minor, date: input.date, landedIn: input.landedIn, audMinor } };
}

/** "Rate you got: ₱43.53 per A$1", or the prompt to add the A$ amount (BR §9, G11). Integer math only. */
export function rateText(pesoRaw: string, audRaw: string): string {
  const peso = parseMoney(pesoRaw);
  const aud = parseMoney(audRaw);
  if (peso.ok && aud.ok) return `Rate you got: ${formatPeso(ratePerAud(peso.minor, aud.minor))} per A$1`;
  return "Add the A$ amount to track the rate you got.";
}

const MS_PER_HOUR = 3_600_000;

/**
 * The instant to store for a date the user picked. Today keeps the real time; an earlier day is stored at
 * noon Asia/Manila, which is the calendar day SQL reads it as (entry_local_date), whatever the browser's zone.
 */
export function occurredAtFor(dateIso: string, todayIso: string, nowMs: number): number {
  if (dateIso === todayIso) return nowMs;
  const m = ISO_RE.exec(dateIso);
  if (!m) throw new RangeError(`not an ISO date: ${dateIso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 4, 0, 0); // 12:00 at UTC+8
}

/** Whole hours between the income landing and now, never negative (analytics `hours_since_landed`). */
export function hoursSince(occurredAt: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - occurredAt) / MS_PER_HOUR));
}

// ---------------------------------------------------------------- server errors in plain words

export const SAVE_FAILED = "Couldn't save. Check your connection and try again.";

/** Maps a database refusal from `confirm_incomes` to a sentence that says what's wrong and how to fix it. */
export function confirmErrorText(message: string): string {
  if (/Needs a job/i.test(message)) return "One of these still needs a job. Pick one for it, then confirm again.";
  if (/Rent cannot be picked/i.test(message)) return "Rent can't be picked for a one-off. Choose another bucket.";
  if (/kept in/i.test(message)) return "A bucket in this split has no account to be kept in. Set one in Plans, then confirm again.";
  if (/not found|not yours|not an inflow|deleted/i.test(message)) return "One of these incomes changed or was removed. Reload the page and check it.";
  return "Couldn't confirm. Nothing was changed. Check your connection and try again.";
}

// ---------------------------------------------------------------- small view helpers

/** The line under "Use its rule" on the job card. */
export function ruleCardText(source: MiSource | undefined, buckets: readonly MiBucket[]): string {
  if (!source) return "This income has no source, so pick a job.";
  switch (source.rule) {
    case "ask":
      return "This source asks you each time, so pick below.";
    case "own": {
      const r = splitOwn(0, source.splitLines);
      if (r.kind !== "split") return needsJobText("own_split_incomplete", r.totalBp);
      return ruleJobText(source, buckets).text;
    }
    case "whole":
      return source.wholeBucketId ? ruleJobText(source, buckets).text : needsJobText("whole_bucket_missing");
    case "plan":
      return "Split by my plan";
  }
}

/** The slip once nothing is waiting: what the latest cycle confirmed. */
export function buildDoneSlip(done: readonly MiDone[]): SlipModel {
  const lines = done.map((d) => ({ bucketId: d.entryId, name: d.name, hue: null, amount: d.amountMinor }));
  const n = done.length;
  return {
    scope: "all",
    title: "Confirmed",
    meta: n === 0 ? "Nothing confirmed yet" : `${n} ${n === 1 ? "income" : "incomes"} given a job`,
    lines,
    total: lines.reduce((t, l) => t + l.amount, 0),
    unassigned: 0,
    why: null,
    note: null,
  };
}
