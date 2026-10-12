import { describe, expect, it } from "vitest";
import { isFreshRecoverySession, RECOVERY_WINDOW_SECONDS } from "./recovery";

const NOW = 1_800_000_000_000;
const sec = NOW / 1000;

describe("isFreshRecoverySession", () => {
  it("accepts a recovery session inside the window", () => {
    expect(isFreshRecoverySession({ amr: [{ method: "recovery", timestamp: sec - 60 }] }, NOW)).toBe(true);
    expect(isFreshRecoverySession({ amr: [{ method: "recovery", timestamp: sec - RECOVERY_WINDOW_SECONDS }] }, NOW)).toBe(true);
  });
  it("rejects a normal password sign-in", () => {
    expect(isFreshRecoverySession({ amr: [{ method: "password", timestamp: sec - 5 }] }, NOW)).toBe(false);
  });
  it("rejects a stale recovery session", () => {
    expect(isFreshRecoverySession({ amr: [{ method: "recovery", timestamp: sec - RECOVERY_WINDOW_SECONDS - 1 }] }, NOW)).toBe(false);
  });
  it("rejects missing or malformed claims", () => {
    expect(isFreshRecoverySession(null, NOW)).toBe(false);
    expect(isFreshRecoverySession({}, NOW)).toBe(false);
    expect(isFreshRecoverySession({ amr: "recovery" }, NOW)).toBe(false);
    expect(isFreshRecoverySession({ amr: [null, { method: "recovery" }, { method: "recovery", timestamp: "1" }] }, NOW)).toBe(false);
  });
  it("rejects a timestamp far in the future", () => {
    expect(isFreshRecoverySession({ amr: [{ method: "recovery", timestamp: sec + 3600 }] }, NOW)).toBe(false);
  });
});
