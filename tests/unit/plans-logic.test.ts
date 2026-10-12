import { describe, expect, it } from "vitest";
import { failure } from "@/lib/actions/result";
import { INCOME_KINDS } from "@/lib/data/income-kinds";
import { checkOwnSplit, defaultWholeBucket, ownDraftFromBp, ownDraftToLines, ownProblem, ownTotalLabel, ruleDescription } from "@/components/plans/income/logic";
import { checkPlan, differsFromSaved, draftFromBp, draftToLines, planMessage } from "@/components/plans/split/logic";
import { bpToPercent, hueColor, longDate, minorToInput, parsePercent, percentToBp } from "@/components/plans/shared";
import { formatPeso, parseMoney } from "@/lib/money";

describe("parsePercent", () => {
  it("accepts whole numbers 0..100", () => {
    expect(parsePercent("0")).toBe(0);
    expect(parsePercent(" 45 ")).toBe(45);
    expect(parsePercent("100")).toBe(100);
    expect(parsePercent("007")).toBe(7);
  });
  it("refuses everything else", () => {
    for (const bad of ["", "101", "-5", "12.5", "1e2", "abc", "5%", "1 000"]) expect(parsePercent(bad), bad).toBeNull();
  });
  it("can treat empty as 0 for own splits", () => {
    expect(parsePercent("", true)).toBe(0);
    expect(parsePercent("x", true)).toBeNull();
  });
  it("converts to and from basis points exactly", () => {
    expect(percentToBp(45)).toBe(4500);
    expect(bpToPercent(4500)).toBe(45);
  });
});

describe("plan totals (SPEC 4.1)", () => {
  const ids = ["a", "b", "c"];
  it("a plan that adds to 100 is valid", () => {
    const c = checkPlan({ a: "50", b: "30", c: "20" }, ids);
    expect(c).toEqual({ total: 100, invalid: [], valid: true });
    expect(planMessage("A", c)).toBeNull();
  });
  it("says what is wrong and how to fix it when under 100", () => {
    const c = checkPlan({ a: "50", b: "30", c: "15" }, ids);
    expect(c.valid).toBe(false);
    expect(planMessage("A", c)).toBe("Plan A adds up to 95%. Add 5% to another bucket.");
  });
  it("says it the other way when over 100", () => {
    expect(planMessage("B", checkPlan({ a: "60", b: "30", c: "15" }, ids))).toBe("Plan B adds up to 105%. Take 5% from another bucket.");
  });
  it("an invalid field blocks saving even when the rest adds to 100", () => {
    const c = checkPlan({ a: "50", b: "50", c: "x" }, ids);
    expect(c.valid).toBe(false);
    expect(c.invalid).toEqual(["c"]);
    expect(planMessage("A", c, "Fun")).toBe("Fun needs a whole number from 0 to 100 in Plan A.");
  });
  it("saved lines sum to exactly 10000 bp", () => {
    const draft = { a: "33", b: "34", c: "33" };
    const lines = draftToLines(draft, ids);
    expect(lines.reduce((s, l) => s + l.percentBp, 0)).toBe(10000);
    expect(lines.every((l) => Number.isInteger(l.percentBp))).toBe(true);
  });
  it("round-trips basis points and detects real changes only", () => {
    const saved = draftFromBp({ a: 5000, b: 3000 }, ids);
    expect(saved).toEqual({ a: "50", b: "30", c: "0" });
    expect(differsFromSaved({ ...saved, a: "050" }, saved, ids)).toBe(false);
    expect(differsFromSaved({ ...saved, a: "51" }, saved, ids)).toBe(true);
  });
});

describe("own split (BR 2.1.4)", () => {
  const ids = ["tax", "sink", "fun", "rent"];
  it("90% is storable but not complete: it is never rescaled", () => {
    const c = checkOwnSplit({ tax: "10", sink: "40", fun: "40", rent: "" }, ids);
    expect(c).toMatchObject({ total: 90, savable: true, complete: false });
    expect(ownTotalLabel(c.total)).toBe("90% · needs 100%");
  });
  it("100% is complete", () => {
    const c = checkOwnSplit({ tax: "10", sink: "40", fun: "50" }, ids);
    expect(c.complete).toBe(true);
    expect(ownTotalLabel(100)).toBe("100%");
  });
  it("over 100% and bad numbers are not savable and explain why", () => {
    const over = checkOwnSplit({ tax: "60", sink: "50" }, ids);
    expect(over.savable).toBe(false);
    expect(ownProblem(over)).toBe("The split adds up to 110%. Take 10% out.");
    const bad = checkOwnSplit({ tax: "1.5" }, ids);
    expect(bad.invalid).toEqual(["tax"]);
    expect(ownProblem(bad, "Tax")).toBe("Tax needs a whole number from 0 to 100.");
  });
  it("zero means skipped: no line is sent", () => {
    const lines = ownDraftToLines({ tax: "10", sink: "0", fun: "90" }, ids);
    expect(lines).toEqual([
      { bucketId: "tax", percentBp: 1000 },
      { bucketId: "fun", percentBp: 9000 },
    ]);
    expect(ownDraftFromBp({ tax: 1000 }, ids)).toEqual({ tax: "10", sink: "0", fun: "0", rent: "0" });
  });
  it("describes each rule in one line", () => {
    expect(ruleDescription({ rule: "plan", activePlanName: "Saving for Japan", ownTotal: 0 })).toBe("Uses Saving for Japan percentages.");
    expect(ruleDescription({ rule: "ask", activePlanName: "Plan A", ownTotal: 0 })).toBe("You pick a job when the money arrives.");
    expect(ruleDescription({ rule: "whole", activePlanName: "Plan A", wholeBucketName: "Living", ownTotal: 0 })).toBe("All of it stays in Living. Nothing is split.");
    expect(ruleDescription({ rule: "own", activePlanName: "Plan A", ownTotal: 90 })).toMatch(/adds up to 90%.*needs a job/);
  });
  it("picks a sensible bucket when someone chooses Keep it whole", () => {
    const b = [
      { id: "1", hue: "living" },
      { id: "2", hue: "emergency" },
      { id: "3", hue: "dost" },
    ];
    expect(defaultWholeBucket("scholarship", b)).toBe("3");
    expect(defaultWholeBucket("allowance", b)).toBe("1");
    expect(defaultWholeBucket("gift", b)).toBe("2");
    expect(defaultWholeBucket("gift", [])).toBeNull();
  });
});

describe("presets", () => {
  it("offers the seven kinds of SPEC 4.2 in order", () => {
    expect(INCOME_KINDS.map((k) => k.label)).toEqual(["Salary", "Scholarship", "Side hustle", "Allowance", "Gift", "Refund", "Other"]);
  });
});

describe("amount helpers", () => {
  it("formats an amount field without floats", () => {
    expect(minorToInput(5_000_000)).toBe("50,000");
    expect(minorToInput(5_000_050)).toBe("50,000.50");
    expect(minorToInput(100)).toBe("1");
    expect(minorToInput(5)).toBe("0.05");
  });
  it("what the field shows parses back to the same centavos", () => {
    for (const m of [100, 5, 5_000_050, 123_456_789, 1_000_000_000]) {
      expect(parseMoney(minorToInput(m))).toEqual({ ok: true, minor: m });
    }
    expect(formatPeso(5_000_000)).toBe("₱50,000.00");
  });
  it("formats the rent date without a time zone", () => {
    expect(longDate("2027-01-01")).toBe("January 1, 2027");
    expect(longDate("nonsense")).toBe("nonsense");
  });
  it("maps known hues to tokens and anything else to neutral", () => {
    expect(hueColor("tax")).toBe("var(--b-tax)");
    expect(hueColor("zzz")).toBe("var(--ink-3)");
    expect(hueColor(null)).toBe("var(--ink-3)");
  });
});

describe("action errors", () => {
  it("passes through messages written for people", () => {
    expect(failure({ code: "22023", message: "Plan A adds up to 95 percent." })).toEqual({ ok: false, error: "Plan A adds up to 95 percent." });
  });
  it("hides database details for everything else", () => {
    expect(failure({ code: "XX000", message: "boom" }).error).toBe("Couldn't save. Check your connection and try again.");
    expect(failure({ code: "42501", message: "rls" }).error).toMatch(/isn't available any more/);
  });
});
