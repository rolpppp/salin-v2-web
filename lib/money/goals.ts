import { assertMinor, ceilDiv } from "./core";
import type { Bp, Minor } from "./core";

export const MILESTONES_PERCENT = [25, 50, 75, 100] as const;
export type Milestone = (typeof MILESTONES_PERCENT)[number];

/** Progress in basis points, floored, capped to 0..10000 (BR §7.1). */
export function goalProgressBp(saved: Minor, target: Minor): Bp {
  assertMinor(saved, "saved");
  assertMinor(target, "target");
  if (target <= 0) throw new RangeError("target must be > 0");
  if (saved <= 0) return 0;
  if (saved >= target) return 10_000;
  return Number((BigInt(saved) * 10_000n) / BigInt(target));
}

/**
 * Milestones crossed by a move from `savedBefore` to `savedAfter` (BR §7.3): those that were
 * below before and at-or-above now. Exact integer comparison (no rounding of progress).
 */
export function milestonesCrossed(savedBefore: Minor, savedAfter: Minor, target: Minor): Milestone[] {
  assertMinor(savedBefore, "savedBefore");
  assertMinor(savedAfter, "savedAfter");
  if (target <= 0) throw new RangeError("target must be > 0");
  const b = BigInt(Math.min(savedBefore, target)) * 100n;
  const a = BigInt(Math.min(savedAfter, target)) * 100n;
  const t = BigInt(target);
  return MILESTONES_PERCENT.filter((m) => b < BigInt(m) * t && a >= BigInt(m) * t);
}

/**
 * "About N more paydays like {date}" (BR §7.4): ceil((target − saved) ÷ last Work payday's
 * Emergency share). Returns null when there is no Work payday yet (hide the line).
 */
export function paydaysToGo(saved: Minor, target: Minor, lastWorkPaydayEmergencyShare: Minor | null | undefined): number | null {
  if (lastWorkPaydayEmergencyShare === null || lastWorkPaydayEmergencyShare === undefined || lastWorkPaydayEmergencyShare <= 0) return null;
  const remaining = target - saved;
  if (remaining <= 0) return 0;
  return ceilDiv(remaining, lastWorkPaydayEmergencyShare);
}
