/**
 * Step 2 "Move the money" (SPEC §2.4, BR §3): the row model, the optimistic tick, the completion card
 * lines and the mapping of tick/untick errors to copy. Pure: the numbers come from SQL `transfer_plan()`.
 */
import { formatPeso } from "@/lib/money";
import type { MiAccount, MiBucket, MiDone, MiTransferRow } from "./money-in-model";

export const TICK_FAILED = "Couldn't save that transfer. Nothing was changed. Check your connection and try again.";
export const UNTICK_FAILED = "Couldn't undo that transfer. Nothing was changed. Check your connection and try again.";
export const TRANSFER_STALE = "This transfer changed. Reload the page to see the latest amounts.";
export const TRANSFER_GONE = "That transfer isn't available any more. Reload the page and try again.";
export const NOT_SIGNED_IN = "Your session ended. Sign in again, then try again.";

export const pairKey = (from: string, to: string): string => JSON.stringify([from, to]);

export interface KeepRowView {
  key: string;
  accountId: string;
  title: string;
  detail: string;
  amount: number;
}

export interface TransferRowView {
  key: string;
  from: string;
  to: string;
  /** What ticking sends as the running total for the pair. */
  amount: number;
  sent: number;
  checked: boolean;
  partial: boolean;
  /** Sent more than is now needed (an income was removed). Not checked; can be undone. */
  oversent: boolean;
  /** "Send ₱X to Tonik" / "Send ₱X more to Tonik". */
  title: string;
  detail: string;
  /** Accessible name for the checkbox. */
  label: string;
}

export interface MoveModel {
  keeps: KeepRowView[];
  transfers: TransferRowView[];
  sentCount: number;
  total: number;
}

const accountName = (accounts: readonly MiAccount[], id: string): string => accounts.find((a) => a.id === id)?.name ?? "an account";

export function buildMoveModel(plan: readonly MiTransferRow[], accounts: readonly MiAccount[], buckets: readonly MiBucket[]): MoveModel {
  const names = (ids: readonly string[]) => ids.map((id) => buckets.find((b) => b.id === id)?.name ?? "a bucket").join(", ");
  const keeps: KeepRowView[] = [];
  const transfers: TransferRowView[] = [];
  for (const r of plan) {
    if (r.kind === "keep") {
      const acct = accountName(accounts, r.fromAccountId);
      const parts = [names(r.bucketIds), "already there"];
      if (r.netted > 0) parts.push(`includes ${formatPeso(r.netted)} kept by netting`);
      keeps.push({ key: pairKey(r.fromAccountId, r.toAccountId), accountId: r.fromAccountId, title: `Keep ${formatPeso(r.amount)} in ${acct}`, detail: parts.filter(Boolean).join(" · "), amount: r.amount });
      continue;
    }
    const from = accountName(accounts, r.fromAccountId);
    const to = accountName(accounts, r.toAccountId);
    const partial = r.status === "partial";
    const oversent = r.status === "oversent";
    const checked = r.done;
    const title = partial ? `Send ${formatPeso(r.sendMore)} more to ${to}` : `Send ${formatPeso(r.amount)} to ${to}`;
    const parts = [names(r.bucketIds), `from ${from}`];
    if (partial || oversent) parts.push(`${formatPeso(r.sent)} already sent`);
    if (r.netted > 0) parts.push(`${formatPeso(r.netted)} less: that much stays put on the other side instead of coming back`);
    transfers.push({
      key: pairKey(r.fromAccountId, r.toAccountId),
      from: r.fromAccountId,
      to: r.toAccountId,
      amount: r.amount,
      sent: r.sent,
      checked,
      partial,
      oversent,
      title,
      detail: parts.filter(Boolean).join(" · "),
      label: title,
    });
  }
  return { keeps, transfers, sentCount: transfers.filter((t) => t.checked).length, total: transfers.length };
}

/** "{sent} of {total} sent". */
export const sentText = (sent: number, total: number): string => `${sent} of ${total} sent`;

/** What the screen shows at once when a box is ticked or unticked, before the server answers. */
export function applyTick(plan: readonly MiTransferRow[], key: string, sent: number): MiTransferRow[] {
  return plan.map((r) => {
    if (r.kind !== "transfer" || pairKey(r.fromAccountId, r.toAccountId) !== key) return r;
    const status = sent === 0 ? "unsent" : sent === r.amount ? "done" : sent < r.amount ? "partial" : "oversent";
    return { ...r, sent, done: sent === r.amount, status, sendMore: status === "partial" ? r.amount - sent : 0 };
  });
}

/** Announcement after a tick or untick: "Sent. 2 to go." */
export function tickAnnouncement(ticked: boolean, left: number): string {
  if (!ticked) return left === 1 ? "Unticked. 1 transfer to send." : `Unticked. ${left} transfers to send.`;
  if (left === 0) return "Sent. Every transfer is sent.";
  return `Sent. ${left} to go.`;
}

export interface CompletionLines {
  headline: string;
  lines: string[];
}

/** The completion card (SPEC §2.4). The conditional lines (Living back above zero, a goal milestone) are not derivable here. */
export function completionLines(done: readonly MiDone[]): CompletionLines {
  const total = done.reduce((t, d) => t + d.amountMinor, 0);
  const n = done.length;
  return {
    headline: "All money in has a home.",
    lines: [`${formatPeso(total)} from ${n} ${n === 1 ? "source" : "sources"} now has a job`, "Your accounts match your buckets"],
  };
}

export type TickOutcome = { kind: "already" } | { kind: "error"; error: string };

/**
 * Maps a Postgres error from `tick_transfer` to what the person sees.
 * P0001 "already sent ..." (or a cycle that just closed because this pair was the last one) means the transfer
 * is already ticked, e.g. after a double click or a retry: that is success, not an error.
 */
export function tickOutcome(error: { code?: string; message: string }): TickOutcome {
  switch (error.code) {
    case "P0001":
      if (/^already sent/i.test(error.message)) return { kind: "already" };
      if (/^no open transfer cycle/i.test(error.message)) return { kind: "error", error: TRANSFER_STALE };
      return { kind: "error", error: TICK_FAILED };
    case "P0002":
    case "42501":
      return { kind: "error", error: TRANSFER_GONE };
    case "28000":
      return { kind: "error", error: NOT_SIGNED_IN };
    default:
      return { kind: "error", error: TICK_FAILED };
  }
}

export type UntickOutcome = { kind: "already" } | { kind: "error"; error: string };

/** Maps an `untick_transfer` error. P0002 "nothing ticked" means it is already unticked. */
export function untickOutcome(error: { code?: string; message: string }): UntickOutcome {
  switch (error.code) {
    case "P0002":
      return { kind: "already" };
    case "42501":
      return { kind: "error", error: TRANSFER_GONE };
    case "28000":
      return { kind: "error", error: NOT_SIGNED_IN };
    default:
      return { kind: "error", error: UNTICK_FAILED };
  }
}
