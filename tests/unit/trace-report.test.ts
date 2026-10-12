import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without types
import { analyze, depth } from "../../scripts/db-trace-report.mjs";

const c = (t0: number, t1: number) => ({ t0, t1 });

describe("db-trace-report", () => {
  it("counts the longest chain of sequential calls, not the number of calls", () => {
    expect(depth([c(0, 10), c(0, 12), c(0, 9)])).toBe(1);
    expect(depth([c(0, 10), c(10, 20), c(20, 30)])).toBe(3);
    expect(depth([c(0, 10), c(0, 30), c(10, 20), c(20, 25)])).toBe(3);
    expect(depth([])).toBe(0);
  });

  it("splits a log into requests at each req line", () => {
    const line = (o: object) => `[db-trace] ${JSON.stringify(o)}`;
    const log = [
      line({ ev: "req", path: "/today" }),
      line({ ev: "call", t0: 0, t1: 5 }),
      line({ ev: "call", t0: 5, t1: 9 }),
      "noise",
      line({ ev: "req", path: "/review" }),
      line({ ev: "call", t0: 100, t1: 104 }),
    ].join("\n");
    expect(analyze(log)).toEqual([
      { path: "/today", calls: 2, depth: 2, wallMs: 9 },
      { path: "/review", calls: 1, depth: 1, wallMs: 4 },
    ]);
  });
});
