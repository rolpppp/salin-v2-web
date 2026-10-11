import type { User } from "@supabase/supabase-js";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** The verified signed-in user for this request, or null. Validates the token with Supabase Auth. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user;
  } catch {
    return null;
  }
});

/** For server components and layouts: the user, or a redirect to sign-in. */
export async function requireUser(next?: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  return user;
}

/** First name for greetings: profile first name, else auth metadata name, else null. */
export function displayFirstName(profileFirstName: string | null | undefined, user: User): string | null {
  const fromProfile = profileFirstName?.trim();
  if (fromProfile) return fromProfile;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const raw = [meta?.first_name, meta?.name, meta?.full_name].find((v): v is string => typeof v === "string" && v.trim() !== "");
  return raw ? raw.trim().split(/\s+/)[0] : null;
}
