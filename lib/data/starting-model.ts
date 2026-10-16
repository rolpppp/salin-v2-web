import { leftToSort, suggestStart, type StartKeptBucket } from "@/lib/money/starting";

/**
 * Starting money (ticket 38): the "Sort the money you already have" card's groups, one per PHP account that holds money
 * no bucket knows about. Pure: the loader reads, this reshapes.
 */

export type StartAccountRow = { id: string; name: string; displayOrder: number; unbucketedMinor: number };
export type StartBucketRow = {
  id: string;
  name: string;
  hue: string | null;
  groupKey: string;
  keptInAccountId: string | null;
  displayOrder: number;
  isArchived: boolean;
  planless: boolean;
};

export type StartRowView = { bucketId: string; name: string; hue: string | null; suggestedMinor: number };
export type StartPick = { bucketId: string; name: string; hue: string | null };
export type StartGroup = {
  accountId: string;
  accountName: string;
  /** Money in this account that no bucket counts yet. Always above 0. */
  unbucketedMinor: number;
  /** The pre-filled rows (every bucket kept here, or Spending when none is). */
  rows: StartRowView[];
  /** Other live buckets the person can add a row for. */
  picks: StartPick[];
};

export function buildStartGroups(args: {
  accounts: readonly StartAccountRow[];
  buckets: readonly StartBucketRow[];
  /** The active plan's percentage per bucket, in basis points. Missing means 0. */
  percentBp: ReadonlyMap<string, number>;
}): StartGroup[] {
  const live = args.buckets.filter((b) => !b.isArchived).sort((a, b) => a.displayOrder - b.displayOrder || (a.id < b.id ? -1 : 1));
  // Spending: the Living bucket, else the first Spend-group bucket (same pick as Simple Today).
  const spend = live.filter((b) => b.groupKey === "spend");
  const spendId = (spend.find((b) => b.hue === "living") ?? spend[0])?.id ?? null;
  const byId = new Map(live.map((b) => [b.id, b]));
  const input = args.accounts
    .filter((a) => a.unbucketedMinor > 0)
    .sort((a, b) => a.displayOrder - b.displayOrder || (a.id < b.id ? -1 : 1))
    .map((a) => ({
      id: a.id,
      unbucketedMinor: a.unbucketedMinor,
      keptBuckets: live
        .filter((b) => b.keptInAccountId === a.id)
        .map<StartKeptBucket>((b) => ({ id: b.id, percentBp: args.percentBp.get(b.id) ?? 0, planless: b.planless, displayOrder: b.displayOrder, isEmergency: b.hue === "emergency" })),
    }));
  const lines = suggestStart({ accounts: input, spendingBucketId: spendId });
  const names = new Map(args.accounts.map((a) => [a.id, a.name]));
  return input.map((a) => {
    const mine = lines.filter((l) => l.accountId === a.id);
    const used = new Set(mine.map((l) => l.bucketId));
    // Rows for the buckets kept here show even at 0 so every one can be filled in; Spending shows alone for an account that keeps none.
    const rows = mine.flatMap((l) => {
      const b = byId.get(l.bucketId);
      return b ? [{ bucketId: b.id, name: b.name, hue: b.hue, suggestedMinor: l.amountMinor }] : [];
    });
    const picks = live.filter((b) => !used.has(b.id)).map((b) => ({ bucketId: b.id, name: b.name, hue: b.hue }));
    return { accountId: a.id, accountName: names.get(a.id) ?? "Account", unbucketedMinor: a.unbucketedMinor, rows, picks };
  });
}

/** Parsed amounts keyed by `startKey` -> the lines to send, or what is wrong. */
export const startKey = (accountId: string, bucketId: string) => `${accountId}|${bucketId}`;

export type StartPayloadLine = { bucketId: string; accountId: string; amountMinor: number };

export function startLines(
  groups: readonly StartGroup[],
  amounts: ReadonlyMap<string, number>,
  extraRows: ReadonlyMap<string, readonly string[]>,
): { lines: StartPayloadLine[]; over: StartGroup | null; totalMinor: number; accounts: number } {
  const lines: StartPayloadLine[] = [];
  let over: StartGroup | null = null;
  let totalMinor = 0;
  let accounts = 0;
  for (const g of groups) {
    const ids = [...g.rows.map((r) => r.bucketId), ...(extraRows.get(g.accountId) ?? [])];
    const used: number[] = [];
    for (const id of ids) {
      const amt = amounts.get(startKey(g.accountId, id)) ?? 0;
      if (amt <= 0) continue;
      used.push(amt);
      lines.push({ bucketId: id, accountId: g.accountId, amountMinor: amt });
    }
    if (used.length > 0) accounts += 1;
    if (leftToSort(g.unbucketedMinor, used) < 0 && !over) over = g;
    totalMinor += used.reduce((t, x) => t + x, 0);
  }
  return { lines, over, totalMinor, accounts };
}
