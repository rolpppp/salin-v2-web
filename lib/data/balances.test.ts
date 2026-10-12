import { describe, expect, it } from "vitest";
import { LedgerOrigin, MoneyDirection } from "@/lib/domain/enums";
import { computeWeekSpending, type EntryRow } from "./balances";

const row = (direction: number, origin: number, amountMinor: number, categoryId: string | null = null): EntryRow => ({
  accountId: "a1",
  amountMinor,
  direction,
  origin,
  categoryId,
  occurredAt: 500,
  deletedAt: null,
});
const range = { startMs: 0, endMs: 1000 };
const cur = new Map([["a1", "PHP"]]);

describe("computeWeekSpending with balance adjustments", () => {
  it("counts an outflow adjustment as spending and an inflow adjustment as negative spending", () => {
    const out = computeWeekSpending(
      [
        row(MoneyDirection.outflow, LedgerOrigin.manual, 10_000, "groc"),
        row(MoneyDirection.outflow, LedgerOrigin.adjustment, 4_000),
        row(MoneyDirection.inflow, LedgerOrigin.adjustment, 1_500),
      ],
      cur,
      range,
    );
    expect(out).toEqual([
      {
        currency: "PHP",
        totalMinor: 12_500,
        byCategory: [
          { categoryId: "groc", totalMinor: 10_000 },
          { categoryId: null, totalMinor: 2_500 },
        ],
      },
    ]);
  });
  it("still ignores transfers and plain inflows", () => {
    expect(
      computeWeekSpending([row(MoneyDirection.outflow, LedgerOrigin.transfer, 9), row(MoneyDirection.inflow, LedgerOrigin.manual, 9)], cur, range),
    ).toEqual([]);
  });
});
