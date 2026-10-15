import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  client: null as unknown,
  user: { id: "6f1c2a52-8d0e-4c43-9a57-0b6f6d6f1e01" } as { id: string } | null,
  track: vi.fn(),
  revalidate: vi.fn(),
  streak: { days: 1, todayDone: true, noSpendToday: true, milestone: null as 3 | 7 | 14 | 30 | null },
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/analytics", () => ({ track: state.track }));
vi.mock("@/lib/data/simple-today", () => ({ getStreak: async () => state.streak }));

import { receiveMoney, setKeepBucket, setNoSpend, setSpendUntil, setViewMode } from "./simple";

type Err = { code?: string; message: string } | null;

function fake(result: { data?: unknown; error?: Err } = {}) {
  const calls: Array<{ name: string; args: unknown }> = [];
  state.client = {
    rpc(name: string, args: unknown) {
      calls.push({ name, args });
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    },
  };
  return calls;
}

const BUCKET_A = "b1000000-0000-4000-8000-000000000001";
const BUCKET_B = "b1000000-0000-4000-8000-000000000002";
const valid = {
  amountMinor: 150000,
  receivedInId: "acc-bank",
  sourceId: null,
  name: null,
  on: "2026-10-14",
  lines: [
    { bucketId: BUCKET_A, destAccountId: "acc-cash", amountMinor: 100000 },
    { bucketId: BUCKET_B, destAccountId: "acc-bank", amountMinor: 50000 },
  ],
};

beforeEach(() => {
  state.user = { id: "6f1c2a52-8d0e-4c43-9a57-0b6f6d6f1e01" };
  state.track.mockReset();
  state.revalidate.mockReset();
  state.streak = { days: 1, todayDone: true, noSpendToday: true, milestone: null };
});

describe("receiveMoney", () => {
  it("passes exactly the contract's arguments, tracks the band and the account count, revalidates Today and Money in", async () => {
    const calls = fake({ data: "e7e1a6f0-0000-4000-8000-000000000001" });
    const res = await receiveMoney(valid);
    expect(res).toEqual({ ok: true, entryId: "e7e1a6f0-0000-4000-8000-000000000001" });
    expect(calls).toEqual([
      {
        name: "receive_money",
        args: {
          p_amount: 150000,
          p_received_in: "acc-bank",
          p_source_id: null,
          p_name: null,
          p_on: "2026-10-14",
          p_lines: valid.lines,
        },
      },
    ]);
    expect(state.track).toHaveBeenCalledWith("money_received", { amount_band: "500_to_2k", accounts_count: 2 });
    expect(state.revalidate).toHaveBeenCalledWith("/today");
    expect(state.revalidate).toHaveBeenCalledWith("/money-in");
  });

  it("refuses lines that do not add up, before any call", async () => {
    const calls = fake();
    const res = await receiveMoney({ ...valid, amountMinor: 150001 });
    expect(res).toEqual({ ok: false, error: "The amounts don't add up to what you received." });
    expect(calls).toEqual([]);
    expect(state.track).not.toHaveBeenCalled();
  });

  it.each([
    ["a float amount", { ...valid, amountMinor: 1500.5 }],
    ["a zero line", { ...valid, lines: [{ ...valid.lines[0], amountMinor: 0 }, { ...valid.lines[1], amountMinor: 150000 }] }],
    ["no lines", { ...valid, lines: [] }],
    ["a bad bucket id", { ...valid, lines: [{ bucketId: "nope", destAccountId: "acc-cash", amountMinor: 150000 }] }],
    ["a bad date", { ...valid, on: "tomorrow" }],
  ])("refuses %s", async (_n, input) => {
    const calls = fake();
    const res = await receiveMoney(input as never);
    expect(res.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("refuses a date in the future", async () => {
    const calls = fake();
    const res = await receiveMoney({ ...valid, on: "2999-01-01" });
    expect(res).toEqual({ ok: false, error: "That date hasn't happened yet." });
    expect(calls).toEqual([]);
  });

  it("says so when signed out", async () => {
    state.user = null;
    fake();
    const res = await receiveMoney(valid);
    expect(res.ok).toBe(false);
  });

  it("passes a database refusal through in words", async () => {
    fake({ error: { code: "22023", message: "Pick one of your peso accounts." } });
    expect(await receiveMoney(valid)).toEqual({ ok: false, error: "Pick one of your peso accounts." });
    expect(state.track).not.toHaveBeenCalled();
  });

  it("an ownership refusal is the generic 'isn't available' text, not the SQL message", async () => {
    fake({ error: { code: "42501", message: "That account is not yours or is gone" } });
    const res = await receiveMoney(valid);
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/isn't available/);
  });

  it("an unknown failure is the save-failed text", async () => {
    fake({ error: { code: "XX000", message: "boom" } });
    expect(await receiveMoney(valid)).toEqual({ ok: false, error: "Couldn't save. Check your connection and try again." });
  });
});

describe("setNoSpend", () => {
  it("marks the day and tracks it", async () => {
    const calls = fake();
    expect(await setNoSpend("2026-10-15", true)).toEqual({ ok: true });
    expect(calls).toEqual([{ name: "set_no_spend", args: { p_day: "2026-10-15", p_on: true } }]);
    expect(state.track).toHaveBeenCalledWith("no_spend_marked", { marked: true });
    expect(state.track).not.toHaveBeenCalledWith("streak_milestone", expect.anything());
  });
  it("unmarking tracks marked false and never looks for a milestone", async () => {
    fake();
    state.streak.milestone = 7;
    await setNoSpend("2026-10-15", false);
    expect(state.track).toHaveBeenCalledWith("no_spend_marked", { marked: false });
    expect(state.track).not.toHaveBeenCalledWith("streak_milestone", expect.anything());
  });
  it("tracks a streak milestone when marking today reaches one", async () => {
    fake();
    state.streak.milestone = 7;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
    await setNoSpend(today, true);
    expect(state.track).toHaveBeenCalledWith("streak_milestone", { days: 7 });
  });
  it("passes the database's refusal through", async () => {
    fake({ error: { code: "22023", message: "That day has not happened yet." } });
    expect(await setNoSpend("2026-10-15", true)).toEqual({ ok: false, error: "That day has not happened yet." });
  });
  it("rejects a malformed day", async () => {
    const calls = fake();
    expect((await setNoSpend("15/10", true)).ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("setViewMode, setSpendUntil, setKeepBucket", () => {
  it("setViewMode calls the setter and tracks the mode", async () => {
    const calls = fake();
    expect(await setViewMode("simple")).toEqual({ ok: true });
    expect(calls).toEqual([{ name: "set_view_mode", args: { p_mode: "simple" } }]);
    expect(state.track).toHaveBeenCalledWith("view_mode_changed", { mode: "simple" });
  });
  it("setViewMode rejects anything else", async () => {
    const calls = fake();
    expect((await setViewMode("fancy" as never)).ok).toBe(false);
    expect(calls).toEqual([]);
  });
  it("setSpendUntil sets a day and clears with null", async () => {
    const calls = fake();
    expect(await setSpendUntil("2999-01-13")).toEqual({ ok: true });
    expect(await setSpendUntil(null)).toEqual({ ok: true });
    expect(calls).toEqual([
      { name: "set_spend_until", args: { p_day: "2999-01-13" } },
      { name: "set_spend_until", args: { p_day: null } },
    ]);
  });
  it("setSpendUntil refuses a day that has passed", async () => {
    const calls = fake();
    expect(await setSpendUntil("2020-01-01")).toEqual({ ok: false, error: "Pick today or a later day." });
    expect(calls).toEqual([]);
  });
  it("setKeepBucket calls the setter, and passes a refusal through", async () => {
    const calls = fake();
    expect(await setKeepBucket(BUCKET_A)).toEqual({ ok: true });
    expect(calls).toEqual([{ name: "set_keep_bucket", args: { p_bucket: BUCKET_A } }]);
    fake({ error: { code: "22023", message: "Pick a bucket you save in, not one you spend from." } });
    expect(await setKeepBucket(BUCKET_A)).toEqual({ ok: false, error: "Pick a bucket you save in, not one you spend from." });
    expect((await setKeepBucket("nope")).ok).toBe(false);
  });
});
