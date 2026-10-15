import { describe, expect, it } from "vitest";
import { movesOf, paceAfter, splitReceive, type SplitInput } from "@/components/simple-today/receive-split";

const base: SplitInput = { amountMinor: 150_000, keepMinor: 0, receivedInId: "mari", moved: [], spendingBucketId: "live", keepBucketId: "keep" };
const sum = (lines: ReadonlyArray<{ amountMinor: number }>) => lines.reduce((s, l) => s + l.amountMinor, 0);

describe("splitReceive", () => {
  const cases: Array<{ name: string; input: Partial<SplitInput>; remainder: number; spend: number; lines: Array<[string, string, number]> }> = [
    { name: "all in the received-in account", input: {}, remainder: 150_000, spend: 150_000, lines: [["live", "mari", 150_000]] },
    { name: "keep aside stays in the received-in account", input: { keepMinor: 50_000 }, remainder: 150_000, spend: 100_000, lines: [["live", "mari", 100_000], ["keep", "mari", 50_000]] },
    { name: "keep everything", input: { keepMinor: 150_000 }, remainder: 150_000, spend: 0, lines: [["keep", "mari", 150_000]] },
    { name: "one move; the received-in row takes the remainder", input: { moved: [{ accountId: "cash", minor: 50_000 }] }, remainder: 100_000, spend: 150_000, lines: [["live", "mari", 100_000], ["live", "cash", 50_000]] },
    { name: "moving everything leaves nothing in the received-in account", input: { moved: [{ accountId: "cash", minor: 150_000 }] }, remainder: 0, spend: 150_000, lines: [["live", "cash", 150_000]] },
    {
      name: "split over three accounts plus a keep line",
      input: { amountMinor: 2_400_000, keepMinor: 500_000, moved: [{ accountId: "cash", minor: 300_000 }, { accountId: "gcash", minor: 100_001 }] },
      remainder: 1_999_999,
      spend: 1_900_000,
      lines: [["live", "mari", 1_499_999], ["keep", "mari", 500_000], ["live", "cash", 300_000], ["live", "gcash", 100_001]],
    },
    { name: "centavos stay exact", input: { amountMinor: 1_001, moved: [{ accountId: "cash", minor: 333 }] }, remainder: 668, spend: 1_001, lines: [["live", "mari", 668], ["live", "cash", 333]] },
    { name: "a row for the received-in account and zero rows are ignored", input: { moved: [{ accountId: "mari", minor: 10_000 }, { accountId: "cash", minor: 0 }] }, remainder: 150_000, spend: 150_000, lines: [["live", "mari", 150_000]] },
    { name: "the same account twice is added up", input: { moved: [{ accountId: "cash", minor: 1_000 }, { accountId: "cash", minor: 2_000 }] }, remainder: 147_000, spend: 150_000, lines: [["live", "mari", 147_000], ["live", "cash", 3_000]] },
    { name: "a stipend", input: { amountMinor: 2_400_000 }, remainder: 2_400_000, spend: 2_400_000, lines: [["live", "mari", 2_400_000]] },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const input = { ...base, ...c.input };
      const r = splitReceive(input);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.remainderMinor).toBe(c.remainder);
      expect(r.spendMinor).toBe(c.spend);
      expect(r.lines.map((l) => [l.bucketId, l.destAccountId, l.amountMinor])).toEqual(c.lines);
      // The one rule: the lines add up to exactly what was received, and every line is positive.
      expect(sum(r.lines)).toBe(input.amountMinor);
      for (const l of r.lines) expect(l.amountMinor).toBeGreaterThan(0);
    });
  }

  const refusals: Array<{ name: string; input: Partial<SplitInput>; problem: string }> = [
    { name: "no amount", input: { amountMinor: null }, problem: "no_amount" },
    { name: "zero amount", input: { amountMinor: 0 }, problem: "no_amount" },
    { name: "fractional centavos", input: { amountMinor: 10.5 }, problem: "no_amount" },
    { name: "moving more than was received", input: { moved: [{ accountId: "cash", minor: 150_001 }] }, problem: "over_moved" },
    { name: "two moves that together exceed it", input: { moved: [{ accountId: "cash", minor: 100_000 }, { accountId: "gcash", minor: 50_001 }] }, problem: "over_moved" },
    { name: "keeping more than stays in the received-in account", input: { keepMinor: 60_000, moved: [{ accountId: "cash", minor: 100_000 }] }, problem: "keep_too_big" },
    { name: "keeping more than the amount", input: { keepMinor: 150_001 }, problem: "keep_too_big" },
    { name: "a negative row", input: { moved: [{ accountId: "cash", minor: -1 }] }, problem: "bad_row" },
    { name: "a negative keep", input: { keepMinor: -5 }, problem: "bad_row" },
  ];
  for (const c of refusals) {
    it(`refuses: ${c.name}`, () => {
      expect(splitReceive({ ...base, ...c.input })).toEqual({ ok: false, problem: c.problem });
    });
  }
});

describe("paceAfter", () => {
  it("floors, never overstating", () => {
    expect(paceAfter(0, 150_000, 7)).toBe(21_428);
    expect(paceAfter(10_000, 2_390_000, 90)).toBe(26_666);
  });
  it("counts a negative balance against the new money", () => {
    expect(paceAfter(-8_697, 100_000, 10)).toBe(9_130);
    expect(paceAfter(-200_000, 100_000, 4)).toBe(-25_000);
  });
  it("treats fewer than one day as one", () => {
    expect(paceAfter(0, 5_000, 0)).toBe(5_000);
  });
});

describe("movesOf", () => {
  it("lists one move per other account", () => {
    const r = splitReceive({ ...base, keepMinor: 10_000, moved: [{ accountId: "cash", minor: 50_000 }] });
    if (!r.ok) throw new Error("expected ok");
    expect(movesOf(r.lines, "mari")).toEqual([{ to: "cash", amountMinor: 50_000 }]);
  });
  it("is empty when everything stays", () => {
    const r = splitReceive(base);
    if (!r.ok) throw new Error("expected ok");
    expect(movesOf(r.lines, "mari")).toEqual([]);
  });
});
