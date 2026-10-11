import { describe, expect, it } from "vitest";
import { MAX_MINOR } from "./core";
import { MONEY_ERROR_MESSAGES, moneyErrorMessage, parseMoney } from "./parse";

const ok = (minor: number) => ({ ok: true, minor });
const bad = (error: string) => ({ ok: false, error });

describe("parseMoney accepts", () => {
  it.each([
    ["17,410", 1741000],
    ["17410.5", 1741050],
    ["₱17,410", 1741000],
    ["₱ 17,410.25", 1741025],
    [" 17 410 ", 1741000],
    ["17410", 1741000],
    ["0.01", 1],
    [".5", 50],
    ["10,000,000", MAX_MINOR],
    ["10000000.00", MAX_MINOR],
    ["007", 700],
    ["1,234,567.89", 123456789],
  ])("%s", (input, minor) => {
    expect(parseMoney(input)).toEqual(ok(minor));
  });
});

describe("parseMoney rejects", () => {
  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["₱", "empty"],
    ["abc", "not_a_number"],
    ["12abc", "not_a_number"],
    ["1,2,3", "not_a_number"],
    ["1,23", "not_a_number"],
    ["1.2.3", "not_a_number"],
    ["17410.", "not_a_number"],
    ["1e5", "not_a_number"],
    ["Infinity", "not_a_number"],
    ["17.123", "too_many_decimals"],
    ["17.100", "too_many_decimals"],
    ["0", "not_positive"],
    ["0.00", "not_positive"],
    ["-5", "not_positive"],
    ["−5", "not_positive"],
    ["10,000,000.01", "too_large"],
    ["99999999999999999999", "too_large"],
  ])("%s -> %s", (input, error) => {
    expect(parseMoney(input)).toEqual(bad(error));
  });
  it("allows zero when requirePositive is false, never negatives", () => {
    expect(parseMoney("0", { requirePositive: false })).toEqual(ok(0));
    expect(parseMoney("-1", { requirePositive: false })).toEqual(bad("not_positive"));
  });
  it("honours a custom max", () => {
    expect(parseMoney("500", { max: 10000 })).toEqual(bad("too_large"));
    expect(parseMoney("100", { max: 10000 })).toEqual(ok(10000));
  });
});

describe("error messages (SPEC copy)", () => {
  it("maps to the exact strings", () => {
    expect(moneyErrorMessage("received", "not_positive")).toBe("Enter the amount you received, above ₱0.");
    expect(moneyErrorMessage("received", "too_large")).toBe("That amount looks too large. Check the number of zeros.");
    expect(moneyErrorMessage("spent", "empty")).toBe("Enter what you spent, above ₱0.");
    expect(moneyErrorMessage("aud", "not_a_number")).toBe("The A$ amount isn't a number. Fix it or leave it empty.");
  });
  it("covers every error key for every field", () => {
    for (const field of Object.values(MONEY_ERROR_MESSAGES)) expect(Object.keys(field).sort()).toEqual(["empty", "not_a_number", "not_positive", "too_large", "too_many_decimals"]);
  });
});
