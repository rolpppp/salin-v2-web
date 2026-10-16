/**
 * Starting money (ticket 38, P-14): money already sitting in an account that no bucket knows about.
 * `suggestStart` pre-fills where it could go; the person edits every amount and only Save writes anything.
 * Integer centavos throughout; the lines for an account always add up to what is not in a bucket there.
 */
import { assertMinor, mulDivRound, sum } from "./core";
import type { Minor } from "./core";

export interface StartKeptBucket {
  id: string;
  /** The active plan's percentage for this bucket, in basis points. 0 for a bucket the plan skips. */
  percentBp: number;
  /** Planless buckets (e.g. a scholarship) get nothing from a plan. */
  planless: boolean;
  displayOrder: number;
  /** The Emergency fund takes the rounding remainder (BR §2.4) when it has a share. */
  isEmergency?: boolean;
}

export interface StartAccountInput {
  id: string;
  /** Real balance minus what the buckets say should be here. Only a positive amount is suggested. */
  unbucketedMinor: Minor;
  /** Live buckets kept in this account. */
  keptBuckets: readonly StartKeptBucket[];
}

export interface StartLine {
  accountId: string;
  bucketId: string;
  amountMinor: Minor;
}

const byOrder = (a: StartKeptBucket, b: StartKeptBucket) => a.displayOrder - b.displayOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Splits one account's money between the buckets kept there, by plan percentages renormalised among them.
 * Each share is round-half-up; the remainder (can be negative) goes to the Emergency fund if it has a share, else the
 * largest share (first by display order on a tie), never taking a line below 0. If every kept bucket is at 0% or
 * planless, everything goes to the first of them by display order. Returns one line per kept bucket (zeros included).
 */
export function splitAmongKept(amount: Minor, kept: readonly StartKeptBucket[]): { bucketId: string; amountMinor: Minor }[] {
  assertMinor(amount);
  const ordered = [...kept].sort(byOrder);
  if (ordered.length === 0 || amount <= 0) return ordered.map((b) => ({ bucketId: b.id, amountMinor: 0 }));
  const bps = ordered.map((b) => (b.planless ? 0 : Math.max(0, b.percentBp)));
  const total = sum(bps);
  if (total === 0) return ordered.map((b, i) => ({ bucketId: b.id, amountMinor: i === 0 ? amount : 0 }));
  const shares = bps.map((bp) => mulDivRound(amount, bp, total));
  let remainder = amount - sum(shares);
  let target = 0;
  for (let i = 1; i < bps.length; i++) if ((bps[i] as number) > (bps[target] as number)) target = i;
  const em = ordered.findIndex((b) => b.isEmergency === true);
  if (em >= 0 && (bps[em] as number) > 0) target = em;
  if (remainder >= 0) shares[target] = (shares[target] as number) + remainder;
  else {
    // Take it back from the target, then from the largest others, never below 0.
    const order = [target, ...shares.map((_, i) => i).filter((i) => i !== target).sort((a, b) => (bps[b] as number) - (bps[a] as number) || a - b)];
    for (const i of order) {
      if (remainder === 0) break;
      const take = Math.min(-remainder, shares[i] as number);
      shares[i] = (shares[i] as number) - take;
      remainder += take;
    }
  }
  return ordered.map((b, i) => ({ bucketId: b.id, amountMinor: shares[i] as number }));
}

/**
 * The pre-filled sort (P-14 decision 3). An account that keeps one or more buckets splits its money among them by the
 * plan's percentages; an account that keeps none puts it all in Spending. Accounts with nothing to sort (zero or
 * negative gap) get no lines. An account with no kept bucket and no Spending bucket to send it to gets no lines.
 */
export function suggestStart(args: { accounts: readonly StartAccountInput[]; spendingBucketId: string | null }): StartLine[] {
  const out: StartLine[] = [];
  for (const a of args.accounts) {
    if (!(a.unbucketedMinor > 0)) continue;
    if (a.keptBuckets.length === 0) {
      if (args.spendingBucketId) out.push({ accountId: a.id, bucketId: args.spendingBucketId, amountMinor: a.unbucketedMinor });
      continue;
    }
    for (const l of splitAmongKept(a.unbucketedMinor, a.keptBuckets)) out.push({ accountId: a.id, bucketId: l.bucketId, amountMinor: l.amountMinor });
  }
  return out;
}

/** What an account still has to sort after the amounts typed so far (negative: more than is there). */
export function leftToSort(unbucketedMinor: Minor, amounts: readonly Minor[]): Minor {
  return unbucketedMinor - sum(amounts);
}

export type GapKind = "even" | "unbucketed" | "overcounted";

/** Real balance vs "by your buckets": which way the gap goes and by how much (always positive). */
export function accountGap(balanceMinor: Minor, shouldHoldMinor: Minor): { kind: GapKind; amountMinor: Minor } {
  const d = balanceMinor - shouldHoldMinor;
  return d === 0 ? { kind: "even", amountMinor: 0 } : d > 0 ? { kind: "unbucketed", amountMinor: d } : { kind: "overcounted", amountMinor: -d };
}
