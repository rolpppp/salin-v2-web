import { describe, expect, it } from "vitest";
import { decideRedirect } from "./redirects";
import { safeNext } from "./schemas";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/plans/split?x=1")).toBe("/plans/split?x=1");
  });
  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "evil", "", "/sign-in", "/auth/callback", "/forgot-password"])(
    "falls back for %j",
    (raw) => {
      expect(safeNext(raw)).toBe("/today");
    },
  );
  it("keeps /reset-password, the target of the emailed recovery link", () => {
    expect(safeNext("/reset-password")).toBe("/reset-password");
  });
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
  it("lets signed-out visitors see the landing page at /", () => {
    expect(decideRedirect({ ...base, pathname: "/", signedIn: false })).toBeNull();
  });
  it("lets the auth callback through", () => {
    expect(decideRedirect({ ...base, pathname: "/auth/callback", signedIn: false })).toBeNull();
  });
  it("sends signed-in users away from sign-in to a safe next", () => {
    expect(decideRedirect({ ...base, pathname: "/sign-in", search: "?next=//evil.com", signedIn: true })).toBe("/today");
  });
  it.each(["/forgot-password", "/reset-password"])("lets %s through signed out and signed in", (pathname) => {
    expect(decideRedirect({ ...base, pathname, signedIn: false })).toBeNull();
    expect(decideRedirect({ ...base, pathname, search: "?email=a@b.co", signedIn: true })).toBeNull();
  });
  it.each(["/forgot-password", "/reset-password"])("does not send not-onboarded users from %s to /welcome", (pathname) => {
    expect(decideRedirect({ pathname, signedIn: true, onboarded: false, onboardingEnabled: true })).toBeNull();
  });
  it("gates onboarding only when enabled (P-6)", () => {
    expect(decideRedirect({ pathname: "/today", signedIn: true, onboarded: false, onboardingEnabled: true })).toBe("/welcome");
    expect(decideRedirect({ pathname: "/today", signedIn: true, onboarded: false, onboardingEnabled: false })).toBeNull();
  });
});
