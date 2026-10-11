export const PLAN_SECTIONS = [
  { value: "split", label: "Split plan" },
  { value: "income", label: "Income" },
  { value: "accounts", label: "Accounts" },
  { value: "categories", label: "Categories" },
  { value: "goals", label: "Goals" },
] as const;

export type PlanSection = (typeof PLAN_SECTIONS)[number]["value"];

export function isPlanSection(value: string): value is PlanSection {
  return PLAN_SECTIONS.some((s) => s.value === value);
}
