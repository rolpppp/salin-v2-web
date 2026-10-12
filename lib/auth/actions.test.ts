import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ client: null as unknown, redirect: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://salin.example" }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    state.redirect(to);
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/lib/analytics", () => ({ isFirstWebSignIn: async () => true, trackWith: vi.fn() }));

import { forgotPasswordAction, resetPasswordAction } from "./actions";

type AuthErr = { code?: string; status?: number; name?: string; message: string } | null;

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const freshRecovery = () => ({ amr: [{ method: "recovery", timestamp: Date.now() / 1000 - 10 }] });

function client(opts: { reset?: AuthErr; update?: AuthErr; claims?: unknown }) {
  const resetPasswordForEmail = vi.fn<(email: string, o: unknown) => Promise<{ data: object; error: AuthErr }>>(async () => ({ data: {}, error: opts.reset ?? null }));
  const updateUser = vi.fn<(attrs: unknown) => Promise<{ data: object; error: AuthErr }>>(async () => ({ data: {}, error: opts.update ?? null }));
  const claims = "claims" in opts ? opts.claims : freshRecovery();
  const getClaims = vi.fn(async () => ({ data: claims ? { claims } : null, error: null }));
  state.client = { auth: { resetPasswordForEmail, updateUser, getClaims } };
  return { resetPasswordForEmail, updateUser };
}

beforeEach(() => state.redirect.mockClear());

describe("forgotPasswordAction", () => {
  it("rejects an empty or malformed email without calling Supabase", async () => {
    const c = client({});
    const empty = await forgotPasswordAction({}, form({ email: "" }));
    expect(empty.fieldErrors?.email).toBe("Enter your email address.");
    const bad = await forgotPasswordAction({}, form({ email: "nope" }));
    expect(bad.fieldErrors?.email).toMatch(/doesn't look like an email address/);
    expect(c.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("asks for the reset link with the callback and next=/reset-password, and shows the neutral notice", async () => {
    const c = client({});
    const r = await forgotPasswordAction({}, form({ email: " Ana@Example.com " }));
    expect(c.resetPasswordForEmail).toHaveBeenCalledWith("Ana@Example.com", { redirectTo: "https://salin.example/auth/callback?next=/reset-password" });
    expect(r.notice).toContain("If there's a Salin account for Ana@Example.com");
    expect(r.notice).toContain("Open it in this browser");
    expect(r.error).toBeUndefined();
  });

  it("maps rate limits to the friendly message", async () => {
    for (const err of [{ code: "over_email_send_rate_limit", status: 429, message: "x" }, { status: 429, message: "x" }]) {
      client({ reset: err });
      const r = await forgotPasswordAction({}, form({ email: "a@b.co" }));
      expect(r.error).toBe("Too many tries. Wait a few minutes, then try again.");
      expect(r.notice).toBeUndefined();
    }
  });

  it("uses the generic connection message for other errors and when Supabase is not configured", async () => {
    client({ reset: { status: 500, message: "boom" } });
    expect((await forgotPasswordAction({}, form({ email: "a@b.co" }))).error).toMatch(/can't reach its server/);
    state.client = null;
    expect((await forgotPasswordAction({}, form({ email: "a@b.co" }))).error).toMatch(/can't reach its server/);
  });
});

describe("resetPasswordAction", () => {
  it("applies the sign-up password rules", async () => {
    const c = client({});
    expect((await resetPasswordAction({}, form({ password: "short" }))).fieldErrors?.password).toBe("Use at least 8 characters for your password.");
    expect(c.updateUser).not.toHaveBeenCalled();
  });

  it("updates the password and goes to Today with a confirmation", async () => {
    const c = client({});
    await expect(resetPasswordAction({}, form({ password: "long-enough-1" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(c.updateUser).toHaveBeenCalledWith({ password: "long-enough-1" });
    expect(state.redirect).toHaveBeenCalledWith("/today?notice=password-updated");
  });

  it.each([
    [{ code: "same_password", status: 422, message: "x" }, /current password/],
    [{ code: "weak_password", status: 422, message: "x" }, /too easy to guess/],
    [{ code: "over_request_rate_limit", status: 429, message: "x" }, /Too many tries/],
    [{ status: 500, message: "x" }, /Couldn't save your new password/],
  ])("maps %j", async (err, message) => {
    client({ update: err });
    const r = await resetPasswordAction({}, form({ password: "long-enough-1" }));
    expect(r.error).toMatch(message);
    expect(state.redirect).not.toHaveBeenCalled();
  });

  it("refuses a normal signed-in session (not from a reset link) without calling updateUser", async () => {
    const c = client({ claims: { amr: [{ method: "password", timestamp: Date.now() / 1000 }] } });
    expect(await resetPasswordAction({}, form({ password: "long-enough-1" }))).toEqual({ expired: true });
    const none = client({ claims: null });
    expect(await resetPasswordAction({}, form({ password: "long-enough-1" }))).toEqual({ expired: true });
    expect(c.updateUser).not.toHaveBeenCalled();
    expect(none.updateUser).not.toHaveBeenCalled();
  });

  it("reports a missing recovery session as expired", async () => {
    client({ update: { name: "AuthSessionMissingError", status: 400, message: "Auth session missing!" } });
    expect(await resetPasswordAction({}, form({ password: "long-enough-1" }))).toEqual({ expired: true });
  });
});
