import { describe, expect, it } from "vitest";
import {
  MobileRowError,
  accountFromRow,
  accountRowSchema,
  categoryFromRow,
  ledgerEntryFromRow,
  newAccountRow,
  newCategoryRow,
  newIncomeEntryRow,
  newSpendingEntryRow,
  newTransferRows,
  softDelete,
  transferFromRow,
  validateName,
} from "./index";

const userId = "11111111-1111-4111-8111-111111111111";
const nowMs = 1_791_700_000_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("validateName", () => {
  it("trims and accepts 1-60 chars", () => {
    expect(validateName("  Pag-IBIG MP2 ₱ ñ  ")).toBe("Pag-IBIG MP2 ₱ ñ");
    expect(validateName("a".repeat(60))).toHaveLength(60);
  });
  it("rejects empty, whitespace and > 60", () => {
    expect(() => validateName("")).toThrow(MobileRowError);
    expect(() => validateName("   ")).toThrow(MobileRowError);
    expect(() => validateName("a".repeat(61))).toThrow(MobileRowError);
  });
});

describe("newAccountRow", () => {
  it("fills every column like mobile", () => {
    const r = newAccountRow({ userId, nowMs, name: "GCash", type: "eWallet", openingBalanceMinor: 12_345 });
    expect(r.id).toMatch(UUID_V4);
    expect(r).toEqual({
      id: r.id,
      user_id: userId,
      name: "GCash",
      accountType: 3,
      openingBalanceMinor: 12_345,
      currency: "PHP",
      icon: "default_icon",
      color: null,
      displayOrder: nowMs,
      isArchived: false,
      createdAt: nowMs,
      updatedAt: nowMs,
      deletedAt: null,
      syncStatus: 2,
    });
    expect(accountRowSchema.parse(r)).toEqual(r);
  });
  it("gives distinct ids within one millisecond", () => {
    const a = newAccountRow({ userId, nowMs, name: "A", type: "cash" });
    const b = newAccountRow({ userId, nowMs, name: "B", type: "cash" });
    expect(a.id).not.toBe(b.id);
  });
  it("rejects negatives, floats and bad names", () => {
    expect(() => newAccountRow({ userId, nowMs, name: "x", type: "cash", openingBalanceMinor: -1 })).toThrow();
    expect(() => newAccountRow({ userId, nowMs, name: "x", type: "cash", openingBalanceMinor: 1.5 })).toThrow();
    expect(() => newAccountRow({ userId, nowMs, name: " ", type: "cash" })).toThrow();
    expect(() => newAccountRow({ userId: "nope", nowMs, name: "x", type: "cash" })).toThrow();
  });
  it("maps back to a domain model", () => {
    const a = accountFromRow(newAccountRow({ userId, nowMs, name: "BDO", type: "savings" }));
    expect(a).toMatchObject({ type: "savings", syncStatus: "synced", deletedAt: null, userId });
  });
});

describe("newCategoryRow", () => {
  it("builds income and expense categories with mobile defaults", () => {
    const inc = newCategoryRow({ userId, nowMs, name: "Salary (AU)", type: "income" });
    const exp = newCategoryRow({ userId, nowMs, name: "Coffee", type: "expense", color: "#A83232", icon: "food" });
    expect(inc).toMatchObject({ categoryType: 0, isSystem: false, icon: "category", color: "#2E6EA6", syncStatus: 2, deletedAt: null });
    expect(exp).toMatchObject({ categoryType: 1, color: "#A83232", icon: "food" });
    expect(categoryFromRow(exp).type).toBe("expense");
  });
});

describe("ledger entries", () => {
  it("income: inflow, manual, category set, uuid v4 id", () => {
    const r = newIncomeEntryRow({ userId, nowMs, accountId: "a1", categoryId: "c1", amountMinor: 1_732_900, occurredAt: nowMs - 1000 });
    expect(r).toMatchObject({ direction: 0, origin: 0, categoryId: "c1", transferId: null, note: null, metadataJson: null, syncStatus: 2 });
    expect(r.id).toMatch(UUID_V4);
    expect(ledgerEntryFromRow(r)).toMatchObject({ direction: "inflow", origin: "manual" });
  });
  it("spending: outflow, manual", () => {
    const r = newSpendingEntryRow({ userId, nowMs, accountId: "a1", categoryId: "c2", amountMinor: 1, occurredAt: nowMs, note: "Jollibee ₱" });
    expect(r).toMatchObject({ direction: 1, origin: 0, note: "Jollibee ₱" });
  });
  it("accepts the max amount and rejects 0, floats, negatives and over-max", () => {
    const ok = { userId, nowMs, accountId: "a1", categoryId: "c", occurredAt: nowMs };
    expect(newSpendingEntryRow({ ...ok, amountMinor: 1_000_000_000 }).amountMinor).toBe(1_000_000_000);
    for (const amountMinor of [0, -5, 1.5, 1_000_000_001, Number.NaN]) {
      expect(() => newSpendingEntryRow({ ...ok, amountMinor })).toThrow(MobileRowError);
    }
  });
  it("requires a category", () => {
    expect(() => newIncomeEntryRow({ userId, nowMs, accountId: "a", categoryId: "", amountMinor: 1, occurredAt: nowMs })).toThrow();
  });
});

describe("newTransferRows", () => {
  const input = { userId, nowMs, fromAccountId: "a1", toAccountId: "a2", amountMinor: 554_528, occurredAt: nowMs + 5 };
  it("produces T, T_out, T_in like mobile", () => {
    const { transfer, outLeg, inLeg } = newTransferRows(input);
    expect(transfer.id).toMatch(UUID_V4);
    expect(outLeg.id).toBe(`${transfer.id}_out`);
    expect(inLeg.id).toBe(`${transfer.id}_in`);
    expect(transfer.note).toBe("Transfer");
    expect(outLeg).toMatchObject({ accountId: "a1", direction: 1, origin: 3, categoryId: null, transferId: transfer.id, amountMinor: 554_528, occurredAt: nowMs + 5, note: "Transfer" });
    expect(inLeg).toMatchObject({ accountId: "a2", direction: 0, origin: 3, categoryId: null, transferId: transfer.id });
    expect(transferFromRow(transfer)).toMatchObject({ fromAccountId: "a1", toAccountId: "a2" });
  });
  it("keeps a custom note and an explicit id", () => {
    const { transfer, outLeg } = newTransferRows({ ...input, id: "T9", note: " Emergency fund " });
    expect(transfer).toMatchObject({ id: "T9", note: "Emergency fund" });
    expect(outLeg.id).toBe("T9_out");
  });
  it("rejects same-account transfers and bad amounts", () => {
    expect(() => newTransferRows({ ...input, toAccountId: "a1" })).toThrow(MobileRowError);
    expect(() => newTransferRows({ ...input, amountMinor: 0 })).toThrow(MobileRowError);
  });
});

describe("softDelete", () => {
  it("sets deletedAt and updatedAt only", () => {
    const a = newAccountRow({ userId, nowMs, name: "Old", type: "cash" });
    const d = softDelete(a, nowMs + 10);
    expect(d).toEqual({ ...a, deletedAt: nowMs + 10, updatedAt: nowMs + 10 });
    expect(a.deletedAt).toBeNull();
    expect(accountRowSchema.parse(d)).toEqual(d);
  });
});

describe("schemas", () => {
  it("rejects unknown enum indexes, extra columns, missing columns", () => {
    const a = newAccountRow({ userId, nowMs, name: "x", type: "cash" });
    expect(() => accountRowSchema.parse({ ...a, accountType: 99 })).toThrow();
    expect(() => accountRowSchema.parse({ ...a, extra: 1 })).toThrow();
    const missing: Record<string, unknown> = { ...a };
    delete missing.icon;
    expect(() => accountRowSchema.parse(missing)).toThrow();
    expect(() => accountRowSchema.parse({ ...a, isArchived: 0 })).toThrow();
  });
});
