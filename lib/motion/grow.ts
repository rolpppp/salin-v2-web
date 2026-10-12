import { formatPeso } from "@/lib/money";

/** The `?grow=` param on Today (ticket 15). `confirm` = back from Money in; `onboarding` = first look after setup. */
export type GrowMode = "confirm" | "onboarding";

export function parseGrow(value: string | string[] | undefined | null): GrowMode | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "confirm" || v === "onboarding" ? v : null;
}

/** Where the animation starts. Onboarding grows from zero; confirm from the values before today's confirms. */
export function growFrom(mode: GrowMode, prev: number | null | undefined): number {
  if (mode === "onboarding") return 0;
  return typeof prev === "number" && Number.isFinite(prev) ? prev : 0;
}

/**
 * How much of a ribbon of final size `to` is hidden when the animation starts, as a percentage (0 to 100).
 * Growing from `from` to `to` shows `from / to` of it. Shrinking or unchanged: nothing is hidden.
 */
export function clipStartPercent(from: number, to: number): number {
  if (to <= 0 || from >= to) return 0;
  const shown = Math.max(0, from) / to;
  return Math.round((1 - shown) * 10_000) / 100;
}

/** Stagger for the nth bucket's ribbon, in ms (60ms per bucket, DESIGN.md "Motion"). */
export const GROW_STAGGER_MS = 60;
/** How long the grow flag stays on the page before it is cleared (the longest animation ends near 2.3s). */
export const GROW_CLEAR_MS = 2600;

/** What the polite live region says when the grow plays, so the animated change is never conveyed by motion alone. */
export function growAnnouncement(mode: GrowMode, a: { totalMinor: number | null; passed: ReadonlyArray<{ name: string; milestone: number }> }): string {
  const lead = mode === "onboarding" ? "Your plan is set." : "Your buckets are updated.";
  const total = a.totalMinor === null ? "" : ` ${formatPeso(a.totalMinor)} in all buckets.`;
  const passed = a.passed.map((p) => ` ${p.name} passed ${p.milestone}%.`).join("");
  return `${lead}${total}${passed}`;
}
