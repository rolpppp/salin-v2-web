import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENUMS } from "./enums";

const DEFAULT_PATH = "/Volumes/RolfStuffs/Developer/salin-v2/lib/shared/enums/financial_enums.dart";
const dartPath = process.env.SALIN_MOBILE_ENUMS_PATH ?? DEFAULT_PATH;
const available = existsSync(dartPath);

/** Parses `enum Name { a, b, c }` blocks (comments stripped). Returns names in declaration order. */
function parseDartEnums(src: string): Record<string, string[]> {
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const out: Record<string, string[]> = {};
  const re = /enum\s+(\w+)\s*(?:with\s+[^{]+|implements\s+[^{]+)?\{([\s\S]*?)\n\}/g;
  for (const m of clean.matchAll(re)) {
    const body = (m[2] as string).split(";")[0] as string; // enhanced enums: members end at first ';'
    const names: string[] = [];
    // split on top-level commas (ignore commas inside parentheses)
    let depth = 0;
    let cur = "";
    for (const ch of body) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        names.push(cur);
        cur = "";
      } else cur += ch;
    }
    names.push(cur);
    out[m[1] as string] = names.map((n) => (/^\s*(\w+)/.exec(n)?.[1] ?? "")).filter((n) => n !== "");
  }
  return out;
}

describe("enum map matches mobile financial_enums.dart", () => {
  if (!available) {
    it.skip(`SKIPPED: Dart enum file not found at ${dartPath}. Set SALIN_MOBILE_ENUMS_PATH to run the drift check.`, () => {});
    return;
  }
  const dart = parseDartEnums(readFileSync(dartPath, "utf8"));
  for (const [name, members] of Object.entries(ENUMS)) {
    it(`${name}: names and order match the Dart enum`, () => {
      const dartNames = dart[name];
      expect(dartNames, `${name} not found in ${dartPath}`).toBeDefined();
      const ours = Object.entries(members as Record<string, number>)
        .sort((a, b) => a[1] - b[1])
        .map(([k]) => k);
      expect(ours).toEqual(dartNames);
      // stored integer = Dart index, contiguous from 0
      expect(Object.values(members as Record<string, number>).sort((a, b) => a - b)).toEqual(ours.map((_, i) => i));
    });
  }
});

describe("enum map (DATA_MODEL §1.3), pinned independent of the Dart file", () => {
  it("has the documented integers", () => {
    expect(ENUMS.AccountType).toEqual({ cash: 0, bank: 1, savings: 2, eWallet: 3, creditCard: 4, debitCard: 5, investment: 6 });
    expect(ENUMS.MoneyDirection).toEqual({ inflow: 0, outflow: 1 });
    expect(ENUMS.LedgerOrigin.transfer).toBe(3);
    expect(ENUMS.LedgerOrigin.migration).toBe(8);
    expect(ENUMS.SyncStatus.synced).toBe(2);
    expect(ENUMS.WeekStart).toEqual({ sunday: 0, monday: 1 });
    expect(ENUMS.CategoryType).toEqual({ income: 0, expense: 1 });
  });
});
