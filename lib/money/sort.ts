/**
 * "Sort the money you already have" (ticket 34). Money that came in before a plan sits in one bucket even when it
 * was already sent to the accounts the plan's buckets live in. Each group here is one (bucket, account) pair with
 * money still unsorted, and the buckets kept in that account it can go to. Nothing moves between accounts.
 * Integer centavos throughout.
 */

export type SortBucketInput = { id: string; name: string; hue: string | null; keptInAccountId: string | null; displayOrder: number; isArchived: boolean };
export type SortAccountInput = { id: string; name: string; displayOrder: number };
export type UnsortedInput = { bucketId: string; accountId: string; amountMinor: number };

export type SortTarget = { bucketId: string; name: string; hue: string | null; suggestedMinor: number };
export type SortGroup = {
  fromBucketId: string;
  fromName: string;
  accountId: string;
  accountName: string;
  /** What can be sorted here: unsorted at this account, capped by what the bucket still has left. */
  amountMinor: number;
  targets: SortTarget[];
};

/**
 * Groups in account order. A bucket can't give more than it has left (spending since then comes off first), so the
 * cap runs across its groups in order. The suggestion puts each group's money into the first bucket kept there
 * (plan order); the person can change it.
 */
export function buildSortGroups(args: {
  unsorted: readonly UnsortedInput[];
  buckets: readonly SortBucketInput[];
  accounts: readonly SortAccountInput[];
  leftByBucket: ReadonlyMap<string, number>;
}): SortGroup[] {
  const bucket = new Map(args.buckets.map((b) => [b.id, b]));
  const account = new Map(args.accounts.map((a) => [a.id, a]));
  const room = new Map<string, number>();
  const order = (u: UnsortedInput) => account.get(u.accountId)?.displayOrder ?? Number.MAX_SAFE_INTEGER;
  const rows = [...args.unsorted].sort((a, b) => order(a) - order(b) || (a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0));

  const groups: SortGroup[] = [];
  for (const u of rows) {
    const from = bucket.get(u.bucketId);
    const acct = account.get(u.accountId);
    if (!from || !acct || !(u.amountMinor > 0)) continue;
    const left = room.has(from.id) ? room.get(from.id)! : Math.max(0, args.leftByBucket.get(from.id) ?? 0);
    const amount = Math.min(u.amountMinor, left);
    room.set(from.id, left - amount);
    if (amount <= 0) continue;
    const targets = args.buckets
      .filter((b) => b.keptInAccountId === acct.id && b.id !== from.id && !b.isArchived)
      .sort((a, b) => a.displayOrder - b.displayOrder || (a.id < b.id ? -1 : 1))
      .map((b, i) => ({ bucketId: b.id, name: b.name, hue: b.hue, suggestedMinor: i === 0 ? amount : 0 }));
    if (targets.length === 0) continue;
    groups.push({ fromBucketId: from.id, fromName: from.name, accountId: acct.id, accountName: acct.name, amountMinor: amount, targets });
  }
  return groups;
}

export const sortKey = (g: Pick<SortGroup, "fromBucketId" | "accountId">, targetId: string) => `${g.fromBucketId}|${g.accountId}|${targetId}`;

export type SortLine = { from: string; to: string; account: string; amount: number };

/** The lines to send, and per group what stays where it is; `over` names a group whose amounts add up to more than it has. */
export function sortLines(groups: readonly SortGroup[], amounts: ReadonlyMap<string, number>): { lines: SortLine[]; over: SortGroup | null; totalMinor: number } {
  const lines: SortLine[] = [];
  let over: SortGroup | null = null;
  let totalMinor = 0;
  for (const g of groups) {
    let used = 0;
    for (const t of g.targets) {
      const amt = amounts.get(sortKey(g, t.bucketId)) ?? 0;
      if (amt <= 0) continue;
      used += amt;
      lines.push({ from: g.fromBucketId, to: t.bucketId, account: g.accountId, amount: amt });
    }
    if (used > g.amountMinor && !over) over = g;
    totalMinor += used;
  }
  return { lines, over, totalMinor };
}
