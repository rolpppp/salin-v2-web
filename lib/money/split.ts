import { BP_TOTAL, assertBp, assertMinor, bpShare, sum } from "./core";
import type { Bp, IsoDate, Minor } from "./core";

export type BucketId = string;

/** One bucket's percentage in a plan or an own split. */
export interface PercentLine {
  bucketId: BucketId;
  bp: Bp;
}

/** One bucket's amount in a computed split. */
export interface SplitLine {
  bucketId: BucketId;
  amount: Minor;
}

export type NoJobReason = "ask" | "own_split_incomplete" | "whole_bucket_missing";

export type SplitResult =
  | { kind: "split"; lines: SplitLine[] }
  | { kind: "no_job"; reason: NoJobReason; totalBp?: Bp };

function assertSumsToAmount(lines: readonly SplitLine[], amount: Minor): void {
  const total = sum(lines.map((l) => l.amount));
  if (total !== amount) {
    throw new Error(`split invariant broken: parts sum to ${total}, expected ${amount}`);
  }
}

/** Index of the largest `bp`, first in the given order on a tie. */
function indexOfLargest(bps: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < bps.length; i++) {
    if ((bps[i] as number) > (bps[best] as number)) best = i;
  }
  return best;
}

/**
 * Adds the §2.4 remainder to `shares[target]` in place. A positive remainder goes to the target.
 * PM decision 2026-10-11, pending owner confirmation: lines are never negative. A negative
 * remainder is taken from the target down to 0, then the rest from the other lines in descending
 * bp order (ties: bucket order), each down to 0. The total stays exactly the amount.
 */
function applyRemainder(shares: number[], bps: readonly number[], target: number, remainder: number): void {
  if (remainder >= 0) {
    shares[target] = (shares[target] as number) + remainder;
    return;
  }
  let owed = -remainder;
  const order = [target, ...shares.map((_, i) => i).filter((i) => i !== target).sort((a, b) => (bps[b] as number) - (bps[a] as number) || a - b)];
  for (const i of order) {
    if (owed === 0) break;
    const take = Math.min(owed, Math.max(0, shares[i] as number));
    shares[i] = (shares[i] as number) - take;
    owed -= take;
  }
  if (owed !== 0) throw new Error("split invariant broken: cannot absorb negative remainder");
}

export interface RentRedirect {
  rentBucketId: BucketId;
  /** Rent starts on this date (default rule: 2027-01-01). Income dated before it redirects. */
  startDate: IsoDate;
}

export interface PlanSplitOptions {
  /** The income's own date (`occurredAt`), NOT the confirm date (D-17). ISO `YYYY-MM-DD`. */
  onDate: IsoDate;
  /** Every bucket in display order. Output has one line per bucket in this order. Order breaks ties. */
  buckets: readonly BucketId[];
  emergencyBucketId: BucketId;
  /** Omit/null when there is no rent rule. */
  rentRedirect?: RentRedirect | null;
}

/** Plan percentages after applying the rent redirect for `onDate` (BR §2.2.2). Returns bp per bucket in `buckets` order. */
export function effectivePlanBp(planLines: readonly PercentLine[], opts: PlanSplitOptions): Bp[] {
  const known = new Set(opts.buckets);
  const bp = new Map<BucketId, Bp>();
  for (const l of planLines) {
    assertBp(l.bp, `plan bp for ${l.bucketId}`);
    if (!known.has(l.bucketId)) throw new Error(`plan line for unknown bucket ${l.bucketId}`);
    if (bp.has(l.bucketId)) throw new Error(`duplicate plan line for bucket ${l.bucketId}`);
    bp.set(l.bucketId, l.bp);
  }
  const total = sum([...bp.values()]);
  if (total !== BP_TOTAL) throw new Error(`plan must total ${BP_TOTAL} bp, got ${total}`);
  if (!known.has(opts.emergencyBucketId)) throw new Error("emergencyBucketId is not in buckets");
  const r = opts.rentRedirect;
  if (r && opts.onDate < r.startDate) {
    const rent = bp.get(r.rentBucketId) ?? 0;
    bp.set(r.rentBucketId, 0);
    bp.set(opts.emergencyBucketId, (bp.get(opts.emergencyBucketId) ?? 0) + rent);
  }
  return opts.buckets.map((id) => bp.get(id) ?? 0); // planless buckets: 0%
}

/**
 * `plan` job (BR §2.2, §2.4). Each share is round_half_up(amount * bp / 10000); the remainder
 * (amount - sum of shares, possibly negative) goes to the Emergency fund, or, when the Emergency
 * fund has 0% after the redirect, to the largest percentage (first in bucket order on a tie).
 * Planless buckets get 0. Output has one line per bucket, in `buckets` order, zeros included.
 */
export function splitByPlan(amount: Minor, planLines: readonly PercentLine[], opts: PlanSplitOptions): SplitLine[] {
  assertMinor(amount);
  if (amount < 0) throw new RangeError("amount must be >= 0");
  const bps = effectivePlanBp(planLines, opts);
  const shares = bps.map((bp) => bpShare(amount, bp));
  const remainder = amount - sum(shares);
  const emergencyIdx = opts.buckets.indexOf(opts.emergencyBucketId);
  const target = (bps[emergencyIdx] as number) > 0 ? emergencyIdx : indexOfLargest(bps);
  applyRemainder(shares, bps, target, remainder);
  const lines = opts.buckets.map((bucketId, i) => ({ bucketId, amount: shares[i] as number }));
  assertSumsToAmount(lines, amount);
  return lines;
}

/**
 * `own` job (BR §2.3). The source's percentages must total exactly 10000 bp, otherwise the
 * income has no job (never rescale). Buckets at 0% are left out. The remainder goes to the
 * largest-percentage bucket (first in the given order on a tie).
 */
export function splitOwn(amount: Minor, lines: readonly PercentLine[]): SplitResult {
  assertMinor(amount);
  if (amount < 0) throw new RangeError("amount must be >= 0");
  for (const l of lines) assertBp(l.bp, `own bp for ${l.bucketId}`);
  const totalBp = sum(lines.map((l) => l.bp));
  if (totalBp !== BP_TOTAL) return { kind: "no_job", reason: "own_split_incomplete", totalBp };
  const used = lines.filter((l) => l.bp > 0);
  const shares = used.map((l) => bpShare(amount, l.bp));
  const remainder = amount - sum(shares);
  const big = indexOfLargest(used.map((l) => l.bp));
  applyRemainder(shares, used.map((l) => l.bp), big, remainder);
  const out = used.map((l, i) => ({ bucketId: l.bucketId, amount: shares[i] as number }));
  assertSumsToAmount(out, amount);
  return { kind: "split", lines: out };
}

/** `whole` job (BR §2.5): 100% to one bucket. */
export function splitWhole(amount: Minor, bucketId: BucketId): SplitLine[] {
  assertMinor(amount);
  return [{ bucketId, amount }];
}

/**
 * `one` job (BR §2.5): all to the bucket chosen now, defaulting to the Emergency fund.
 * Rent cannot be picked.
 */
export function splitOne(
  amount: Minor,
  pickedBucketId: BucketId | null | undefined,
  ctx: { emergencyBucketId: BucketId; rentBucketId?: BucketId },
): SplitLine[] {
  const id = pickedBucketId ?? ctx.emergencyBucketId;
  if (ctx.rentBucketId !== undefined && id === ctx.rentBucketId) {
    throw new Error("Rent cannot be picked for a one-off income");
  }
  return splitWhole(amount, id);
}

// ---------------------------------------------------------------- jobs (BR §2.1)

export type JobKind = "plan" | "own" | "whole" | "one";
export type SourceRule = "plan" | "own" | "whole" | "ask";

export interface IncomeJobChoice {
  /** The job the user picked for this income, or null/undefined to use the source's rule. */
  job?: JobKind | null;
  /** For `one`: the bucket picked now (defaults to Emergency). */
  oneBucketId?: BucketId | null;
}

export interface SourceJobRule {
  rule: SourceRule;
  wholeBucketId?: BucketId | null;
  /** The source's own split (may total != 10000; then `own` has no job). */
  splitLines?: readonly PercentLine[];
}

export type ResolvedJob =
  | { kind: "job"; job: "plan" }
  | { kind: "job"; job: "own"; lines: readonly PercentLine[] }
  | { kind: "job"; job: "whole"; bucketId: BucketId }
  | { kind: "job"; job: "one"; bucketId: BucketId | null }
  | { kind: "no_job"; reason: NoJobReason; totalBp?: Bp };

/** Which job an income gets (BR §2.1). An income with no job is never confirmed by "Confirm all". */
export function resolveJob(income: IncomeJobChoice, source: SourceJobRule): ResolvedJob {
  const job: JobKind | "ask" = income.job ?? source.rule;
  switch (job) {
    case "ask":
      return { kind: "no_job", reason: "ask" };
    case "plan":
      return { kind: "job", job: "plan" };
    case "own": {
      const lines = source.splitLines ?? [];
      const totalBp = sum(lines.map((l) => l.bp));
      if (totalBp !== BP_TOTAL) return { kind: "no_job", reason: "own_split_incomplete", totalBp };
      return { kind: "job", job: "own", lines };
    }
    case "whole":
      if (!source.wholeBucketId) return { kind: "no_job", reason: "whole_bucket_missing" };
      return { kind: "job", job: "whole", bucketId: source.wholeBucketId };
    case "one":
      return { kind: "job", job: "one", bucketId: income.oneBucketId ?? null };
  }
}

// ---------------------------------------------------------------- active plan (D-14)

export type PlanKey = "A" | "B";

/**
 * Active plan (BR §2.2.1 with D-14): Plan A until the SUM OF ALL Emergency allocations ever
 * (withdrawals ignored) reaches the switch target, then Plan B. Evaluate before the income
 * being confirmed is added. This is the one function to change if the measure changes.
 */
export function activePlan(emergencyAllocatedSoFar: Minor, switchTarget: Minor, switchOn = true): PlanKey {
  assertMinor(emergencyAllocatedSoFar, "emergencyAllocatedSoFar");
  assertMinor(switchTarget, "switchTarget");
  return switchOn && emergencyAllocatedSoFar >= switchTarget ? "B" : "A";
}

// ---------------------------------------------------------------- confirm in date order

export interface ConfirmIncome {
  id: string;
  /** The income's own date (`occurredAt`), ISO. */
  date: IsoDate;
  amount: Minor;
  choice: IncomeJobChoice;
  source: SourceJobRule;
}

export interface ConfirmContext {
  planA: readonly PercentLine[];
  planB: readonly PercentLine[];
  buckets: readonly BucketId[];
  emergencyBucketId: BucketId;
  rentRedirect?: RentRedirect | null;
  /** Σ of all Emergency allocations already confirmed (D-14). */
  emergencyAllocatedSoFar: Minor;
  switchTarget: Minor;
  switchOn?: boolean;
}

export type ConfirmedIncome =
  | {
      id: string;
      confirmed: true;
      job: JobKind;
      /** Present for `plan` jobs: the plan that was active when this income was confirmed. */
      planKey?: PlanKey;
      lines: SplitLine[];
    }
  | { id: string; confirmed: false; reason: NoJobReason; totalBp?: Bp };

/** The lines a job produces, or null when the job needs a plan evaluation. */
export function allocateIncome(
  amount: Minor,
  date: IsoDate,
  job: Extract<ResolvedJob, { kind: "job" }>,
  planKey: PlanKey,
  ctx: ConfirmContext,
): SplitLine[] {
  switch (job.job) {
    case "plan":
      return splitByPlan(amount, planKey === "A" ? ctx.planA : ctx.planB, {
        onDate: date,
        buckets: ctx.buckets,
        emergencyBucketId: ctx.emergencyBucketId,
        rentRedirect: ctx.rentRedirect ?? null,
      });
    case "own": {
      const r = splitOwn(amount, job.lines);
      if (r.kind !== "split") throw new Error("own split must be complete here");
      return r.lines;
    }
    case "whole":
      return splitWhole(amount, job.bucketId);
    case "one":
      return splitOne(amount, job.bucketId, { emergencyBucketId: ctx.emergencyBucketId });
  }
}

/**
 * Confirm several incomes at once, in date order (stable on ties, input order). The active plan is
 * evaluated for each income before it is added, and the running Emergency total includes the
 * incomes confirmed earlier in the same go, so the first can switch the plan for the next
 * (BR §2.2.1). Incomes with no job are returned unconfirmed and do not affect the running total.
 * Results are returned in confirm order.
 */
export function confirmIncomes(incomes: readonly ConfirmIncome[], ctx: ConfirmContext): ConfirmedIncome[] {
  const ordered = incomes.map((inc, i) => ({ inc, i })).sort((a, b) => (a.inc.date < b.inc.date ? -1 : a.inc.date > b.inc.date ? 1 : a.i - b.i));
  let emergency = ctx.emergencyAllocatedSoFar;
  const out: ConfirmedIncome[] = [];
  for (const { inc } of ordered) {
    const job = resolveJob(inc.choice, inc.source);
    if (job.kind === "no_job") {
      out.push({ id: inc.id, confirmed: false, reason: job.reason, ...(job.totalBp !== undefined ? { totalBp: job.totalBp } : {}) });
      continue;
    }
    const planKey = activePlan(emergency, ctx.switchTarget, ctx.switchOn ?? true);
    const lines = allocateIncome(inc.amount, inc.date, job, planKey, ctx);
    emergency += lines.filter((l) => l.bucketId === ctx.emergencyBucketId).reduce((t, l) => t + l.amount, 0);
    out.push({ id: inc.id, confirmed: true, job: job.job, ...(job.job === "plan" ? { planKey } : {}), lines });
  }
  return out;
}
