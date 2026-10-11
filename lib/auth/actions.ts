"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isFirstWebSignIn, trackWith } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, safeNext, signInSchema, signUpSchema, type FieldErrors } from "./schemas";

export type AuthFormState = {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Shown instead of the form after a sign-up that needs email confirmation. */
  notice?: string;
  email?: string;
};

const NO_SERVICE = "Salin can't reach its server right now. Check your connection and try again.";

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/** Records `web_signed_in` for the freshly signed-in session. Never blocks sign-in. */
async function recordSignIn(): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  const firstTime = await isFirstWebSignIn(supabase);
  await trackWith(supabase, "web_signed_in", { first_time: firstTime });
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = { email: text(formData, "email"), password: text(formData, "password") };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), email: raw.email };

  const supabase = await createClient();
  if (!supabase) return { error: NO_SERVICE, email: raw.email };

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const code = error.code ?? "";
    let message = "Couldn't sign you in. Check your connection and try again.";
    if (code === "invalid_credentials") {
      message = "That email and password don't match. Check them and try again, or create an account if you're new.";
    } else if (code === "email_not_confirmed") {
      message = "Confirm your email first. We sent a link to that address when you signed up.";
    } else if (code === "over_request_rate_limit" || error.status === 429) {
      message = "Too many tries. Wait a few minutes, then try again.";
    }
    return { error: message, email: raw.email };
  }

  await recordSignIn();
  redirect(safeNext(text(formData, "next")));
}

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = { email: text(formData, "email"), password: text(formData, "password") };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), email: raw.email };

  const supabase = await createClient();
  if (!supabase) return { error: NO_SERVICE, email: raw.email };

  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    let message = "Couldn't create your account. Check your connection and try again.";
    if (error.code === "weak_password") message = "That password is too easy to guess. Use a longer one with a mix of letters and numbers.";
    else if (error.code === "user_already_exists" || error.code === "email_exists") {
      message = "There's already an account with that email. Sign in instead.";
    } else if (error.code === "over_request_rate_limit" || error.status === 429) message = "Too many tries. Wait a few minutes, then try again.";
    return { error: message, email: raw.email };
  }

  // Supabase hides duplicates when confirmation is on: the user comes back with no identities.
  if (data.user && data.user.identities?.length === 0) {
    return { error: "There's already an account with that email. Sign in instead.", email: raw.email };
  }
  if (!data.session) {
    return { notice: `We sent a confirmation link to ${raw.email}. Open it to finish creating your account.`, email: raw.email };
  }

  await recordSignIn();
  redirect(safeNext(text(formData, "next")));
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // Cookies are cleared below by redirecting; the token expires on its own.
    }
  }
  redirect("/sign-in");
}
