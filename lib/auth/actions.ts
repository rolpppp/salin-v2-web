"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isFirstWebSignIn, trackWith } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import { isFreshRecoverySession } from "./recovery";
import { fieldErrors, forgotPasswordSchema, resetPasswordSchema, safeNext, signInSchema, signUpSchema, type FieldErrors } from "./schemas";

export type AuthFormState = {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Shown instead of the form after a sign-up that needs email confirmation. */
  notice?: string;
  email?: string;
  /** Reset only: there is no recovery session (link expired, used, or opened in another browser). */
  expired?: boolean;
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

const RATE_LIMITED = "Too many tries. Wait a few minutes, then try again.";

const isRateLimit = (error: { code?: string; status?: number }) =>
  error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit" || error.status === 429;

/**
 * Sends the password reset email (default Supabase template, PKCE: the link must be opened in this browser).
 * The notice is the same whether or not an account exists, so this can't be used to find out who has one.
 */
export async function forgotPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = { email: text(formData, "email") };
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), email: raw.email };

  const supabase = await createClient();
  if (!supabase) return { error: NO_SERVICE, email: raw.email };

  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (error) {
    return { error: isRateLimit(error) ? RATE_LIMITED : NO_SERVICE, email: raw.email };
  }
  return {
    notice: `If there's a Salin account for ${parsed.data.email}, we sent a link to reset your password. Open it in this browser. It expires in an hour.`,
    email: parsed.data.email,
  };
}

/** Sets the new password for the recovery session the email link created, then goes to Today. */
export async function resetPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({ password: text(formData, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  if (!supabase) return { error: NO_SERVICE };

  // Only a fresh recovery session (from the emailed link) may set a password without knowing the current one.
  let claims: Parameters<typeof isFreshRecoverySession>[0] = null;
  try {
    claims = (await supabase.auth.getClaims()).data?.claims;
  } catch {
    // Treated as no session.
  }
  if (!isFreshRecoverySession(claims)) return { expired: true };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const code = error.code ?? "";
    if (code === "same_password") return { error: "That's your current password. Choose a different one." };
    if (code === "weak_password") return { error: "That password is too easy to guess. Use a longer one with a mix of letters and numbers." };
    if (isRateLimit(error)) return { error: RATE_LIMITED };
    if (error.name === "AuthSessionMissingError" || code === "session_not_found" || code === "session_expired" || code === "no_authorization" || error.status === 401) {
      return { expired: true };
    }
    return { error: "Couldn't save your new password. Check your connection and try again." };
  }
  redirect("/today?notice=password-updated");
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
