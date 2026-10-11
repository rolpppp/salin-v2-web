import { describe, expect, it } from "vitest";
import { accountShouldHold } from "./buckets";
import { PLAN_A, planOpts, toMap } from "./testkit";
import { allMoneyHasHome, transferPlan } from "./transfers";
import type { SentCheck, TransferAllocation } from "./transfers";
import { splitByPlan, splitOwn, splitWhole } from "./split";

const MARI = "acct-mari";
const GCASHCASH = "acct-gcash-cash";
const GM = "acct-gcash-or-maya";
const PAGIBIG = "acct-pagibig";
const TONIK = "acct-tonik";

const SHORT: Record<string, string> = { tax: "Tax", living: "Living", rent: "Rent", emergency: "Emergency", invest: "Invest", sinking: "Sinking", fun: "Fun", buffer: "Buffer", dost: "Scholarship" };
/** Destination snapshot per bucket at confirm time (the prototype's "kept in"). */
const DEST: Record<string, string> = { tax: MARI, living: GCASHCASH, rent: MARI, emergency: MARI, invest: PAGIBIG, sinking: TONIK, fun: GM, buffer: MARI, dost: MARI };

const alloc = (from: string, lines: readonly { bucketId: string; amount: number }[], dest = DEST): TransferAllocation[] =>
  lines.filter((l) => l.amount !== 0).map((l) => ({ fromAccountId: from, destAccountId: dest[l.bucketId] as string, amount: l.amount, label: SHORT[l.bucketId] as string }));

const g2 = () => alloc(MARI, splitByPlan(2300000, PLAN_A, planOpts("2026-10-08")));
const g5 = () => {
  const r = splitOwn(350000, [
    { bucketId: "tax", bp: 1000 },
    { bucketId: "sinking", bp: 4000 },
    { bucketId: "fun", bp: 5000 },
  ]);
  if (r.kind !== "split") throw new Error("x");
  return alloc(GM, r.lines);
};
const allowance = () => alloc(GCASHCASH, splitWhole(150000, "living"));

const find = (p: ReturnType<typeof transferPlan>, from: string, to: string) => p.transfers.find((t) => t.fromAccountId === from && t.toAccountId === to);
const keep = (p: ReturnType<typeof transferPlan>, acct: string) => p.keeps.find((k) => k.accountId === acct);

describe("transferPlan: golden tests", () => {
  it("G7: confirm G2, G5 and the allowance all at once", () => {
    const p = transferPlan([...g2(), ...g5(), ...allowance()], []);
    expect(keep(p, MARI)).toMatchObject({ amount: 1024000, netted: 35000 });
    expect(keep(p, GM)).toMatchObject({ amount: 210000, netted: 35000 });
    expect(keep(p, GCASHCASH)).toMatchObject({ amount: 150000, netted: 0 });
    expect(p.keeps).toHaveLength(3);
    expect(find(p, MARI, GCASHCASH)?.amount).toBe(161000);
    expect(find(p, MARI, PAGIBIG)?.amount).toBe(690000);
    expect(find(p, MARI, TONIK)?.amount).toBe(230000);
    expect(find(p, MARI, GM)).toMatchObject({ amount: 195000, netted: 35000 });
    expect(find(p, GM, TONIK)?.amount).toBe(140000);
    expect(find(p, GM, MARI)).toBeUndefined();
    expect(p.transfers).toHaveLength(5);
  });

  it("G8: confirm G2, tick MariBank->GCash or Maya (230000) as sent, then confirm the rest: no netting", () => {
    const sent: SentCheck[] = [{ fromAccountId: MARI, toAccountId: GM, sentMinor: 230000 }];
    const first = transferPlan(g2(), sent);
    expect(find(first, MARI, GM)).toMatchObject({ amount: 230000, sent: 230000, done: true, status: "done" });

    const p = transferPlan([...g2(), ...g5(), ...allowance()], sent);
    expect(find(p, MARI, GM)).toMatchObject({ amount: 230000, netted: 0, sent: 230000, done: true });
    expect(find(p, GM, MARI)).toMatchObject({ amount: 35000, netted: 0, sent: 0, done: false });
    expect(keep(p, MARI)).toMatchObject({ amount: 989000, netted: 0 });
    expect(keep(p, GM)).toMatchObject({ amount: 175000, netted: 0 });
  });

  it("G12 (unit): allocations carry destination snapshots, so moving a bucket's kept-in does not change the transfer plan", () => {
    const snapshot = [...g2(), ...g5(), ...allowance()];
    const sent: SentCheck[] = [{ fromAccountId: MARI, toAccountId: PAGIBIG, sentMinor: 690000 }];
    const before = transferPlan(snapshot, sent);
    // "Move Kept in for Investments to Tonik" only changes the CURRENT bucket config, which transferPlan never reads.
    const currentKeptIn = { ...DEST, invest: TONIK };
    expect(currentKeptIn.invest).toBe(TONIK);
    const after = transferPlan(snapshot, sent);
    expect(after).toEqual(before);
    expect(find(after, MARI, PAGIBIG)).toMatchObject({ amount: 690000, done: true });
    // Pag-IBIG MP2 still "should hold" its earlier share; nothing is kept there now.
    const invested = snapshot.filter((a) => a.destAccountId === PAGIBIG).reduce((t, a) => t + a.amount, 0);
    expect(accountShouldHold({ allocationsHere: invested, bucketsKeptHere: [] })).toBe(690000);
  });
});

describe("transferPlan: rules", () => {
  it("from === to is a keep row, not a transfer", () => {
    const p = transferPlan([{ fromAccountId: MARI, destAccountId: MARI, amount: 500, label: "Tax" }]);
    expect(p.transfers).toEqual([]);
    expect(p.keeps).toEqual([{ accountId: MARI, amount: 500, netted: 0, labels: ["Tax"] }]);
  });
  it("groups by (from, to) and sums; labels deduped in order", () => {
    const p = transferPlan([
      { fromAccountId: MARI, destAccountId: TONIK, amount: 100, label: "Sinking" },
      { fromAccountId: MARI, destAccountId: TONIK, amount: 50, label: "Sinking" },
      { fromAccountId: MARI, destAccountId: TONIK, amount: 25, label: "Fun" },
    ]);
    expect(p.transfers).toHaveLength(1);
    expect(p.transfers[0]).toMatchObject({ amount: 175, labels: ["Sinking", "Fun"] });
  });
  it("accounts are compared by id, never by name", () => {
    const p = transferPlan([{ fromAccountId: "a", destAccountId: "a ", amount: 10 }]);
    expect(p.transfers).toHaveLength(1);
  });
  it("two-way netting: the smaller side is cancelled, both sides keep it", () => {
    const p = transferPlan([
      { fromAccountId: "A", destAccountId: "B", amount: 1000, label: "x" },
      { fromAccountId: "B", destAccountId: "A", amount: 350, label: "y" },
    ]);
    expect(p.transfers).toEqual([expect.objectContaining({ fromAccountId: "A", toAccountId: "B", amount: 650, netted: 350 })]);
    expect(keep(p, "A")).toMatchObject({ amount: 350, netted: 350, labels: ["y"] });
    expect(keep(p, "B")).toMatchObject({ amount: 350, netted: 350, labels: ["x"] });
  });
  it("equal amounts both ways cancel completely", () => {
    const p = transferPlan([
      { fromAccountId: "A", destAccountId: "B", amount: 500 },
      { fromAccountId: "B", destAccountId: "A", amount: 500 },
    ]);
    expect(p.transfers).toEqual([]);
    expect(keep(p, "A")?.amount).toBe(500);
    expect(keep(p, "B")?.amount).toBe(500);
  });
  it("money in equals money out: keeps plus transfers equal the allocations total", () => {
    const all = [...g2(), ...g5(), ...allowance()];
    const p = transferPlan(all);
    const out = p.transfers.reduce((t, x) => t + x.amount, 0) + p.keeps.reduce((t, k) => t + k.amount, 0);
    // netting turns 2 x 35000 of transfers into 2 x 35000 of keeps, so nothing is lost or invented
    expect(out).toBe(all.reduce((t, a) => t + a.amount, 0));
  });
  it("zero amounts are ignored", () => {
    expect(transferPlan([{ fromAccountId: "A", destAccountId: "B", amount: 0 }])).toEqual({ keeps: [], transfers: [] });
  });
});

describe("never net over a sent transfer (§3.5)", () => {
  const flows: TransferAllocation[] = [
    { fromAccountId: "A", destAccountId: "B", amount: 1000 },
    { fromAccountId: "B", destAccountId: "A", amount: 350 },
  ];
  it("sent at the old (un-netted) amount blocks netting", () => {
    const p = transferPlan(flows, [{ fromAccountId: "A", toAccountId: "B", sentMinor: 1000 }]);
    expect(find(p, "A", "B")).toMatchObject({ amount: 1000, netted: 0, done: true });
    expect(find(p, "B", "A")).toMatchObject({ amount: 350 });
  });
  it("the reverse direction sent at the old amount also blocks netting", () => {
    const p = transferPlan(flows, [{ fromAccountId: "B", toAccountId: "A", sentMinor: 350 }]);
    expect(find(p, "A", "B")?.amount).toBe(1000);
    expect(find(p, "B", "A")?.amount).toBe(350);
  });
  it("sent exactly at the netted amount keeps the netting", () => {
    const p = transferPlan(flows, [{ fromAccountId: "A", toAccountId: "B", sentMinor: 650 }]);
    expect(find(p, "A", "B")).toMatchObject({ amount: 650, netted: 350, sent: 650, done: true });
    expect(find(p, "B", "A")).toBeUndefined();
  });
  it("both sides partially sent at different amounts: no netting", () => {
    const p = transferPlan(flows, [
      { fromAccountId: "A", toAccountId: "B", sentMinor: 400 },
      { fromAccountId: "B", toAccountId: "A", sentMinor: 100 },
    ]);
    expect(find(p, "A", "B")).toMatchObject({ amount: 1000, sent: 400, status: "partial", sendMore: 600 });
    expect(find(p, "B", "A")).toMatchObject({ amount: 350, sent: 100, status: "partial", sendMore: 250 });
  });
  it("unrelated sent transfers do not block netting", () => {
    const p = transferPlan([...flows, { fromAccountId: "A", destAccountId: "C", amount: 10 }], [{ fromAccountId: "A", toAccountId: "C", sentMinor: 10 }]);
    expect(find(p, "A", "B")?.amount).toBe(650);
  });
});

describe("done and send-more (§3.7)", () => {
  const one: TransferAllocation[] = [{ fromAccountId: "A", destAccountId: "B", amount: 1000 }];
  it("unsent", () => {
    expect(transferPlan(one, [])).toMatchObject({ transfers: [{ status: "unsent", done: false, sendMore: 0, sent: 0 }] });
  });
  it("done only if sent === amount", () => {
    expect(transferPlan(one, [{ fromAccountId: "A", toAccountId: "B", sentMinor: 1000 }]).transfers[0]).toMatchObject({ done: true, status: "done" });
  });
  it("amount grew after sending: send the difference, never silently done", () => {
    const grew = [...one, { fromAccountId: "A", destAccountId: "B", amount: 500 }];
    const t = transferPlan(grew, [{ fromAccountId: "A", toAccountId: "B", sentMinor: 1000 }]).transfers[0];
    expect(t).toMatchObject({ amount: 1500, sent: 1000, done: false, status: "partial", sendMore: 500 });
  });
  it("amount shrank below sent: not done, flagged oversent, nothing to send", () => {
    const t = transferPlan([{ fromAccountId: "A", destAccountId: "B", amount: 400 }], [{ fromAccountId: "A", toAccountId: "B", sentMinor: 1000 }]).transfers[0];
    expect(t).toMatchObject({ done: false, status: "oversent", sendMore: 0 });
  });
});

describe("allMoneyHasHome (§3.8)", () => {
  const done = { done: true } as never;
  const open = { done: false } as never;
  it("needs nothing waiting, one confirmed, all transfers done", () => {
    expect(allMoneyHasHome({ waitingCount: 0, confirmedCount: 1, transfers: [done, done] })).toBe(true);
    expect(allMoneyHasHome({ waitingCount: 0, confirmedCount: 1, transfers: [] })).toBe(true);
    expect(allMoneyHasHome({ waitingCount: 1, confirmedCount: 1, transfers: [done] })).toBe(false);
    expect(allMoneyHasHome({ waitingCount: 0, confirmedCount: 0, transfers: [] })).toBe(false);
    expect(allMoneyHasHome({ waitingCount: 0, confirmedCount: 2, transfers: [done, open] })).toBe(false);
  });
});

it("toMap helper sanity (G7 inputs match G2/G5 goldens)", () => {
  expect(toMap(splitByPlan(2300000, PLAN_A, planOpts("2026-10-08"))).emergency).toBe(736000);
});
