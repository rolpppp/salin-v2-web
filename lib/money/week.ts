import { sum } from "./core";
import type { Minor } from "./core";

// ---------------------------------------------------------------- week slip (BR §8.3)

/** How a bucket's `left` is counted on the slip. */
export type SlipRole = "spend" | "save" | "tax" | "cushion";

export interface SlipBucket {
  /**
   * spend   = Spend group (Living, Fun)            -> Safe to spend
   * save    = Save & grow group                    -> Put away
   * tax     = Tax                                  -> Tax set aside
   * cushion = Buffer + Scholarship + Rent          -> Cushions & kept whole
   */
  role: SlipRole;
  /** The bucket's LEFT (not its allocations). */
  left: Minor;
}

export interface WeekSlipInput {
  /** Σ of all income that came in (confirmed or waiting). */
  cameIn: Minor;
  /** Σ spending. */
  spent: Minor;
  /** Waiting income not yet given a job. */
  toAssign: Minor;
  buckets: readonly SlipBucket[];
}

export interface WeekSlip {
  cameIn: Minor;
  spent: Minor;
  putAway: Minor;
  taxSetAside: Minor;
  cushionsAndKeptWhole: Minor;
  toAssign: Minor;
  safeToSpend: Minor;
  /** cameIn − (the six parts). Must be 0 when the books are consistent. */
  difference: Minor;
  reconciles: boolean;
}

const sumRole = (bs: readonly SlipBucket[], role: SlipRole): Minor => sum(bs.filter((b) => b.role === role).map((b) => b.left));

/**
 * `Came in = Spent + Put away + Tax set aside + Cushions & kept whole + To assign + Safe to spend`,
 * using each bucket's LEFT so it stays true when money is spent from a set-aside (covers net to zero).
 */
export function weekSlip(input: WeekSlipInput): WeekSlip {
  const putAway = sumRole(input.buckets, "save");
  const taxSetAside = sumRole(input.buckets, "tax");
  const cushionsAndKeptWhole = sumRole(input.buckets, "cushion");
  const safeToSpend = sumRole(input.buckets, "spend");
  const difference = input.cameIn - sum([input.spent, putAway, taxSetAside, cushionsAndKeptWhole, input.toAssign, safeToSpend]);
  return {
    cameIn: input.cameIn,
    spent: input.spent,
    putAway,
    taxSetAside,
    cushionsAndKeptWhole,
    toAssign: input.toAssign,
    safeToSpend,
    difference,
    reconciles: difference === 0,
  };
}

// ---------------------------------------------------------------- week loop (BR §8.1, §12.6)

export type LoopPhase = "regular" | "starting_plan" | "starting_track";

export type StepId = "payday" | "assign" | "move" | "living" | "review" | "setup" | "plan_set" | "pay" | "make_plan" | "log";

export interface LoopStep {
  id: StepId;
  label: string;
  done: boolean;
}

export interface LoopInput {
  phase: LoopPhase;
  /** Incomes waiting for a job. */
  waitingCount: number;
  /** Confirmed paydays (any source) so far; used by "at least one confirmed". */
  confirmedCount: number;
  /** A real confirmed Work payday exists this week (the endowed step). */
  hasConfirmedWorkPaydayThisWeek: boolean;
  /** Transfers not yet done (sent !== amount). */
  pendingTransfers: number;
  livingLeft: Minor;
  weekClosed: boolean;
  /** starting_plan: any allocation exists. */
  anyAllocation: boolean;
  /** starting_track: a first pay has been recorded. */
  anyPayRecorded: boolean;
  /** starting_track: a plan has been made. */
  hasPlan: boolean;
  /** An expense entered after `user_profiles.onboardedAt` (web or phone) exists. */
  spendingLoggedAfterOnboarding: boolean;
}

/** The loop's steps, in order, with their done flags. */
export function weekLoopSteps(i: LoopInput): LoopStep[] {
  switch (i.phase) {
    case "regular":
      return [
        { id: "payday", label: "Last payday split", done: i.hasConfirmedWorkPaydayThisWeek },
        { id: "assign", label: "All money in has a job", done: i.waitingCount === 0 },
        { id: "move", label: "Transfers made", done: i.waitingCount === 0 && i.confirmedCount > 0 && i.pendingTransfers === 0 },
        { id: "living", label: "Living above zero", done: i.livingLeft >= 0 },
        { id: "review", label: "Week closed", done: i.weekClosed },
      ];
    case "starting_plan":
      return [
        { id: "plan_set", label: "Plan set up", done: true },
        { id: "pay", label: "First pay has a job", done: i.anyAllocation },
        { id: "move", label: "Transfers made", done: i.anyAllocation && i.pendingTransfers === 0 },
        { id: "log", label: "First spending logged", done: i.spendingLoggedAfterOnboarding },
        { id: "review", label: "First week closed", done: i.weekClosed },
      ];
    case "starting_track":
      return [
        { id: "setup", label: "Income and accounts set up", done: true },
        { id: "make_plan", label: "Make a plan", done: i.hasPlan },
        { id: "pay", label: "First pay recorded", done: i.anyPayRecorded },
        { id: "log", label: "First spending logged", done: i.spendingLoggedAfterOnboarding },
        { id: "review", label: "First week closed", done: i.weekClosed },
      ];
  }
}

/**
 * Which step the next-step card shows (BR §12.6): waiting income always comes first
 * (`assign`), then the first unfinished step; null when everything is done.
 */
export function nextStep(steps: readonly LoopStep[], waitingCount: number): StepId | null {
  if (waitingCount > 0) return "assign";
  return steps.find((s) => !s.done)?.id ?? null;
}

/** Closing is always allowed, open items carry into next week (BR §8.2). */
export function canCloseWeek(): true {
  return true;
}
