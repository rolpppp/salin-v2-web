import { createClient } from "@/lib/supabase/server";

/** How long a recovery session may change the password. Matches the email link lifetime (otp_expiry, 1 hour). */
export const RECOVERY_WINDOW_SECONDS = 3600;

type ClaimsLike = { amr?: unknown } | null | undefined;

/**
 * True only for a session created by a password-reset link (GoTrue puts `{ method: "recovery", timestamp }` in the
 * JWT `amr`; timestamp is in seconds) that is still inside the window. A normal password sign-in is not enough.
 */
export function isFreshRecoverySession(claims: ClaimsLike, nowMs: number = Date.now()): boolean {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) return false;
  const nowSeconds = nowMs / 1000;
  return amr.some((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    return method === "recovery" && typeof timestamp === "number" && timestamp <= nowSeconds + 60 && nowSeconds - timestamp <= RECOVERY_WINDOW_SECONDS;
  });
}

export type RecoveryState = { signedIn: boolean; recovery: boolean; email: string | null };

/** Reads the verified JWT claims of the current request. */
export async function getRecoveryState(): Promise<RecoveryState> {
  const supabase = await createClient();
  if (!supabase) return { signedIn: false, recovery: false, email: null };
  try {
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims) return { signedIn: false, recovery: false, email: null };
    return { signedIn: true, recovery: isFreshRecoverySession(claims), email: typeof claims.email === "string" ? claims.email : null };
  } catch {
    return { signedIn: false, recovery: false, email: null };
  }
}
