import { assertMinor, floorDiv, sum } from "./core";
import type { Minor } from "./core";

export interface BucketFlows {
  /** Σ allocations in. */
  allocated: Minor;
  /** Σ spending out. */
  spent: Minor;
  coversIn: Minor;
  coversOut: Minor;
}

/** BR §4.2: left = Σ allocations − Σ spending + Σ covers in − Σ covers out. May be negative. */
export function bucketLeft(f: BucketFlows): Minor {
  return sum([f.allocated, -f.spent, f.coversIn, -f.coversOut]);
}

/** BR §4.3: how much an overspent bucket needs (0 when not overspent). */
export function bucketNeeds(left: Minor): Minor {
  assertMinor(left, "left");
  return left < 0 ? -left : 0;
}

export function isOverspent(left: Minor): boolean {
  return left < 0;
}

export interface CoverOffer {
  /** Amount to move from Buffer: min(deficit, left(Buffer)), never below 0. */
  cover: Minor;
  /** Still missing after the cover; offer another bucket for this. */
  stillNeeded: Minor;
}

/**
 * Cover from Buffer (BR §4.3, D-19): move min(deficit, left(Buffer)); if Buffer is short,
 * cover what is there and name the rest. Never moves money by itself.
 */
export function coverFromBuffer(bucketLeftMinor: Minor, bufferLeftMinor: Minor): CoverOffer {
  const deficit = bucketNeeds(bucketLeftMinor);
  assertMinor(bufferLeftMinor, "bufferLeft");
  const cover = Math.min(deficit, Math.max(0, bufferLeftMinor));
  return { cover, stillNeeded: deficit - cover };
}

/** BR §4.4: safe to spend = Σ left over the Spend group. May be negative; shown as is. */
export function safeToSpend(spendBucketLefts: readonly Minor[]): Minor {
  return sum(spendBucketLefts);
}

/**
 * BR §4.4: per day = floor(safe / days until next payday), never below 0.
 * `days` below 1 (payday today or past) counts as 1: the whole safe amount is for today.
 */
export function perDay(safe: Minor, daysUntilPayday: number): Minor {
  assertMinor(safe, "safe");
  if (!Number.isSafeInteger(daysUntilPayday)) throw new RangeError("days must be an integer");
  const days = Math.max(1, daysUntilPayday);
  return Math.max(0, floorDiv(safe, days));
}

export interface AccountHoldInput {
  /** Σ allocation lines whose snapshotted destination is this account. */
  allocationsHere: Minor;
  /** For each bucket currently KEPT in this account: covers in − covers out − spending. */
  bucketsKeptHere: readonly { coversIn: Minor; coversOut: Minor; spent: Minor }[];
}

/** BR §5.1: what an account should hold, by the buckets. */
export function accountShouldHold(input: AccountHoldInput): Minor {
  return sum([input.allocationsHere, ...input.bucketsKeptHere.map((b) => b.coversIn - b.coversOut - b.spent)]);
}

/** Impact line for logging spending (BR §11.3): left after and the new per-day figure. */
export function spendingImpact(args: { bucketLeft: Minor; amount: Minor; safe: Minor; daysUntilPayday: number; isSpendBucket: boolean }): {
  leftAfter: Minor;
  perDayAfter: Minor | null;
} {
  return {
    leftAfter: args.bucketLeft - args.amount,
    perDayAfter: args.isSpendBucket ? perDay(args.safe - args.amount, args.daysUntilPayday) : null,
  };
}
