import { describe, expect, it } from "vitest";
import { G2_ALLOCS, G5_ALLOCS, accounts, buckets, planRows } from "./money-in-testkit";
import {
  TICK_FAILED,
  TRANSFER_GONE,
  TRANSFER_STALE,
  UNTICK_FAILED,
  applyTick,
  buildMoveModel,
  completionLines,
  pairKey,
  sentText,
  tickAnnouncement,
  tickOutcome,
  untickOutcome,
} from "./transfers-model";

const g7 = (sent: { fromAccountId: string; toAccountId: string; sentMinor: number }[] = []) => planRows([...G2_ALLOCS, ...G5_ALLOCS], sent);
const model = (sent?: Parameters<typeof g7>[0]) => buildMoveModel(g7(sent), accounts, buckets);

describe("buildMoveModel: G7 (G2 + G5 confirmed together)", () => {
  it("keeps come first, with bucket names, 'already there' and the netting note", () => {
    const m = model();
    expect(m.keeps.map((k) => k.title)).toEqual(["Keep ₱10,240.00 in MariBank", "Keep ₱2,100.00 in GCash or Maya"]);
    expect(m.keeps[0].detail).toContain("already there");
    expect(m.keeps[0].detail).toContain("includes ₱350.00 kept by netting");
    expect(m.keeps[1].detail).toContain("includes ₱350.00 kept by netting");
  });

  it("five transfer rows, none sent, '0 of 5 sent'", () => {
    const m = model();
    expect(m.transfers.map((t) => t.title)).toEqual([
      "Send ₱1,610.00 to GCash / cash",
      "Send ₱6,900.00 to Pag-IBIG MP2",
      "Send ₱2,300.00 to Tonik",
      "Send ₱1,950.00 to GCash or Maya",
      "Send ₱1,400.00 to Tonik",
    ]);
    expect(m.total).toBe(5);
    expect(sentText(m.sentCount, m.total)).toBe("0 of 5 sent");
    expect(m.transfers.every((t) => !t.checked && !t.partial)).toBe(true);
  });

  it("a transfer row names its buckets, its source account and the netting note", () => {
    const row = model().transfers.find((t) => t.title === "Send ₱1,950.00 to GCash or Maya");
    expect(row?.detail).toBe("Fun money · from MariBank · ₱350.00 less: that much stays put on the other side instead of coming back");
    expect(model().transfers[1].detail).toBe("Investments · from MariBank");
  });
});

describe("buildMoveModel: sent and partial rows", () => {
  it("a fully sent row is checked and counted", () => {
    const m = model([{ fromAccountId: "mari", toAccountId: "mp2", sentMinor: 690_000 }]);
    const row = m.transfers.find((t) => t.to === "mp2");
    expect(row).toMatchObject({ checked: true, partial: false, sent: 690_000 });
    expect(sentText(m.sentCount, m.total)).toBe("1 of 5 sent");
  });

  it("when the amount grew, it says 'Send ₱X more' and '₱Y already sent', and isn't checked", () => {
    // sent 1,610.00 to GCash / cash, then more income pushed the pair to 1,800.00
    const plan = planRows([...G2_ALLOCS, { from: "mari", hue: "living", amount: 19_000 }], [{ fromAccountId: "mari", toAccountId: "cash", sentMinor: 161_000 }]);
    const row = buildMoveModel(plan, accounts, buckets).transfers.find((t) => t.to === "cash");
    expect(row).toMatchObject({ checked: false, partial: true, amount: 180_000, sent: 161_000 });
    expect(row?.title).toBe("Send ₱190.00 more to GCash / cash");
    expect(row?.detail).toBe("Living · from MariBank · ₱1,610.00 already sent");
  });

  it("G8: a sent pair is not netted over; the reverse pair stays a separate transfer", () => {
    const sent = [{ fromAccountId: "mari", toAccountId: "gcash", sentMinor: 230_000 }];
    const m = buildMoveModel(planRows([...G2_ALLOCS, ...G5_ALLOCS], sent), accounts, buckets);
    const out = m.transfers.find((t) => t.from === "mari" && t.to === "gcash");
    const back = m.transfers.find((t) => t.from === "gcash" && t.to === "mari");
    expect(out).toMatchObject({ checked: true, amount: 230_000 });
    expect(out?.detail).not.toContain("less");
    expect(back).toMatchObject({ checked: false, amount: 35_000, title: "Send ₱350.00 to MariBank" });
    expect(m.keeps[0].detail).not.toContain("netting");
  });

  it("an oversent row is unchecked and says so", () => {
    const plan = planRows(G2_ALLOCS, [{ fromAccountId: "mari", toAccountId: "tonik", sentMinor: 300_000 }]);
    const row = buildMoveModel(plan, accounts, buckets).transfers.find((t) => t.to === "tonik");
    expect(row).toMatchObject({ checked: false, oversent: true });
    expect(row?.detail).toContain("₱3,000.00 already sent");
  });

  it("an unknown account or bucket falls back to plain words", () => {
    const m = buildMoveModel([{ kind: "transfer", fromAccountId: "x", toAccountId: "y", amount: 100, netted: 0, sent: 0, done: false, status: "unsent", sendMore: 0, bucketIds: ["zz"] }], [], []);
    expect(m.transfers[0].title).toBe("Send ₱1.00 to an account");
    expect(m.transfers[0].detail).toBe("a bucket · from an account");
  });
});

describe("applyTick", () => {
  it("ticking sets the running total to the amount; unticking clears it", () => {
    const key = pairKey("mari", "mp2");
    const ticked = applyTick(g7(), key, 690_000);
    expect(ticked.find((r) => r.toAccountId === "mp2")).toMatchObject({ sent: 690_000, done: true, status: "done" });
    const unticked = applyTick(ticked, key, 0);
    expect(unticked.find((r) => r.toAccountId === "mp2")).toMatchObject({ sent: 0, done: false, status: "unsent" });
  });

  it("leaves other rows (and keeps) alone", () => {
    const before = g7();
    const after = applyTick(before, pairKey("mari", "mp2"), 690_000);
    expect(after.filter((r) => r.toAccountId !== "mp2")).toEqual(before.filter((r) => r.toAccountId !== "mp2"));
  });
});

describe("copy", () => {
  it("announces ticks with what is left", () => {
    expect(tickAnnouncement(true, 4)).toBe("Sent. 4 to go.");
    expect(tickAnnouncement(true, 0)).toBe("Sent. Every transfer is sent.");
    expect(tickAnnouncement(false, 3)).toBe("Unticked. 3 transfers to send.");
    expect(tickAnnouncement(false, 1)).toBe("Unticked. 1 transfer to send.");
  });

  it("completion card: total, source count, accounts match", () => {
    const done = [
      { entryId: "a", name: "Work", how: "Split by Plan A", amountMinor: 2_300_000 },
      { entryId: "b", name: "Side hustle", how: "Own split", amountMinor: 350_000 },
    ];
    expect(completionLines(done)).toEqual({ headline: "All money in has a home.", lines: ["₱26,500.00 from 2 sources now has a job", "Your accounts match your buckets"] });
    expect(completionLines(done.slice(0, 1)).lines[0]).toBe("₱23,000.00 from 1 source now has a job");
  });
});

describe("error mapping", () => {
  it("P0001 'already sent' is success: the transfer is already ticked", () => {
    expect(tickOutcome({ code: "P0001", message: "already sent 230000 for this transfer; untick it first to change the amount" })).toEqual({ kind: "already" });
  });

  it("a closed cycle asks for a reload; other P0001 is a plain failure", () => {
    expect(tickOutcome({ code: "P0001", message: "no open transfer cycle: nothing to send" })).toEqual({ kind: "error", error: TRANSFER_STALE });
    expect(tickOutcome({ code: "P0001", message: "something else" })).toEqual({ kind: "error", error: TICK_FAILED });
  });

  it("missing transfer or account, signed out, and unknown errors", () => {
    expect(tickOutcome({ code: "P0002", message: "no transfer" })).toEqual({ kind: "error", error: TRANSFER_GONE });
    expect(tickOutcome({ code: "28000", message: "not signed in" })).toMatchObject({ kind: "error", error: expect.stringContaining("Sign in") });
    expect(tickOutcome({ message: "boom" })).toEqual({ kind: "error", error: TICK_FAILED });
  });

  it("untick: nothing ticked means already unticked", () => {
    expect(untickOutcome({ code: "P0002", message: "nothing ticked" })).toEqual({ kind: "already" });
    expect(untickOutcome({ code: "XX000", message: "boom" })).toEqual({ kind: "error", error: UNTICK_FAILED });
  });
});
