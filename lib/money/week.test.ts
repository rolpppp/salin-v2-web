import { describe, expect, it } from "vitest";
import { bucketLeft } from "./buckets";
import { PLAN_A, planOpts, toMap } from "./testkit";
import { splitByPlan } from "./split";
import { canCloseWeek, nextStep, weekLoopSteps, weekSlip } from "./week";
import type { LoopInput } from "./week";
import type { SlipBucket, SlipRole } from "./week";

const ROLE: Record<string, SlipRole> = { living: "spend", fun: "spend", emergency: "save", invest: "save", sinking: "save", tax: "tax", buffer: "cushion", dost: "cushion", rent: "cushion" };

function slipFor(spend: Record<string, number>, covers: { from: string; to: string; amt: number }[], waiting: number) {
  const oct7 = toMap(splitByPlan(1732900, PLAN_A, planOpts("2026-10-07")));
  const buckets: SlipBucket[] = Object.keys(ROLE).map((id) => ({
    role: ROLE[id] as SlipRole,
    left: bucketLeft({
      allocated: oct7[id] ?? 0,
      spent: spend[id] ?? 0,
      coversIn: covers.filter((c) => c.to === id).reduce((t, c) => t + c.amt, 0),
      coversOut: covers.filter((c) => c.from === id).reduce((t, c) => t + c.amt, 0),
    }),
  }));
  const spent = Object.values(spend).reduce((t, v) => t + v, 0);
  return weekSlip({ cameIn: 1732900 + waiting, spent, toAssign: waiting, buckets });
}

describe("weekSlip reconciles (§8.3)", () => {
  it("prototype starting state with waiting income", () => {
    const s = slipFor({ living: 130000, fun: 130050 }, [], 2800000);
    expect(s.reconciles).toBe(true);
    expect(s.safeToSpend).toBe(34543);
    expect(s.toAssign).toBe(2800000);
  });
  it("still reconciles when money is spent from a set-aside (BIR payment from Tax)", () => {
    const s = slipFor({ living: 130000, fun: 130050, tax: 50000 }, [], 0);
    expect(s.reconciles).toBe(true);
    expect(s.taxSetAside).toBe(103974 - 50000);
  });
  it("covers net to zero", () => {
    const a = slipFor({ living: 130000, fun: 130050 }, [], 0);
    const b = slipFor({ living: 130000, fun: 130050 }, [{ from: "buffer", to: "living", amt: 8697 }], 0);
    expect(b.reconciles).toBe(true);
    expect(b.putAway).toBe(a.putAway);
    expect(b.cushionsAndKeptWhole + b.safeToSpend).toBe(a.cushionsAndKeptWhole + a.safeToSpend);
    expect(b.safeToSpend).toBe(a.safeToSpend + 8697);
  });
  it("reports a non-zero difference instead of hiding it", () => {
    const s = weekSlip({ cameIn: 1000, spent: 0, toAssign: 0, buckets: [{ role: "spend", left: 900 }] });
    expect(s.reconciles).toBe(false);
    expect(s.difference).toBe(100);
  });
});

const base: LoopInput = {
  phase: "regular",
  waitingCount: 0,
  confirmedCount: 0,
  hasConfirmedWorkPaydayThisWeek: false,
  pendingTransfers: 0,
  livingLeft: 100,
  weekClosed: false,
  anyAllocation: false,
  anyPayRecorded: false,
  hasPlan: false,
  spendingLoggedAfterOnboarding: false,
};
const done = (i: LoopInput) => Object.fromEntries(weekLoopSteps(i).map((s) => [s.id, s.done]));

describe("weekLoopSteps regular (§8.1)", () => {
  it("empty week", () => {
    expect(done(base)).toEqual({ payday: false, assign: true, move: false, living: true, review: false });
  });
  it("payday step needs a real confirmed Work payday this week", () => {
    expect(done({ ...base, hasConfirmedWorkPaydayThisWeek: true }).payday).toBe(true);
  });
  it("transfers step needs nothing waiting, one confirmed and nothing pending", () => {
    expect(done({ ...base, confirmedCount: 1 }).move).toBe(true);
    expect(done({ ...base, confirmedCount: 1, pendingTransfers: 2 }).move).toBe(false);
    expect(done({ ...base, confirmedCount: 1, waitingCount: 1 }).move).toBe(false);
  });
  it("Living above zero is done at 0, not done below", () => {
    expect(done({ ...base, livingLeft: 0 }).living).toBe(true);
    expect(done({ ...base, livingLeft: -8697 }).living).toBe(false);
  });
  it("closing is always allowed", () => expect(canCloseWeek()).toBe(true));
});

describe("weekLoopSteps first week (§12.6)", () => {
  it("with a plan", () => {
    const s = weekLoopSteps({ ...base, phase: "starting_plan", anyAllocation: true, pendingTransfers: 1 });
    expect(s.map((x) => [x.id, x.done])).toEqual([["plan_set", true], ["pay", true], ["move", false], ["log", false], ["review", false]]);
  });
  it("transfers need a payday to exist", () => {
    expect(done({ ...base, phase: "starting_plan", anyAllocation: false }).move).toBe(false);
  });
  it("just tracking", () => {
    const s = weekLoopSteps({ ...base, phase: "starting_track", anyPayRecorded: true });
    expect(s.map((x) => [x.id, x.done])).toEqual([["setup", true], ["make_plan", false], ["pay", true], ["log", false], ["review", false]]);
  });
  it("spending logged only counts after onboarding (input flag)", () => {
    expect(done({ ...base, phase: "starting_plan", spendingLoggedAfterOnboarding: true }).log).toBe(true);
  });
});

describe("nextStep", () => {
  it("waiting income always first", () => {
    expect(nextStep(weekLoopSteps({ ...base, phase: "starting_plan", waitingCount: 1 }), 1)).toBe("assign");
  });
  it("else the first unfinished step", () => {
    expect(nextStep(weekLoopSteps({ ...base, phase: "starting_plan", anyAllocation: true, pendingTransfers: 1 }), 0)).toBe("move");
  });
  it("null when all done", () => {
    expect(nextStep(weekLoopSteps({ ...base, phase: "starting_plan", anyAllocation: true, spendingLoggedAfterOnboarding: true, weekClosed: true }), 0)).toBeNull();
  });
});
