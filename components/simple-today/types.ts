import type { ReceiveLine } from "./receive-split";

export type { SimpleTodayModel, ViewMode } from "./seam";

type Result = { ok: true } | { ok: false; error: string };

/** A line of spending on a day, optional on the model (the day drawer shows it when the data half provides it). */
export type DayItem = { id: string; label: string; amountMinor: number };

/**
 * Everything the Simple screens write. The server page passes this object (server actions) down as one prop,
 * so no client file imports a server module and tests can inject fakes. The adapters live in `seam.ts`.
 */
export type SimpleActions = {
  receiveMoney: (input: { amountMinor: number; receivedInId: string; sourceId: string | null; on: string; lines: ReceiveLine[] }) => Promise<Result>;
  setNoSpend: (input: { day: string; on: boolean }) => Promise<Result>;
  /** `day: null` clears the chosen date. */
  setSpendUntil: (input: { day: string | null }) => Promise<Result>;
  setKeepBucket: (input: { bucketId: string }) => Promise<Result>;
  setViewMode: (input: { mode: "simple" | "full" }) => Promise<Result>;
  /** The existing transfer tick (`tickTransferAction`). A P0001 "already sent" comes back as ok. */
  tickTransfer: (input: { from: string; to: string; amount: number }) => Promise<Result>;
};
