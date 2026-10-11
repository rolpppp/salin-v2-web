import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./support/fakeSupabase";

const USER = "6f1c2a52-8d0e-4c43-9a57-0b6f6d6f1e01";
const state = vi.hoisted(() => ({ client: null as unknown, track: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "6f1c2a52-8d0e-4c43-9a57-0b6f6d6f1e01" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track: state.track }));

import { addAccountAction, archiveAccountAction, renameAccountAction, retypeAccountAction } from "@/lib/actions/accounts";
import { addCategoryAction, moveCategoryAction, removeCategoryAction } from "@/lib/actions/categories";
import { addGoalAction, archiveGoalAction, updateGoalAction } from "@/lib/actions/goals";

const BUCKET = "b1000000-0000-4000-8000-000000000001";
const GOAL = "90000000-0000-4000-8000-000000000001";

beforeEach(() => {
  state.track.mockClear();
});

describe("accounts actions", () => {
  it("rejects an empty name before touching the database", async () => {
    const f = fakeSupabase();
    state.client = f.client;
    const r = await addAccountAction({ name: "   ", type: "bank", currency: "PHP" });
    expect(r).toEqual({ ok: false, error: "Add a name for the account." });
    expect(f.calls).toHaveLength(0);
  });

  it("rejects a duplicate name (case and spacing ignored) and writes nothing", async () => {
    const f = fakeSupabase({ tables: { accounts: { data: [{ id: "a1", name: "MariBank" }], error: null } } });
    state.client = f.client;
    const r = await addAccountAction({ name: "  maribank ", type: "bank", currency: "PHP" });
    expect(r).toEqual({ ok: false, error: "You already have an account called maribank. Pick a different name." });
    expect(f.calls.some((c) => c.ops.includes("insert"))).toBe(false);
  });

  it("creates a full mobile-shaped row: Dart enum index, currency, synced, user id", async () => {
    const f = fakeSupabase();
    state.client = f.client;
    const r = await addAccountAction({ name: "AUD savings", type: "savings", currency: "AUD" });
    expect(r.ok).toBe(true);
    const insert = f.calls.find((c) => c.ops.includes("insert"))!;
    expect(insert.payload).toMatchObject({
      user_id: USER,
      name: "AUD savings",
      accountType: 2,
      currency: "AUD",
      openingBalanceMinor: 0,
      isArchived: false,
      deletedAt: null,
      syncStatus: 2,
    });
  });

  it("rename and retype update only their fields, scoped to the user", async () => {
    const f = fakeSupabase({ tables: { accounts: { data: [{ id: "a1", name: "Other" }], error: null } } });
    state.client = f.client;
    expect((await renameAccountAction({ id: "a1", name: "Wallet" })).ok).toBe(true);
    expect((await retypeAccountAction({ id: "a1", type: "eWallet" })).ok).toBe(true);
    const updates = f.calls.filter((c) => c.ops.includes("update"));
    expect(Object.keys(updates[0].payload as object).sort()).toEqual(["name", "updatedAt"]);
    expect(updates[1].payload).toMatchObject({ accountType: 3 });
    expect(Object.keys(updates[1].payload as object).sort()).toEqual(["accountType", "updatedAt"]);
  });

  it("archive is refused server-side when in use, and the reason reaches the person", async () => {
    const f = fakeSupabase({ rpc: () => ({ data: null, error: { code: "P0001", message: "in use: Investments is kept here" } }) });
    state.client = f.client;
    const r = await archiveAccountAction({ id: "acc-mp2" });
    expect(r).toEqual({ ok: false, error: "In use: Investments is kept here." });
    expect(f.calls.map((c) => c.rpc)).toEqual(["archive_account"]);
    expect(f.calls.some((c) => c.ops.includes("update"))).toBe(false); // never a client-side update around the guard
  });

  it("with no client (no Supabase env) says it couldn't save", async () => {
    state.client = null;
    expect(await archiveAccountAction({ id: "x" })).toMatchObject({ ok: false, error: expect.stringMatching(/Couldn't save/) });
  });
});

describe("categories actions", () => {
  it("add: creates an expense category row then maps it through move_category", async () => {
    const f = fakeSupabase();
    state.client = f.client;
    const r = await addCategoryAction({ name: "Kape", bucketId: BUCKET });
    expect(r.ok).toBe(true);
    const insert = f.calls.find((c) => c.table === "categories" && c.ops.includes("insert"))!;
    expect(insert.payload).toMatchObject({ user_id: USER, name: "Kape", categoryType: 1, isSystem: false, syncStatus: 2, deletedAt: null });
    const rpc = f.calls.find((c) => c.rpc === "move_category")!;
    expect(rpc.args).toMatchObject({ p_bucket: BUCKET, p_category: (insert.payload as { id: string }).id });
  });

  it("add: if the bucket mapping fails the new category is soft-deleted, never left orphaned", async () => {
    const f = fakeSupabase({ rpc: () => ({ data: null, error: { code: "P0002", message: "bucket not found" } }) });
    state.client = f.client;
    const r = await addCategoryAction({ name: "Kape", bucketId: BUCKET });
    expect(r.ok).toBe(false);
    const undo = f.calls.filter((c) => c.table === "categories" && c.ops.includes("update")).at(-1)!;
    expect(undo.payload).toMatchObject({ deletedAt: expect.any(Number), updatedAt: expect.any(Number) });
  });

  it("add: duplicate category names are refused", async () => {
    const f = fakeSupabase({ tables: { categories: { data: [{ id: "c1", name: "Groceries" }], error: null } } });
    state.client = f.client;
    expect(await addCategoryAction({ name: "groceries", bucketId: BUCKET })).toMatchObject({ ok: false });
    expect(f.calls.some((c) => c.ops.includes("insert"))).toBe(false);
  });

  it("move and remove go through the guarded SQL functions", async () => {
    const f = fakeSupabase({ rpc: (name) => (name === "remove_category" ? { data: null, error: { code: "P0001", message: "in use: it has entries" } } : { data: 0, error: null }) });
    state.client = f.client;
    expect((await moveCategoryAction({ id: "c1", bucketId: BUCKET })).ok).toBe(true);
    expect(await removeCategoryAction({ id: "c1" })).toEqual({ ok: false, error: "In use: it has entries." });
  });

  it("a bucket id that isn't a uuid is refused before any call", async () => {
    const f = fakeSupabase();
    state.client = f.client;
    expect(await moveCategoryAction({ id: "c1", bucketId: "living" })).toMatchObject({ ok: false });
    expect(f.calls).toHaveLength(0);
  });
});

describe("goals actions", () => {
  it("add: target must be a positive integer of centavos", async () => {
    const f = fakeSupabase();
    state.client = f.client;
    expect(await addGoalAction({ name: "Trip", targetMinor: 1.5, bucketId: null, shareBp: 10_000 })).toMatchObject({ ok: false });
    expect(await addGoalAction({ name: "Trip", targetMinor: 0, bucketId: null, shareBp: 10_000 })).toMatchObject({ ok: false });
    expect(await addGoalAction({ name: "Trip", targetMinor: 5_000_000_000_000, bucketId: null, shareBp: 10_000 })).toMatchObject({ ok: false });
    expect(f.calls).toHaveLength(0);
  });

  it("add: sends integer centavos and bp to add_goal", async () => {
    const f = fakeSupabase({ rpc: () => ({ data: GOAL, error: null }) });
    state.client = f.client;
    const r = await addGoalAction({ name: " Trip ", targetMinor: 3_000_000, bucketId: BUCKET, shareBp: 2_500 });
    expect(r).toEqual({ ok: true, value: { id: GOAL } });
    expect(f.calls[0].args).toEqual({ p_name: "Trip", p_target: 3_000_000, p_bucket: BUCKET, p_share_bp: 2_500 });
  });

  it("update: merges with the stored goal and records plan_edited(target) only when the target changed", async () => {
    const f = fakeSupabase({
      tables: { goals: { data: [{ name: "Emergency fund", targetMinor: 5_000_000, linkedBucketId: BUCKET, linkedShareBp: 10_000 }], error: null } },
      rpc: () => ({ data: null, error: null }),
    });
    state.client = f.client;
    expect((await updateGoalAction({ id: GOAL, targetMinor: 6_000_000 })).ok).toBe(true);
    expect(f.calls.find((c) => c.rpc === "update_goal")!.args).toEqual({
      p_goal: GOAL,
      p_name: "Emergency fund",
      p_target: 6_000_000,
      p_bucket: BUCKET,
      p_share_bp: 10_000,
    });
    expect(state.track).toHaveBeenCalledWith("plan_edited", { field: "target" });
    state.track.mockClear();
    await updateGoalAction({ id: GOAL, name: "Safety net" });
    expect(state.track).not.toHaveBeenCalled();
    await updateGoalAction({ id: GOAL, targetMinor: 5_000_000 }); // unchanged
    expect(state.track).not.toHaveBeenCalled();
  });

  it("archive surfaces the Plan B switch refusal", async () => {
    const f = fakeSupabase({ rpc: () => ({ data: null, error: { code: "P0001", message: "in use: it is your Plan B switch" } }) });
    state.client = f.client;
    expect(await archiveGoalAction({ id: GOAL })).toEqual({ ok: false, error: "In use: it is your Plan B switch." });
  });
});
