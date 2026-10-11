"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { AccountType } from "@/lib/domain/enums";
import { accountRenamePatch, accountRetypePatch, MobileRowError, newAccountRow, NAME_MAX } from "@/lib/domain/mobile";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, norm, SAVE_FAILED, type ActionResult } from "./planResult";

const nameSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1, "Add a name for the account.").refine((s) => [...s].length <= NAME_MAX, `Use ${NAME_MAX} characters or fewer.`));
const typeSchema = z.enum(Object.keys(AccountType) as [keyof typeof AccountType, ...Array<keyof typeof AccountType>], { error: "Pick an account type." });
const currencySchema = z.enum(["PHP", "AUD", "USD"], { error: "Pick PHP, AUD or USD." });
const idSchema = z.string().min(1).max(200);

const PATH = "/plans/accounts";
const first = (e: z.ZodError) => e.issues[0]?.message ?? "Check the details and try again.";

/** Another active account already has this name (case and spacing ignored). Archived accounts don't count (DATA_MODEL §2). */
async function nameTaken(client: NonNullable<Awaited<ReturnType<typeof createClient>>>, name: string, exceptId?: string): Promise<boolean> {
  const { data, error } = await client.from("accounts").select("id, name").is("deletedAt", null).eq("isArchived", false);
  if (error) throw new Error(error.message);
  return (data ?? []).some((a) => a.id !== exceptId && norm(a.name) === norm(name));
}

export async function addAccountAction(input: { name: string; type: string; currency: string }): Promise<ActionResult<{ id: string }>> {
  const parsed = z.object({ name: nameSchema, type: typeSchema, currency: currencySchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  const user = await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    if (await nameTaken(client, parsed.data.name)) return { ok: false, error: `You already have an account called ${parsed.data.name}. Pick a different name.` };
    const row = newAccountRow({ userId: user.id, nowMs: Date.now(), name: parsed.data.name, type: parsed.data.type, currency: parsed.data.currency });
    const { error } = await client.from("accounts").insert(row);
    if (error) return { ok: false, error: dbFailure(error) };
    revalidatePath(PATH);
    return { ok: true, value: { id: row.id } };
  } catch (err) {
    if (err instanceof MobileRowError) return { ok: false, error: err.message };
    console.error("[accounts] add failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

export async function renameAccountAction(input: { id: string; name: string }): Promise<ActionResult> {
  const parsed = z.object({ id: idSchema, name: nameSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  const user = await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    if (await nameTaken(client, parsed.data.name, parsed.data.id)) return { ok: false, error: `You already have an account called ${parsed.data.name}. Pick a different name.` };
    // Accounts are referenced by id everywhere, so a rename never rewrites a reference (BR 5.4).
    const { data, error } = await client.from("accounts").update(accountRenamePatch(parsed.data.name, Date.now())).eq("id", parsed.data.id).eq("user_id", user.id).select("id");
    if (error) return { ok: false, error: dbFailure(error) };
    if (!data?.length) return { ok: false, error: dbFailure({ code: "P0002" }) };
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    console.error("[accounts] rename failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

export async function retypeAccountAction(input: { id: string; type: string }): Promise<ActionResult> {
  const parsed = z.object({ id: idSchema, type: typeSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  const user = await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    const { data, error } = await client.from("accounts").update(accountRetypePatch(parsed.data.type, Date.now())).eq("id", parsed.data.id).eq("user_id", user.id).select("id");
    if (error) return { ok: false, error: dbFailure(error) };
    if (!data?.length) return { ok: false, error: dbFailure({ code: "P0002" }) };
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    console.error("[accounts] retype failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/** Server-side guard: `archive_account` refuses while anything uses the account (BR 5.3). */
export async function archiveAccountAction(input: { id: string }): Promise<ActionResult> {
  const parsed = z.object({ id: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    const { error } = await client.rpc("archive_account", { p_account: parsed.data.id });
    if (error) return { ok: false, error: dbFailure(error) };
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    console.error("[accounts] archive failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

export async function restoreAccountAction(input: { id: string }): Promise<ActionResult> {
  const parsed = z.object({ id: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: first(parsed.error) };
  await requireUser(PATH);
  const client = await createClient();
  if (!client) return { ok: false, error: SAVE_FAILED };
  try {
    const { error } = await client.rpc("restore_account", { p_account: parsed.data.id });
    if (error) return { ok: false, error: dbFailure(error) };
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    console.error("[accounts] restore failed", err);
    return { ok: false, error: SAVE_FAILED };
  }
}
