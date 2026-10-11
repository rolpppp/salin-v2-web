import { describe, expect, it } from "vitest";
import { LedgerOrigin, MoneyDirection } from "@/lib/domain/enums";
import { holdCaption, retained } from "./accounts";

describe("holdCaption (BR 5.1)", () => {
  it("a bucket is kept here", () => expect(holdCaption(true, 0)).toBe("should be here, by your buckets"));
  it("G12: moved away but money from earlier paydays is still here", () =>
    expect(holdCaption(false, 690_000)).toBe("from earlier paydays, no bucket is kept here now"));
  it("nothing kept and nothing held", () => expect(holdCaption(false, 0)).toBe("no buckets kept here"));
});

describe("retained (BR 5.2): received minus transferred out", () => {
  const e = (direction: number, origin: number, amountMinor: number) => ({ direction, origin, amountMinor });
  it("counts income, subtracts transfers out, ignores transfers in and spending", () => {
    expect(
      retained([
        e(MoneyDirection.inflow, LedgerOrigin.manual, 1_741_000),
        e(MoneyDirection.outflow, LedgerOrigin.transfer, 40_000),
        e(MoneyDirection.inflow, LedgerOrigin.transfer, 99), // a transfer in is not "received"
        e(MoneyDirection.outflow, LedgerOrigin.manual, 500), // spending is not a transfer
      ]),
    ).toBe(1_701_000);
  });
  it("is 0 with no entries", () => expect(retained([])).toBe(0));
});
