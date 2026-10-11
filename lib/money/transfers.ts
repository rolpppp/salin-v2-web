import { assertMinor } from "./core";
import type { Minor } from "./core";

export type AccountId = string;

/** One confirmed allocation line (BR §3.1). */
export interface TransferAllocation {
  /** The account the income landed in. */
  fromAccountId: AccountId;
  /** The line's SNAPSHOTTED destination account (never the bucket's current "kept in"). */
  destAccountId: AccountId;
  amount: Minor;
  /** Bucket short name, for display ("Living, Fun"). */
  label?: string;
}

/** A transfer already ticked as sent (BR §3.6): the amount actually sent for an account pair. */
export interface SentCheck {
  fromAccountId: AccountId;
  toAccountId: AccountId;
  sentMinor: Minor;
}

export type TransferStatus = "unsent" | "partial" | "done" | "oversent";

export interface TransferRow {
  fromAccountId: AccountId;
  toAccountId: AccountId;
  /** Current amount to send (after netting). */
  amount: Minor;
  /** Amount stays put on the other side thanks to netting ("₱350.00 less"). 0 when not netted. */
  netted: Minor;
  /** What was ticked as sent. 0 when not ticked. */
  sent: Minor;
  /** Done only if sent === amount (BR §3.7). */
  done: boolean;
  status: TransferStatus;
  /** "Send ₱X more": amount - sent when 0 < sent < amount, else 0. */
  sendMore: Minor;
  labels: string[];
}

export interface KeepRow {
  accountId: AccountId;
  /** Amount to keep, including netted money. */
  amount: Minor;
  /** Part of `amount` that is kept because of netting ("includes ₱350.00 kept by netting"). */
  netted: Minor;
  labels: string[];
}

export interface TransferPlan {
  keeps: KeepRow[];
  transfers: TransferRow[];
}

interface Pair {
  from: AccountId;
  to: AccountId;
  amount: Minor;
  netted: Minor;
  labels: string[];
}

const key = (a: AccountId, b: AccountId): string => JSON.stringify([a, b]);

function addLabel(list: string[], label: string | undefined): void {
  if (label !== undefined && !list.includes(label)) list.push(label);
}

/**
 * The transfer checklist (BR §3.1 to §3.7). Deterministic: rows come out in order of first
 * appearance in `allocations`.
 *
 *  1. from = landed account, to = snapshotted destination.
 *  2. from === to: a keep row (no transfer).
 *  3. Group the rest by (from, to) and sum.
 *  4. Netting: money flowing both ways between two accounts is reduced by the smaller of the
 *     two; each side keeps the netted amount.
 *  5. Never net over a sent transfer: if either direction has a sent amount (> 0) that differs
 *     from the amount it would have after netting, that pair is not netted.
 *  7. done only if sent === amount; otherwise show `sendMore`.
 */
export function transferPlan(allocations: readonly TransferAllocation[], sentChecks: readonly SentCheck[] = []): TransferPlan {
  const sentBy = new Map<string, Minor>();
  for (const c of sentChecks) {
    assertMinor(c.sentMinor, "sentMinor");
    const k = key(c.fromAccountId, c.toAccountId);
    sentBy.set(k, (sentBy.get(k) ?? 0) + c.sentMinor);
  }

  const pairs = new Map<string, Pair>();
  const keeps = new Map<AccountId, KeepRow>();
  const keepFor = (id: AccountId): KeepRow => {
    let k = keeps.get(id);
    if (!k) {
      k = { accountId: id, amount: 0, netted: 0, labels: [] };
      keeps.set(id, k);
    }
    return k;
  };

  for (const a of allocations) {
    assertMinor(a.amount, "allocation amount");
    if (a.amount === 0) continue;
    if (a.fromAccountId === a.destAccountId) {
      const k = keepFor(a.destAccountId);
      k.amount += a.amount;
      addLabel(k.labels, a.label);
    } else {
      const k = key(a.fromAccountId, a.destAccountId);
      let p = pairs.get(k);
      if (!p) {
        p = { from: a.fromAccountId, to: a.destAccountId, amount: 0, netted: 0, labels: [] };
        pairs.set(k, p);
      }
      p.amount += a.amount;
      addLabel(p.labels, a.label);
    }
  }

  for (const pa of pairs.values()) {
    const qk = key(pa.to, pa.from);
    const q = pairs.get(qk);
    if (!q || pa.amount <= 0 || q.amount <= 0) continue;
    const m = Math.min(pa.amount, q.amount);
    const sentPa = sentBy.get(key(pa.from, pa.to)) ?? 0;
    const sentQ = sentBy.get(qk) ?? 0;
    if ((sentPa > 0 && sentPa !== pa.amount - m) || (sentQ > 0 && sentQ !== q.amount - m)) continue;
    pa.amount -= m;
    q.amount -= m;
    const survivor = pa.amount > 0 ? pa : q;
    survivor.netted += m;
    // pa's sender keeps m for q's buckets; q's sender keeps m for pa's buckets.
    const a = keepFor(pa.from);
    a.amount += m;
    a.netted += m;
    for (const l of q.labels) addLabel(a.labels, l);
    const b = keepFor(q.from);
    b.amount += m;
    b.netted += m;
    for (const l of pa.labels) addLabel(b.labels, l);
  }

  const transfers: TransferRow[] = [];
  for (const [k, p] of pairs) {
    if (p.amount <= 0) continue;
    const sent = sentBy.get(k) ?? 0;
    const status: TransferStatus = sent === 0 ? "unsent" : sent === p.amount ? "done" : sent < p.amount ? "partial" : "oversent";
    transfers.push({
      fromAccountId: p.from,
      toAccountId: p.to,
      amount: p.amount,
      netted: p.netted,
      sent,
      done: sent === p.amount,
      status,
      sendMore: status === "partial" ? p.amount - sent : 0,
      labels: p.labels,
    });
  }
  return { keeps: [...keeps.values()], transfers };
}

/** BR §3.8: no income waiting, at least one confirmed, and every transfer done. */
export function allMoneyHasHome(input: { waitingCount: number; confirmedCount: number; transfers: readonly TransferRow[] }): boolean {
  return input.waitingCount === 0 && input.confirmedCount >= 1 && input.transfers.every((t) => t.done);
}
