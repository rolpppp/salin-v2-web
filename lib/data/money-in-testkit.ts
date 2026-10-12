/** Fixtures shared by the Money in tests: the owner's sheet (BUSINESS_RULES §10) as a `MoneyInData`. */
import { transferPlan, type SentCheck } from "@/lib/money";
import type { MiAccount, MiBucket, MiIncome, MiSource, MiTransferRow, MoneyInData } from "./money-in-model";

const HUES = ["tax", "living", "rent", "emergency", "invest", "sinking", "fun", "buffer", "dost"] as const;
const NAMES: Record<(typeof HUES)[number], string> = {
  tax: "Tax",
  living: "Living",
  rent: "Rent",
  emergency: "Emergency fund",
  invest: "Investments",
  sinking: "Sinking funds",
  fun: "Fun money",
  buffer: "Buffer",
  dost: "Scholarship",
};
const HOME: Record<(typeof HUES)[number], string> = {
  tax: "mari",
  living: "cash",
  rent: "mari",
  emergency: "mari",
  invest: "mp2",
  sinking: "tonik",
  fun: "gcash",
  buffer: "mari",
  dost: "mari",
};

export const BUCKET = Object.fromEntries(HUES.map((h) => [h, `bucket-${h}`])) as Record<(typeof HUES)[number], string>;

export const buckets: MiBucket[] = HUES.map((h, i) => ({
  id: BUCKET[h],
  name: NAMES[h],
  shortName: h === "emergency" ? "Emergency" : null,
  groupKey: h === "living" || h === "fun" ? "spend" : h === "emergency" || h === "invest" || h === "sinking" ? "save" : "set_aside",
  hue: h,
  keptInAccountId: HOME[h],
  planless: h === "dost",
  displayOrder: i + 1,
  isArchived: false,
}));

export const accounts: MiAccount[] = [
  { id: "mari", name: "MariBank", currency: "PHP", isArchived: false },
  { id: "gcash", name: "GCash or Maya", currency: "PHP", isArchived: false },
  { id: "cash", name: "GCash / cash", currency: "PHP", isArchived: false },
  { id: "mp2", name: "Pag-IBIG MP2", currency: "PHP", isArchived: false },
  { id: "tonik", name: "Tonik", currency: "PHP", isArchived: false },
  { id: "aud", name: "AUD account", currency: "AUD", isArchived: false },
];

const bp = (bucket: keyof typeof BUCKET, n: number) => ({ bucketId: BUCKET[bucket], bp: n });

/** Plan A of the owner's sheet: tax 6 living 7 rent 2 emergency 30 invest 30 sinking 10 fun 10 buffer 5. */
export const PLAN_A = [bp("tax", 600), bp("living", 700), bp("rent", 200), bp("emergency", 3000), bp("invest", 3000), bp("sinking", 1000), bp("fun", 1000), bp("buffer", 500)];
/** Plan B: Emergency 10, Investments 50. */
export const PLAN_B = [bp("tax", 600), bp("living", 700), bp("rent", 200), bp("emergency", 1000), bp("invest", 5000), bp("sinking", 1000), bp("fun", 1000), bp("buffer", 500)];

const src = (id: string, name: string, kind: MiSource["kind"], rule: MiSource["rule"], extra: Partial<MiSource> = {}): MiSource => ({
  id,
  name,
  kind,
  rule,
  wholeBucketId: null,
  landsInAccountId: "mari",
  categoryId: `cat-${id}`,
  isArchived: false,
  splitLines: [],
  ...extra,
});

export const sources: MiSource[] = [
  src("others", "Others", "other", "plan"),
  src("work", "Work", "salary", "plan"),
  src("side", "Side hustle", "side_hustle", "own", { landsInAccountId: "gcash", splitLines: [bp("tax", 1000), bp("sinking", 4000), bp("fun", 5000)] }),
  src("bad", "Commissions", "side_hustle", "own", { splitLines: [bp("tax", 1000), bp("sinking", 4000), bp("fun", 4000)] }),
  src("allow", "Allowance", "allowance", "whole", { landsInAccountId: "cash", wholeBucketId: BUCKET.living }),
  src("ask", "Gift", "gift", "ask"),
];

/** Noon in Manila on 2026-10-DD (UTC+8). */
const ms = (day: number) => Date.UTC(2026, 9, day, 4, 0, 0);

export function income(id: string, sourceId: string | null, amountMinor: number, day: number, extra: Partial<MiIncome> = {}): MiIncome {
  const iso = `2026-10-${String(day).padStart(2, "0")}`;
  return {
    id,
    sourceId,
    amountMinor,
    occurredAt: ms(day),
    dateIso: iso,
    engineDate: iso,
    accountId: "mari",
    metaJob: null,
    oneBucketId: null,
    sentMinor: null,
    sentCurrency: null,
    ...extra,
  };
}

export function moneyInData(overrides: Partial<MoneyInData> = {}): MoneyInData {
  return {
    homeCurrency: "PHP",
    todayIso: "2026-10-11",
    timeZone: "Asia/Manila",
    buckets,
    accounts,
    sources,
    incomes: [],
    transferPlan: [],
    done: [],
    cycle: null,
    plan: {
      plans: { A: PLAN_A, B: PLAN_B },
      planNames: { A: "Plan A", B: "Plan B" },
      activePlan: { mode: "auto", from: "A", to: "B" },
      emergencyBucketId: BUCKET.emergency,
      rentRedirect: { rentBucketId: BUCKET.rent, startDate: "2027-01-01" },
      emergencyAllocatedSoFar: 0,
      switchTarget: 5_000_000,
      switchOn: true,
    },
    ...overrides,
  };
}

type Hue = (typeof HUES)[number];
/** An allocation line as the checklist sees it: landed in `from`, snapshotted to the bucket's home. */
export type Alloc = { from: string; hue: Hue; amount: number };

/** BUSINESS_RULES §10 G2 (23,000 Plan A, lands in MariBank). */
export const G2_ALLOCS: Alloc[] = [
  { from: "mari", hue: "tax", amount: 138_000 },
  { from: "mari", hue: "living", amount: 161_000 },
  { from: "mari", hue: "emergency", amount: 736_000 },
  { from: "mari", hue: "invest", amount: 690_000 },
  { from: "mari", hue: "sinking", amount: 230_000 },
  { from: "mari", hue: "fun", amount: 230_000 },
  { from: "mari", hue: "buffer", amount: 115_000 },
];
/** G5 (3,500 own split, lands in GCash or Maya). */
export const G5_ALLOCS: Alloc[] = [
  { from: "gcash", hue: "tax", amount: 35_000 },
  { from: "gcash", hue: "sinking", amount: 140_000 },
  { from: "gcash", hue: "fun", amount: 175_000 },
];

/**
 * `transfer_plan()` rows for some allocations and sent amounts, computed with the proven TS mirror
 * (lib/money/transfers.ts has SQL parity), in the shape the screen reads.
 */
export function planRows(allocs: readonly Alloc[], sent: readonly SentCheck[] = []): MiTransferRow[] {
  const p = transferPlan(
    allocs.map((a) => ({ fromAccountId: a.from, destAccountId: HOME[a.hue], amount: a.amount, label: BUCKET[a.hue] })),
    sent,
  );
  return [
    ...p.keeps.map((k): MiTransferRow => ({ kind: "keep", fromAccountId: k.accountId, toAccountId: k.accountId, amount: k.amount, netted: k.netted, sent: 0, done: true, status: "keep", sendMore: 0, bucketIds: k.labels })),
    ...p.transfers.map((t): MiTransferRow => ({ kind: "transfer", fromAccountId: t.fromAccountId, toAccountId: t.toAccountId, amount: t.amount, netted: t.netted, sent: t.sent, done: t.done, status: t.status, sendMore: t.sendMore, bucketIds: t.labels })),
  ];
}
