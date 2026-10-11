/** Income source kinds, in the order the preset chips show them (SPEC 4.2). */
export type IncomeKind = "salary" | "scholarship" | "side_hustle" | "allowance" | "gift" | "refund" | "other";
export type IncomeRule = "plan" | "own" | "whole" | "ask";

export const INCOME_KINDS: ReadonlyArray<{ kind: IncomeKind; label: string; hue: string }> = [
  { kind: "salary", label: "Salary", hue: "invest" },
  { kind: "scholarship", label: "Scholarship", hue: "dost" },
  { kind: "side_hustle", label: "Side hustle", hue: "fun" },
  { kind: "allowance", label: "Allowance", hue: "living" },
  { kind: "gift", label: "Gift", hue: "sinking" },
  { kind: "refund", label: "Refund", hue: "buffer" },
  { kind: "other", label: "Other", hue: "rent" },
];

export const kindLabel = (kind: IncomeKind): string => INCOME_KINDS.find((k) => k.kind === kind)?.label ?? "Other";

export const RULE_OPTIONS: ReadonlyArray<{ value: IncomeRule; label: string }> = [
  { value: "plan", label: "Split by my plan" },
  { value: "own", label: "Its own split" },
  { value: "whole", label: "Keep it whole" },
  { value: "ask", label: "Ask me each time" },
];
