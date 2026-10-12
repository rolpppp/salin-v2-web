/** Plan names for labels around the app. Plans are keyed by an immutable key; the name is what people read. */
export type PlanNames = Record<string, string> | undefined;

/** "Saving for Japan" for a named plan; "Plan A" when no name is known (older data, or a plan without a name). */
export function planLabel(names: PlanNames, key: string): string {
  const n = names?.[key]?.trim();
  return n ? n : `Plan ${key}`;
}

/** "Plan A and Plan B" / "Plan A, Saving for Japan and Plan B" for a confirmation sentence. */
export function joinPlanNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
