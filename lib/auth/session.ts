import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** The slice of the signed-in user that pages need: id, email, and the sign-up metadata used for greetings. */
export type SessionUser = { id: string; email: string | undefined; user_metadata: Record<string, unknown> };

/**
 * The verified signed-in user for this request, or null. Reads the access token's claims with `getClaims()`, which
 * checks the signature locally against the project's cached JWKS (no round trip) when the project signs JWTs with
 * asymmetric keys. With the legacy symmetric (HS256) secret, supabase-js falls back to a `getUser()` network call
 * inside `getClaims()`, so it is correct either way, just not faster. RLS still enforces access on every query
 * with the same token. Where the live auth record matters (nowhere on a page today), call `supabase.auth.getUser()` directly. Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims?.sub) return null;
    const meta = claims.user_metadata;
    return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined, user_metadata: meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {} };
  } catch {
    return null;
  }
});

/** For server components and layouts: the user, or a redirect to sign-in. */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  return user;
}

/** First name for greetings: profile first name, else auth metadata name, else null. */
export function displayFirstName(profileFirstName: string | null | undefined, user: Pick<SessionUser, "user_metadata">): string | null {
  const fromProfile = profileFirstName?.trim();
  if (fromProfile) return fromProfile;
  const meta = user.user_metadata;
  const raw = [meta?.first_name, meta?.name, meta?.full_name].find((v): v is string => typeof v === "string" && v.trim() !== "");
  return raw ? raw.trim().split(/\s+/)[0] : null;
}
