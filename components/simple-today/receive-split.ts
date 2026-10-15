/**
 * "I got money" split logic (SIMPLE_MONEY.md, ReceiveMoney). Pure, integer centavos, no floats.
 *
 * The person types the amount, picks the account it landed in, and optionally moves some of it to other
 * accounts. The received-in account holds the remainder automatically, so the rows always add up to the amount.
 * "Keep aside" is one amount that stays in the received-in account and goes to the keep bucket; the rest of the
 * received-in account's share is Spending.
 */
import { floorDiv } from "@/lib/money/core";

export type ReceiveLine = { bucketId: string; destAccountId: string; amountMinor: number };

export type SplitProblem = "no_amount" | "bad_row" | "over_moved" | "keep_too_big";

export type SplitInput = {
  /** What was received, centavos; null when the field is empty or invalid. */
  amountMinor: number | null;
  /** Centavos kept aside (0 for none). */
  keepMinor: number;
  receivedInId: string;
  /** Amounts the person sent on to other accounts. Rows for the received-in account, or of 0, are ignored. */
  moved: ReadonlyArray<{ accountId: string; minor: number }>;
  spendingBucketId: string;
  keepBucketId: string;
};

export type SplitResult =
  | {
      ok: true;
      /** What the received-in account keeps (spending + kept aside). */
      remainderMinor: number;
      /** amount - keep: what is yours to spend. */
      spendMinor: number;
      /** One line per (bucket, account), each > 0, summing to exactly the amount. */
      lines: ReceiveLine[];
    }
  | { ok: false; problem: SplitProblem };

export const SPLIT_MESSAGES: Record<SplitProblem, string> = {
  no_amount: "Enter the amount you received.",
  bad_row: "Check the amounts you are moving.",
  over_moved: "The amounts you are moving add up to more than you received.",
  keep_too_big: "You can keep aside only what stays in the account it landed in.",
};

const isMinor = (n: number) => Number.isSafeInteger(n) && n >= 0;

export function splitReceive(input: SplitInput): SplitResult {
  const { amountMinor, keepMinor, receivedInId, moved, spendingBucketId, keepBucketId } = input;
  if (amountMinor === null || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) return { ok: false, problem: "no_amount" };
  if (!isMinor(keepMinor)) return { ok: false, problem: "bad_row" };

  // One total per other account, in the order given.
  const order: string[] = [];
  const byAccount = new Map<string, number>();
  for (const m of moved) {
    if (!isMinor(m.minor)) return { ok: false, problem: "bad_row" };
    if (m.accountId === receivedInId || m.minor === 0) continue;
    if (!byAccount.has(m.accountId)) order.push(m.accountId);
    byAccount.set(m.accountId, (byAccount.get(m.accountId) ?? 0) + m.minor);
  }
  let movedTotal = 0;
  for (const v of byAccount.values()) movedTotal += v;
  if (movedTotal > amountMinor) return { ok: false, problem: "over_moved" };

  const remainderMinor = amountMinor - movedTotal;
  if (keepMinor > remainderMinor) return { ok: false, problem: "keep_too_big" };

  const lines: ReceiveLine[] = [];
  const spendHere = remainderMinor - keepMinor;
  if (spendHere > 0) lines.push({ bucketId: spendingBucketId, destAccountId: receivedInId, amountMinor: spendHere });
  if (keepMinor > 0) lines.push({ bucketId: keepBucketId, destAccountId: receivedInId, amountMinor: keepMinor });
  for (const id of order) lines.push({ bucketId: spendingBucketId, destAccountId: id, amountMinor: byAccount.get(id) ?? 0 });

  return { ok: true, remainderMinor, spendMinor: amountMinor - keepMinor, lines };
}

/**
 * About how much a day the spending money gives once this is saved: floor((left + new spending) / days).
 * A preview only; the saved number comes from the server. `daysUntil` is at least 1.
 */
export function paceAfter(spendableLeftMinor: number, addedSpendMinor: number, daysUntil: number): number {
  return floorDiv(spendableLeftMinor + addedSpendMinor, Math.max(1, daysUntil));
}

/** Moves the received-in account must send on, one per other account that got a line. */
export function movesOf(lines: readonly ReceiveLine[], receivedInId: string): Array<{ to: string; amountMinor: number }> {
  const out = new Map<string, number>();
  for (const l of lines) if (l.destAccountId !== receivedInId) out.set(l.destAccountId, (out.get(l.destAccountId) ?? 0) + l.amountMinor);
  return [...out].map(([to, amountMinor]) => ({ to, amountMinor }));
}
