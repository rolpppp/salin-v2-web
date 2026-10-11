import { describe, expect, it } from "vitest";
import { formatPeso } from "./format";
import { ratePerAud } from "./rate";

describe("ratePerAud", () => {
  it("G11: A$400 sent, ₱17,410 received -> ₱43.53 per A$1 (4352.5 rounds half up)", () => {
    const r = ratePerAud(1741000, 40000);
    expect(r).toBe(4353);
    expect(formatPeso(r)).toBe("₱43.53");
  });
  it("exact and just-below-half cases", () => {
    expect(ratePerAud(4000000, 100000)).toBe(4000);
    expect(ratePerAud(1741000, 40001)).toBe(4352); // 4352.39
    expect(ratePerAud(1, 3)).toBe(33); // 33.33
    expect(ratePerAud(2, 3)).toBe(67); // 66.67
  });
  it("is exact for large amounts", () => {
    expect(ratePerAud(1_000_000_000, 1_000_000_000)).toBe(100);
  });
  it("rejects zero, negative, non-integer", () => {
    expect(() => ratePerAud(100, 0)).toThrow();
    expect(() => ratePerAud(0, 100)).toThrow();
    expect(() => ratePerAud(-1, 100)).toThrow();
    expect(() => ratePerAud(1.5, 100)).toThrow();
  });
});
