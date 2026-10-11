import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDraft, type OnboardingDraft } from "@/lib/onboarding/draft";

const USER = "6f1c2a52-8d0e-4c43-9a57-0b6f6d6f1e01";
const state = vi.hoisted(() => ({
  client: null as unknown,
  track: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "6f1c2a52-8d0e-4c43-9a57-0b6f6d6f1e01" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/analytics", () => ({ track: state.track }));

import { finishOnboarding, loadPhoneData, saveDraft, trackOnboarding } from "./onboarding";

type Err = { code?: string; message: string } | null;

/** The three calls these actions make: upsert on user_profiles, read the stored draft, and the two RPCs. */
function fake(opts: { stored?: unknown; upsertError?: Err; rpcResult?: { data: unknown; error: Err } } = {}) {
  const calls: Array<{ kind: string; args: unknown[] }> = [];
  const client = {
    from(table: string) {
      return {
        upsert: (row: unknown, o: unknown) => {
          calls.push({ kind: `upsert ${table}`, args: [row, o] });
          return Promise.resolve({ error: opts.upsertError ?? null });
        },
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.stored === undefined ? null : { onboardingDraft: opts.stored }, error: null }) }),
        }),
      };
    },
    rpc(name: string, args: unknown) {
      calls.push({ kind: `rpc ${name}`, args: [args] });
      return Promise.resolve(opts.rpcResult ?? { data: null, error: null });
    },
  };
  state.client = client;
  return calls;
}

const draft = (over: Partial<OnboardingDraft> = {}): OnboardingDraft => ({ ...emptyDraft(), path: "web", step: "accounts", ...over });

beforeEach(() => state.track.mockClear());

describe("saveDraft", () => {
  it("upserts the validated draft onto the user's profile row and writes nothing else", async () => {
    const calls = fake();
    const d = draft({ firstName: "Maria" });
    expect(await saveDraft(d)).toEqual({ ok: true });
    expect(calls).toEqual([{ kind: "upsert user_profiles", args: [{ user_id: USER, onboardingDraft: d }, { onConflict: "user_id" }] }]);
  });

  it("rejects a draft that doesn't match the contract before touching the database", async () => {
    const calls = fake();
    expect((await saveDraft({ ...draft(), v: 2 })).ok).toBe(false);
    expect((await saveDraft({ ...draft(), income: { ...draft().income, amountMinor: 1.5 } })).ok).toBe(false);
    expect((await saveDraft("nope")).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("says so when the database refuses", async () => {
    fake({ upsertError: { code: "XX000", message: "boom" } });
    expect(await saveDraft(draft())).toEqual({ ok: false, error: "Couldn't save. Check your connection and try again." });
  });
});

describe("finishOnboarding", () => {
  it("reads the stored draft and calls finish_onboarding with it, returning the summary", async () => {
    const d = draft({ firstPay: { ...emptyDraft().firstPay, choice: "later" } });
    const calls = fake({ stored: d, rpcResult: { data: { buckets: 6 }, error: null } });
    expect(await finishOnboarding()).toEqual({ ok: true, value: { summary: { buckets: 6 } } });
    expect(calls).toEqual([{ kind: "rpc finish_onboarding", args: [{ p_draft: d }] }]);
  });

  it("Make a plan (planOnly) calls apply_plan_only instead and has no summary", async () => {
    const d = draft({ planOnly: true, step: "homes" });
    const calls = fake({ stored: d });
    expect(await finishOnboarding()).toEqual({ ok: true, value: { summary: null } });
    expect(calls).toEqual([{ kind: "rpc apply_plan_only", args: [{ p_draft: d }] }]);
  });

  it("refuses a stored draft that isn't valid, without calling SQL", async () => {
    const calls = fake({ stored: { v: 1, path: "mars" } });
    const r = await finishOnboarding();
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("passes the database's own message through when it explains what's wrong (22023)", async () => {
    fake({ stored: draft(), rpcResult: { data: null, error: { code: "22023", message: "Pick one main pay." } } });
    expect(await finishOnboarding()).toEqual({ ok: false, error: "Pick one main pay." });
  });
});

describe("trackOnboarding", () => {
  it("records only the four onboarding events with their listed properties", async () => {
    await trackOnboarding({ event: "onboarding_started", props: { path: "app", auto_detected: true } });
    await trackOnboarding({ event: "onboarding_step_completed", props: { path: "app", step: "income", seconds_on_step: 12 } });
    await trackOnboarding({ event: "sync_prompt_shown", props: { seconds_waited: 0 } });
    await trackOnboarding({ event: "sync_connected", props: { seconds_waited: 8 } });
    expect(state.track.mock.calls.map((c) => c[0])).toEqual(["onboarding_started", "onboarding_step_completed", "sync_prompt_shown", "sync_connected"]);
    expect(state.track.mock.calls[1]![1]).toEqual({ path: "app", step: "income", seconds_on_step: 12 });
  });

  it("drops anything else, so the client can't write arbitrary events", async () => {
    await trackOnboarding({ event: "web_signed_in", props: { first_time: true } });
    await trackOnboarding({ event: "sync_connected", props: { seconds_waited: -5 } });
    await trackOnboarding("x");
    expect(state.track).not.toHaveBeenCalled();
  });
});

describe("loadPhoneData", () => {
  it("is read-only and reports a read failure as an error rather than throwing", async () => {
    state.client = {
      from: () => {
        throw new Error("down");
      },
    };
    expect((await loadPhoneData()).ok).toBe(false);
  });
});
