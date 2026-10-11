/** Shared by the Plans server actions. Not a "use server" file, so it can export values. */
export type ActionResult<T = undefined> = { ok: true; value?: T } | { ok: false; error: string };

export const SAVE_FAILED = "Couldn't save. Check your connection and try again.";
export const SIGNED_OUT = "You're signed out. Sign in again, then retry.";

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Turns a Postgres error from our guarded functions into a sentence for the person.
 * P0001 "in use: {reason}" = blocked because something uses it; P0001 otherwise = invalid input;
 * 23505 = duplicate name; P0002 = not found / not yours; 28000 = signed out.
 */
export function dbFailure(error: { code?: string | null; message?: string | null } | null | undefined): string {
  const code = error?.code ?? "";
  const msg = (error?.message ?? "").trim();
  if (code === "P0001" && /^in use:/i.test(msg)) return `In use: ${msg.replace(/^in use:\s*/i, "")}.`;
  if (code === "P0001" || code === "23505") return `${cap(msg)}${/[.!?]$/.test(msg) ? "" : "."}`;
  if (code === "P0002") return "That item isn't there any more. Reload the page and try again.";
  if (code === "28000") return SIGNED_OUT;
  return SAVE_FAILED;
}

export const norm = (s: string) => s.trim().toLowerCase();
