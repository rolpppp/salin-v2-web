import { describe, expect, it } from "vitest";
import { decideRedirect } from "./redirects";
import { safeNext } from "./schemas";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/plans/split?x=1")).toBe("/plans/split?x=1");
  });
  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "evil", "", "/sign-in", "/auth/callback"])(
    "falls back for %j",
    (raw) => {
      expect(safeNext(raw)).toBe("/today");
    },
  );
  it("falls back for non-strings", () => {
    expect(safeNext(null)).toBe("/today");
  });
});

describe("decideRedirect", () => {
  const base = { onboarded: true, onboardingEnabled: false };
  it("sends signed-out visitors to sign-in with next", () => {
    expect(decideRedirect({ ...base, pathname: "/plans/split", search: "?a=1", signedIn: false })).toBe(
      "/sign-in?next=%2Fplans%2Fsplit%3Fa%3D1",
    );
  });
  it("lets the auth callback through", () => {
    expect(decideRedirect({ ...base, pathname: "/auth/callback", signedIn: false })).toBeNull();
  });
  it("sends signed-in users away from sign-in to a safe next", () => {
    expect(decideRedirect({ ...base, pathname: "/sign-in", search: "?next=//evil.com", signedIn: true })).toBe("/today");
  });
  it("gates onboarding only when enabled (P-6)", () => {
    expect(decideRedirect({ pathname: "/today", signedIn: true, onboarded: false, onboardingEnabled: true })).toBe("/welcome");
    expect(decideRedirect({ pathname: "/today", signedIn: true, onboarded: false, onboardingEnabled: false })).toBeNull();
  });
});
