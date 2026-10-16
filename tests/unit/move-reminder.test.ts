import { describe, expect, it } from "vitest";
import { moveReminder } from "@/components/today/BucketDrawerBody";

describe("moveReminder (ticket 38)", () => {
  it("names the accounts when the two buckets are kept in different ones", () => {
    expect(moveReminder("MariBank", "GCash", 100_000)).toBe("Also move ₱1,000.00 from MariBank to GCash in your apps. Accounts will show the difference until the balances match.");
  });
  it("says nothing when they share an account, or an account or amount is missing", () => {
    expect(moveReminder("GCash", "GCash", 100)).toBeNull();
    expect(moveReminder(null, "GCash", 100)).toBeNull();
    expect(moveReminder("GCash", null, 100)).toBeNull();
    expect(moveReminder("MariBank", "GCash", 0)).toBeNull();
  });
});
