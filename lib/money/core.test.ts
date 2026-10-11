import { describe, expect, it } from "vitest";
import { addDays, assertBp, assertMinor, bpShare, ceilDiv, daysBetween, floorDiv, medianInt, mulDivRound } from "./core";
import { rng } from "./testkit";

describe("mulDivRound (half up, exact)", () => {
  it("rounds halves up", () => {
    expect(mulDivRound(1, 1, 2)).toBe(1);
    expect(mulDivRound(3, 1, 2)).toBe(2);
    expect(mulDivRound(1, 1, 3)).toBe(0);
    expect(mulDivRound(2, 1, 3)).toBe(1);
    expect(mulDivRound(0, 5, 7)).toBe(0);
  });
  it("negatives round half toward +infinity", () => {
    expect(mulDivRound(-1, 1, 2)).toBe(0);
    expect(mulDivRound(-3, 1, 2)).toBe(-1);
    expect(mulDivRound(-2, 1, 3)).toBe(-1);
  });
  it("is exact where float math is not (1.005-style cases)", () => {
    expect(Math.round(1.005 * 100)).toBe(100); // float gets this wrong
    expect(mulDivRound(1005, 100, 1000)).toBe(101); // 100.5 -> 101
  });
  it("max amount at 10000 bp stays exact", () => {
    expect(bpShare(1_000_000_000, 10_000)).toBe(1_000_000_000);
    expect(bpShare(1_000_000_000, 3333)).toBe(333_300_000);
  });
  it("matches a reference BigInt-free check on random small inputs", () => {
    const r = rng(1);
    for (let i = 0; i < 2000; i++) {
      const a = Math.floor(r() * 100000);
      const n = Math.floor(r() * 10001);
      const exact = (a * n) / 10000; // < 2^53, but compare via integer arithmetic
      const expected = Math.floor((2 * a * n + 10000) / 20000);
      expect(bpShare(a, n)).toBe(expected);
      expect(Math.abs(bpShare(a, n) - exact)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe("integer helpers", () => {
  it("floorDiv / ceilDiv", () => {
    expect(floorDiv(7, 2)).toBe(3);
    expect(floorDiv(-7, 2)).toBe(-4);
    expect(floorDiv(-8697, 10)).toBe(-870);
    expect(ceilDiv(7, 2)).toBe(4);
    expect(ceilDiv(-7, 2)).toBe(-3);
    expect(ceilDiv(6, 2)).toBe(3);
    expect(() => floorDiv(1, 0)).toThrow();
  });
  it("medianInt", () => {
    expect(medianInt([5])).toBe(5);
    expect(medianInt([7, 1, 3])).toBe(3);
    expect(medianInt([14, 15])).toBe(15); // 14.5 half up
    expect(() => medianInt([])).toThrow();
  });
  it("assertions", () => {
    expect(() => assertMinor(0.1)).toThrow();
    expect(() => assertBp(10001)).toThrow();
    expect(() => assertBp(-1)).toThrow();
    expect(assertMinor(-5)).toBe(-5);
  });
  it("dates", () => {
    expect(addDays("2026-10-07", 14)).toBe("2026-10-21");
    expect(daysBetween("2026-10-11", "2026-10-21")).toBe(10);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(() => daysBetween("10/11/2026", "2026-10-21")).toThrow();
  });
});
