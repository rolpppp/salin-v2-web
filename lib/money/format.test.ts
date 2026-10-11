import { describe, expect, it } from "vitest";
import { formatAud, formatPercent, formatPeso, formatPesoWhole, formatWholePercent } from "./format";

describe("formatPeso", () => {
  it("formats with grouping and two decimals", () => {
    expect(formatPeso(1732900)).toBe("₱17,329.00");
    expect(formatPeso(0)).toBe("₱0.00");
    expect(formatPeso(5)).toBe("₱0.05");
    expect(formatPeso(100)).toBe("₱1.00");
    expect(formatPeso(1_000_000_000)).toBe("₱10,000,000.00");
    expect(formatPeso(123456789)).toBe("₱1,234,567.89");
  });
  it("uses U+2212 for negatives, not a hyphen", () => {
    expect(formatPeso(-8697)).toBe("−₱86.97");
    expect(formatPeso(-8697)).not.toContain("-");
    expect(formatPeso(-1)).toBe("−₱0.01");
  });
  it("rejects floats and unsafe integers", () => {
    expect(() => formatPeso(1.5)).toThrow();
    expect(() => formatPeso(NaN)).toThrow();
    expect(() => formatPeso(2 ** 53)).toThrow();
  });
});

describe("formatPesoWhole (per-day figures; input is centavos; floors toward -infinity)", () => {
  it("G9 per day: 3454 centavos is ₱34 a day", () => {
    expect(formatPesoWhole(3454)).toBe("₱34");
  });
  it("never overstates", () => {
    expect(formatPesoWhole(3499)).toBe("₱34");
    expect(formatPesoWhole(99)).toBe("₱0");
    expect(formatPesoWhole(100)).toBe("₱1");
    expect(formatPesoWhole(50)).toBe("₱0");
    expect(formatPesoWhole(345400)).toBe("₱3,454");
    expect(formatPesoWhole(0)).toBe("₱0");
  });
  it("negative floors away from zero with U+2212: a shortfall is never hidden", () => {
    expect(formatPesoWhole(-8697)).toBe("\u2212₱87");
    expect(formatPesoWhole(-1)).toBe("\u2212₱1");
    expect(formatPesoWhole(-100)).toBe("\u2212₱1");
  });
});

describe("formatAud", () => {
  it("formats A$", () => {
    expect(formatAud(40000)).toBe("A$400.00");
    expect(formatAud(-5)).toBe("−A$0.05");
  });
});

describe("formatPercent", () => {
  it("bp to percent with decimals, half up", () => {
    expect(formatPercent(2581, 1)).toBe("25.8%");
    expect(formatPercent(2585, 1)).toBe("25.9%");
    expect(formatPercent(2581, 2)).toBe("25.81%");
    expect(formatPercent(2550, 0)).toBe("26%");
    expect(formatPercent(10000)).toBe("100%");
    expect(formatPercent(0, 1)).toBe("0.0%");
    expect(formatPercent(5, 2)).toBe("0.05%");
  });
  it("whole percent at the UI edge", () => {
    expect(formatWholePercent(25)).toBe("25%");
  });
});
