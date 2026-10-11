"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { failure, SAVE_FAILED, SIGNED_OUT, type ActionResult } from "./result";

const id = z.guid();
const kind = z.enum(["salary", "scholarship", "side_hustle", "allowance", "gift", "refund", "other"]);
const rule = z.enum(["plan", "own", "whole", "ask"]);
const name = z.string().trim().min(1, "Give the source a name.").max(60, "Keep the name to 60 characters or fewer.");
const lines = z.array(z.object({ bucketId: id, percentBp: z.number().int().min(0).max(10000) })).max(50);

async function session() {
  const user = await getCurrentUser();
  return user ? await createClient() : null;
}

type Rpc = Awaited<ReturnType<typeof session>>;

/** Runs one RPC and maps its outcome. `done` runs only on success. */
async function run(fn: (client: NonNullable<Rpc>) => PromiseLike<{ error: { code?: string; message: string } | null }>, done?: () => Promise<void>): Promise<ActionResult> {
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { error } = await fn(client);
    if (error) return failure(error);
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
  revalidatePath("/plans/income");
  await done?.();
  return { ok: true };
}

/** + Add income source: a preset kind with its default rule. Also creates the income category. */
export async function addIncomeSource(k: string): Promise<ActionResult<{ id: string; name: string }>> {
  const p = kind.safeParse(k);
  if (!p.success) return { ok: false, error: "Pick one of the income kinds." };
  const client = await session();
  if (!client) return { ok: false, error: SIGNED_OUT };
  try {
    const { data, error } = await client.rpc("add_income_source", { p_kind: p.data });
    if (error || !data) return error ? failure(error) : { ok: false, error: SAVE_FAILED };
    const { data: row } = await client.from("income_sources").select("name").eq("id", data).maybeSingle();
    revalidatePath("/plans/income");
    return { ok: true, id: data, name: row?.name ?? "New source" };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}

export async function renameIncomeSource(sourceId: string, newName: string): Promise<ActionResult> {
  const a = id.safeParse(sourceId);
  const b = name.safeParse(newName);
  if (!a.success) return { ok: false, error: SAVE_FAILED };
  if (!b.success) return { ok: false, error: b.error.issues[0]?.message ?? SAVE_FAILED };
  return run((c) => c.rpc("rename_income_source", { p_source: a.data, p_name: b.data }));
}

/** Changes the rule. `wholeBucketId` is required for "whole". Only affects money that has no job yet. */
export async function setIncomeSourceRule(sourceId: string, newRule: string, wholeBucketId?: string): Promise<ActionResult> {
  const a = id.safeParse(sourceId);
  const r = rule.safeParse(newRule);
  if (!a.success || !r.success) return { ok: false, error: SAVE_FAILED };
  if (r.data === "whole" && !(wholeBucketId && id.safeParse(wholeBucketId).success)) return { ok: false, error: "Choose a bucket to keep it whole in." };
  return run(
    (c) => c.rpc("set_income_source_rule", { p_source: a.data, p_rule: r.data, ...(r.data === "whole" ? { p_whole_bucket: wholeBucketId } : {}) }),
    () => track("plan_edited", { field: "rule" }),
  );
}

/** Saves the own split. Any total up to 100% is stored; below 100% it stays unusable (never rescaled). */
export async function saveIncomeSourceSplit(sourceId: string, split: Array<{ bucketId: string; percentBp: number }>): Promise<ActionResult> {
  const a = id.safeParse(sourceId);
  const l = lines.safeParse(split);
  if (!a.success || !l.success) return { ok: false, error: "Use whole percentages from 0 to 100." };
  const total = l.data.reduce((s, x) => s + x.percentBp, 0);
  if (total > 10000) return { ok: false, error: `The split adds up to ${total / 100}%. Take ${(total - 10000) / 100}% out.` };
  return run(
    (c) => c.rpc("save_income_source_split", { p_source: a.data, p_lines: l.data }),
    () => track("plan_edited", { field: "percent" }),
  );
}

export async function setIncomeSourceLandsIn(sourceId: string, accountId: string): Promise<ActionResult> {
  const a = id.safeParse(sourceId);
  if (!a.success || accountId.length < 1 || accountId.length > 100) return { ok: false, error: SAVE_FAILED };
  return run((c) => c.rpc("set_income_source_lands_in", { p_source: a.data, p_account: accountId }));
}

export async function setIncomeSourceArchived(sourceId: string, archived: boolean): Promise<ActionResult> {
  const a = id.safeParse(sourceId);
  if (!a.success) return { ok: false, error: SAVE_FAILED };
  return run((c) => c.rpc("set_income_source_archived", { p_source: a.data, p_archived: archived }));
}

/** Only for a source that never had income; otherwise the person archives it. */
export async function removeIncomeSource(sourceId: string): Promise<ActionResult> {
  const a = id.safeParse(sourceId);
  if (!a.success) return { ok: false, error: SAVE_FAILED };
  return run((c) => c.rpc("remove_income_source", { p_source: a.data }));
}
