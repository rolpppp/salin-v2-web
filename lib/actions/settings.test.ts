import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  client: null as unknown,
  user: { id: "6f1c2a52-8d0e-4c43-9a57-0b6f6d6f1e01" } as { id: string } | null,
  track: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/analytics", () => ({ track: state.track }));

import { saveIncomeRhythm, saveKeepBucket, saveProfileBasics, saveViewMode } from "./settings";

type Err = { code?: string; message: string } | null;

function fake(error: Err = null) {
  const calls: Array<{ name: string; args: unknown }> = [];
  state.client = {
    rpc(name: string, args: unknown) {
      calls.push({ name, args });
      return Promise.resolve({ data: null, error });
    },
  };
  return calls;
}

beforeEach(() => {
  state.user = { id: "6f1c2a52-8d0e-4c43-9a57-0b6f6d6f1e01" };
  state.track.mockReset();
  state.revalidate.mockReset();
});

describe("saveIncomeRhythm", () => {
  it("passes integer centavos, the rhythm and the date; tracks the section only; revalidates Settings, Today and Review", async () => {
    const calls = fake();
    const res = await saveIncomeRhythm({ amountMinor: 150000, rhythm: "quarterly", next: "2026-12-01" });
    expect(res).toEqual({ ok: true });
    expect(calls).toEqual([{ name: "set_income_rhythm", args: { p_amount: 150000, p_rhythm: "quarterly", p_next: "2026-12-01" } }]);
    expect(state.track).toHaveBeenCalledWith("settings_changed", { section: "income" });
    for (const p of ["/settings", "/today", "/review"]) expect(state.revalidate).toHaveBeenCalledWith(p);
  });
  it("lets every part be null (not set)", async () => {
    const calls = fake();
    expect(await saveIncomeRhythm({ amountMinor: null, rhythm: null, next: null })).toEqual({ ok: true });
    expect(calls[0].args).toEqual({ p_amount: null, p_rhythm: null, p_next: null });
  });
  it("refuses junk before any call", async () => {
    const calls = fake();
    for (const bad of [
      { amountMinor: 1.5, rhythm: "weekly", next: null },
      { amountMinor: -5, rhythm: "weekly", next: null },
      { amountMinor: 100, rhythm: "daily", next: null },
      { amountMinor: 100, rhythm: "weekly", next: "tomorrow" },
    ]) {
      const res = await saveIncomeRhythm(bad);
      expect(res.ok).toBe(false);
    }
    expect(calls).toEqual([]);
  });
  it("shows the SQL's own words for a refusal, and a generic line for anything else", async () => {
    fake({ code: "22023", message: "Pick today or a later date." });
    expect(await saveIncomeRhythm({ amountMinor: 100, rhythm: "weekly", next: "2026-01-01" })).toEqual({ ok: false, error: "Pick today or a later date." });
    fake({ code: "P0001", message: "Finish setting up first." });
    expect(await saveIncomeRhythm({ amountMinor: 100, rhythm: "weekly", next: null })).toEqual({ ok: false, error: "Finish setting up first." });
    fake({ code: "XX000", message: "boom" });
    const res = await saveIncomeRhythm({ amountMinor: 100, rhythm: "weekly", next: null });
    expect(res.ok).toBe(false);
    expect(state.track).not.toHaveBeenCalled();
  });
  it("says so when signed out", async () => {
    state.user = null;
    fake();
    expect((await saveIncomeRhythm({ amountMinor: 100, rhythm: "weekly", next: null })).ok).toBe(false);
  });
});

describe("saveProfileBasics", () => {
  it("passes the name, week start and review day; the section labels the event", async () => {
    const calls = fake();
    expect(await saveProfileBasics({ firstName: "Mika", weekStartsOn: 0, reviewDay: 3, section: "about" })).toEqual({ ok: true });
    expect(calls).toEqual([{ name: "set_profile_basics", args: { p_first_name: "Mika", p_week_starts_on: 0, p_review_day: 3 } }]);
    expect(state.track).toHaveBeenCalledWith("settings_changed", { section: "about" });
    await saveProfileBasics({ firstName: null, weekStartsOn: 1, reviewDay: 0, section: "week" });
    expect(state.track).toHaveBeenLastCalledWith("settings_changed", { section: "week" });
  });
  it("refuses a bad week start, review day or long name", async () => {
    const calls = fake();
    expect((await saveProfileBasics({ firstName: "x", weekStartsOn: 2, reviewDay: 0, section: "week" })).ok).toBe(false);
    expect((await saveProfileBasics({ firstName: "x", weekStartsOn: 1, reviewDay: 7, section: "week" })).ok).toBe(false);
    expect((await saveProfileBasics({ firstName: "x".repeat(61), weekStartsOn: 1, reviewDay: 0, section: "about" })).ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("saveKeepBucket and saveViewMode", () => {
  it("reuse the Simple setters and track the section", async () => {
    const calls = fake();
    const id = "b1000000-0000-4000-8000-000000000001";
    expect(await saveKeepBucket({ bucketId: id })).toEqual({ ok: true });
    expect(await saveViewMode({ mode: "simple" })).toEqual({ ok: true });
    expect(calls.map((c) => c.name)).toEqual(["set_keep_bucket", "set_view_mode"]);
    expect(state.track).toHaveBeenCalledWith("settings_changed", { section: "keep" });
    expect(state.track).toHaveBeenCalledWith("settings_changed", { section: "view" });
  });
  it("does not track a refused change", async () => {
    fake({ code: "22023", message: "Pick a bucket you save in, not one you spend from." });
    const res = await saveKeepBucket({ bucketId: "b1000000-0000-4000-8000-000000000001" });
    expect(res.ok).toBe(false);
    expect(state.track).not.toHaveBeenCalled();
  });
});
