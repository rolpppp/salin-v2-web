import { describe, expect, it } from "vitest";
import { AccountType } from "../enums";
import { accountArchivedPatch, accountRenamePatch, accountRetypePatch, categoryRenamePatch } from "./patches";
import { newAccountRow } from "./builders";
import { accountRowSchema } from "./schemas";

const userId = "6f1c2a52-8d0e-4c43-9a57-0b6f6d6f1e01";

describe("account currency (ticket 13)", () => {
  it("defaults to PHP and accepts AUD / USD", () => {
    expect(newAccountRow({ userId, nowMs: 1, name: "A", type: "bank" }).currency).toBe("PHP");
    expect(newAccountRow({ userId, nowMs: 1, name: "A", type: "bank", currency: "AUD" }).currency).toBe("AUD");
  });
  it("rejects anything that is not a 3-letter code", () => {
    expect(() => newAccountRow({ userId, nowMs: 1, name: "A", type: "bank", currency: "peso" })).toThrow();
    expect(() => newAccountRow({ userId, nowMs: 1, name: "A", type: "bank", currency: "" })).toThrow();
  });
});

describe("patches", () => {
  it("rename trims and validates, and stamps updatedAt", () => {
    expect(accountRenamePatch("  Wallet ", 5)).toEqual({ name: "Wallet", updatedAt: 5 });
    expect(categoryRenamePatch("Kape", 6)).toEqual({ name: "Kape", updatedAt: 6 });
    expect(() => accountRenamePatch("   ", 1)).toThrow();
    expect(() => accountRenamePatch("x".repeat(61), 1)).toThrow();
  });
  it("retype writes the Dart enum index", () => {
    expect(accountRetypePatch("eWallet", 1)).toEqual({ accountType: AccountType.eWallet, updatedAt: 1 });
    expect(accountRetypePatch("eWallet", 1).accountType).toBe(3);
  });
  it("archive changes only isArchived and updatedAt; a patched row is still a valid mobile row", () => {
    const row = newAccountRow({ userId, nowMs: 1, name: "A", type: "bank", id: "1" });
    const patched = accountRowSchema.parse({ ...row, ...accountArchivedPatch(true, 9) });
    expect(patched).toEqual({ ...row, isArchived: true, updatedAt: 9 });
    expect(patched.deletedAt).toBeNull();
  });
  it("refuses a bad timestamp", () => {
    expect(() => accountArchivedPatch(true, -1)).toThrow();
    expect(() => accountArchivedPatch(true, 1.5)).toThrow();
  });
});
