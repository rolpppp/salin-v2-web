import { MAX_MINOR } from "./core";
import type { Minor } from "./core";

export type MoneyParseError =
  | "empty"
  | "not_a_number"
  | "too_many_decimals"
  | "not_positive"
  | "too_large";

export type MoneyParseResult =
  | { ok: true; minor: Minor }
  | { ok: false; error: MoneyParseError };

export interface ParseMoneyOptions {
  /** Require > 0 (default true). When false, 0 is accepted. Negatives are never accepted. */
  requirePositive?: boolean;
  /** Upper bound in centavos (default ₱10,000,000.00). */
  max?: Minor;
}

const PLAIN = /^(\d+(\.\d*)?|\.\d+)$/;
const GROUPED = /^\d{1,3}(,\d{3})+(\.\d*)?$/;

/**
 * Parses what a person types into integer centavos, with no floating point.
 * Accepts `17,410`, `17410.5`, `₱17,410`, `₱ 17 410.50` (spaces ignored).
 * Rejects garbage, more than 2 decimal places, 0/negative (unless allowed) and
 * anything above the max (default ₱10,000,000.00).
 */
export function parseMoney(input: string, opts: ParseMoneyOptions = {}): MoneyParseResult {
  const requirePositive = opts.requirePositive ?? true;
  const max = opts.max ?? MAX_MINOR;
  let s = input.replace(/[\s ]/g, "").replace(/^₱/, "");
  if (s === "") return { ok: false, error: "empty" };
  let negative = false;
  if (s.startsWith("-") || s.startsWith("−")) {
    negative = true;
    s = s.slice(1);
  }
  if (!(PLAIN.test(s) || GROUPED.test(s)) || s.endsWith(".")) {
    return { ok: false, error: "not_a_number" };
  }
  s = s.replace(/,/g, "");
  const [intRaw = "", fracRaw = ""] = s.split(".");
  if (fracRaw.length > 2) return { ok: false, error: "too_many_decimals" };
  const intPart = intRaw.replace(/^0+(?=\d)/, "");
  // Longer than 12 digits is certainly above the cap; avoid building huge numbers.
  if (intPart.length > 12) return { ok: false, error: negative ? "not_positive" : "too_large" };
  const minor = Number(intPart === "" ? "0" : intPart) * 100 + Number(fracRaw.padEnd(2, "0"));
  if (negative) return { ok: false, error: "not_positive" };
  if (requirePositive && minor <= 0) return { ok: false, error: "not_positive" };
  if (minor > max) return { ok: false, error: "too_large" };
  return { ok: true, minor };
}

export type MoneyField = "received" | "spent" | "aud";

/** The exact SPEC copy (SPEC.md §3 Add income, §8 Log spending) for each field and error. */
export const MONEY_ERROR_MESSAGES: Record<MoneyField, Record<MoneyParseError, string>> = {
  received: {
    empty: "Enter the amount you received, above ₱0.",
    not_a_number: "Enter the amount you received, above ₱0.",
    too_many_decimals: "Enter the amount you received, above ₱0.",
    not_positive: "Enter the amount you received, above ₱0.",
    too_large: "That amount looks too large. Check the number of zeros.",
  },
  spent: {
    empty: "Enter what you spent, above ₱0.",
    not_a_number: "Enter what you spent, above ₱0.",
    too_many_decimals: "Enter what you spent, above ₱0.",
    not_positive: "Enter what you spent, above ₱0.",
    too_large: "That amount looks too large. Check the number of zeros.",
  },
  aud: {
    empty: "The A$ amount isn't a number. Fix it or leave it empty.",
    not_a_number: "The A$ amount isn't a number. Fix it or leave it empty.",
    too_many_decimals: "The A$ amount isn't a number. Fix it or leave it empty.",
    not_positive: "The A$ amount isn't a number. Fix it or leave it empty.",
    too_large: "That amount looks too large. Check the number of zeros.",
  },
};

export function moneyErrorMessage(field: MoneyField, error: MoneyParseError): string {
  return MONEY_ERROR_MESSAGES[field][error];
}
