import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./support/fakeSupabase";

const state = vi.hoisted(() => ({ client: null as unknown, track: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => ({ id: "6f1c2a52-8d0e-4c43-9a57-0b6f6d6f1e01" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track: state.track }));

import { tickTransferAction, untickTransferAction } from "@/lib/actions/transfers";
import { TICK_FAILED, TRANSFER_STALE } from "@/lib/data/transfers-model";

type Res = { data: unknown; error: { code?: string; message: string } | null };
const row = (over: Record<string, unknown> = {}) => ({ kind: "transfer", from_account_id: "a", to_account_id: "b", amount: 500, netted: 0, sent: 0, done: false, status: "unsent", send_more: 0, bucket_ids: [], cycle_id: "c1", ...over });

function client(plan: unknown[], tick: Res = { data: "t1", error: null }, tables: Record<string, Res> = {}) {
  return fakeSupabase({
    tables,
    rpc: (name) => (name === "transfer_plan" ? { data: plan, error: null } : name === "tick_transfer" ? tick : { data: null, error: null }),
  });
}

beforeEach(() => state.track.mockClear());

describe("tickTransferAction", () => {
  it("rejects bad input before touching the database", async () => {
    const f = client([]);
    state.client = f.client;
    expect(await tickTransferAction({ from: "a", to: "b", amount: 1.5 })).toEqual({ ok: false, error: TRANSFER_STALE });
    expect(await tickTransferAction({ from: "", to: "b", amount: 5 })).toMatchObject({ ok: false });
    expect(f.calls).toHaveLength(0);
  });

  it("ticks through tick_transfer with the running total and tracks transfer_ticked", async () => {
    const f = client([row()]);
    state.client = f.client;
    expect(await tickTransferAction({ from: "a", to: "b", amount: 500 })).toEqual({ ok: true, already: false });
    expect(f.calls.find((c) => c.rpc === "tick_transfer")?.args).toEqual({ p_from: "a", p_to: "b", p_amount: 500 });
    expect(state.track).toHaveBeenCalledWith("transfer_ticked", { is_partial: false });
    expect(state.track).not.toHaveBeenCalledWith("money_in_completed", expect.anything());
  });

  it("a 'send more' tick is partial", async () => {
    state.client = client([row({ sent: 200, status: "partial", send_more: 300 })]).client;
    await tickTransferAction({ from: "a", to: "b", amount: 500 });
    expect(state.track).toHaveBeenCalledWith("transfer_ticked", { is_partial: true });
  });

  it("tracks money_in_completed once, when this tick closed the cycle", async () => {
    const f = client([row()], { data: "t1", error: null }, {
      transfer_cycles: { data: [{ id: "c1", closedAt: 123 }], error: null },
      allocations: { data: [{ ledgerEntryId: "e1" }, { ledgerEntryId: "e1" }, { ledgerEntryId: "e2" }], error: null },
    });
    state.client = f.client;
    await tickTransferAction({ from: "a", to: "b", amount: 500 });
    expect(state.track).toHaveBeenCalledWith("money_in_completed", { incomes_count: 2 });
  });

  it("already sent (P0001 from SQL) is treated as already ticked, not an error, and tracks nothing", async () => {
    state.client = client([row()], { data: null, error: { code: "P0001", message: "already sent 500 for this transfer; untick it first to change the amount" } }).client;
    expect(await tickTransferAction({ from: "a", to: "b", amount: 500 })).toEqual({ ok: true, already: true });
    expect(state.track).not.toHaveBeenCalled();
  });

  it("a row that is already done never calls tick_transfer", async () => {
    const f = client([row({ sent: 500, done: true, status: "done" })]);
    state.client = f.client;
    expect(await tickTransferAction({ from: "a", to: "b", amount: 500 })).toEqual({ ok: true, already: true });
    expect(f.calls.some((c) => c.rpc === "tick_transfer")).toBe(false);
  });

  it("refuses a stale amount or a transfer that left the checklist", async () => {
    state.client = client([row({ amount: 700 })]).client;
    expect(await tickTransferAction({ from: "a", to: "b", amount: 500 })).toEqual({ ok: false, error: TRANSFER_STALE });
    state.client = client([]).client;
    expect(await tickTransferAction({ from: "a", to: "b", amount: 500 })).toEqual({ ok: false, error: TRANSFER_STALE });
  });

  it("any other database error becomes copy for the person, never the raw message", async () => {
    state.client = client([row()], { data: null, error: { code: "XX000", message: "secret internals" } }).client;
    const r = await tickTransferAction({ from: "a", to: "b", amount: 500 });
    expect(r).toEqual({ ok: false, error: TICK_FAILED });
  });
});

describe("untickTransferAction", () => {
  it("calls untick_transfer", async () => {
    const f = fakeSupabase();
    state.client = f.client;
    expect(await untickTransferAction({ from: "a", to: "b" })).toEqual({ ok: true, already: false });
    expect(f.calls[0]).toMatchObject({ rpc: "untick_transfer", args: { p_from: "a", p_to: "b" } });
  });

  it("nothing ticked (P0002) is already unticked", async () => {
    state.client = fakeSupabase({ rpc: () => ({ data: null, error: { code: "P0002", message: "nothing ticked for a -> b in the latest cycle" } }) }).client;
    expect(await untickTransferAction({ from: "a", to: "b" })).toEqual({ ok: true, already: true });
  });
});
