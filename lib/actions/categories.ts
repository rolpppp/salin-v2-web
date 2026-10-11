"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { CategoryType } from "@/lib/domain/enums";
import { categoryRenamePatch, MobileRowError, newCategoryRow, NAME_MAX } from "@/lib/domain/mobile";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, norm, SAVE_FAILED, type ActionResult } from "./planResult";

const nameSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1, "Add a name for the category.").refine((s) => [...s].length <= NAME_MAX, `Use ${NAME_MAX} characters or fewer.`));
const idSchema = z.string().min(1).max(200);
const bucketSchema = z.uuid({ error: "Pick a bucket." });

const PATH = "/plans/categories";
const first = (e: z.ZodError) => e.issues[0]?.message ?? "Check the details and try again.";

type Client = NonNullable<Awaited<ReturnType<typeof createClient>>>;

async function nameTaken(client: Client, name: string, exceptId?: string): Promise<boolean> {
  const { data, error } = await client.from("categories").select("id, name").is("deletedAt", null).eq("categoryType", CategoryType.expense);
  if (error) throw new Error(error.message);
  return (data ?? []).some((c) => c.id !== exceptId && norm(c.name) === norm(name));
}

/** Creates an expense `categories` row (mobile shape) and its `category_buckets` row (BR 6.1). */
export async function addCategoryAction(input: { name: string; bucketId: string }): Promise<ActionResult<{ id: string }>> {
  const parsed = z.object({ name: nameSchema, bucketId: bucketSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  const user = await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    if (await nameTaken(client, parsed.data.name)) return { ok: false, error: `You already have a category called ${parsed.data.name}. Pick a different name.` };
    const row = newCategoryRow({ userId: user.id, nowMs: Date.now(), name: parsed.data.name, type: "expense" });
    const ins = await client.from("categories").insert(row);
    if (ins.error) return { ok: false, error: dbFailure(ins.error) };
    const map = await client.rpc("move_category", { p_category: row.id, p_bucket: parsed.data.bucketId });
    if (map.error) {
      // Don't leave a category that no bucket owns: soft delete it again.
      const now = Date.now();
      await client.from("categories").update({ deletedAt: now, updatedAt: now }).eq("id", row.id).eq("user_id", user.id);
      return { ok: false, error: dbFailure(map.error) };
    }
    revalidatePath(PATH);
    return { ok: true, value: { id: row.id } };
  } catch (err) {
    if (err instanceof MobileRowError) return { ok: false, error: err.message };
    console.error("[categories] add failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

export async function renameCategoryAction(input: { id: string; name: string }): Promise<ActionResult> {
  const parsed = z.object({ id: idSchema, name: nameSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  const user = await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    if (await nameTaken(client, parsed.data.name, parsed.data.id)) return { ok: false, error: `You already have a category called ${parsed.data.name}. Pick a different name.` };
    const { data, error } = await client.from("categories").update(categoryRenamePatch(parsed.data.name, Date.now())).eq("id", parsed.data.id).eq("user_id", user.id).is("deletedAt", null).select("id");
    if (error) return { ok: false, error: dbFailure(error) };
    if (!data?.length) return { ok: false, error: dbFailure({ code: "P0002" }) };
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    console.error("[categories] rename failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/** `move_category` freezes existing entries in the old bucket, then points the category at the new one (BR 6.2). */
export async function moveCategoryAction(input: { id: string; bucketId: string }): Promise<ActionResult> {
  const parsed = z.object({ id: idSchema, bucketId: bucketSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    const { error } = await client.rpc("move_category", { p_category: parsed.data.id, p_bucket: parsed.data.bucketId });
    if (error) return { ok: false, error: dbFailure(error) };
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    console.error("[categories] move failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/** Server-side guard: `remove_category` refuses when it has entries (BR 6.3). Soft delete only. */
export async function removeCategoryAction(input: { id: string }): Promise<ActionResult> {
  const parsed = z.object({ id: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    const { error } = await client.rpc("remove_category", { p_category: parsed.data.id });
    if (error) return { ok: false, error: dbFailure(error) };
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    console.error("[categories] remove failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}
