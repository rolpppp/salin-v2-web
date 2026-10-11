import { describe, expect, it } from "vitest";
import { dbFailure, SAVE_FAILED, SIGNED_OUT } from "./planResult";

describe("dbFailure", () => {
  it("in use: becomes a sentence naming the reason", () => {
    expect(dbFailure({ code: "P0001", message: "in use: Investments is kept here" })).toBe("In use: Investments is kept here.");
  });
  it("invalid input and duplicates keep the database's plain message", () => {
    expect(dbFailure({ code: "P0001", message: "target must be more than 0" })).toBe("Target must be more than 0.");
    expect(dbFailure({ code: "23505", message: "a goal called Trip already exists" })).toBe("A goal called Trip already exists.");
  });
  it("not found, signed out and anything else", () => {
    expect(dbFailure({ code: "P0002", message: "account not found" })).toMatch(/isn't there any more/);
    expect(dbFailure({ code: "28000", message: "not signed in" })).toBe(SIGNED_OUT);
    expect(dbFailure({ code: "XX000", message: "boom" })).toBe(SAVE_FAILED);
    expect(dbFailure(null)).toBe(SAVE_FAILED);
  });
});
