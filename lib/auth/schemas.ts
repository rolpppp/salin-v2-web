import { z } from "zod";

/** Only same-site relative paths are allowed as a post-sign-in destination (no open redirects). */
export function safeNext(raw: unknown, fallback = "/today"): string {
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  // Browsers drop tabs/newlines in URLs, so "/\t/evil.com" would become "//evil.com".
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  if (/^\/(sign-in|sign-up|forgot-password|auth)(\/|\?|$)/.test(raw)) return fallback;
  return raw;
}

const email = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email("That doesn't look like an email address. Check for a typo, like name@example.com."));

export const signInSchema = z.object({
  email,
  // Mobile accounts may have any password the app accepted, so only require one here.
  password: z.string().min(1, "Enter your password.").max(256, "That password is too long."),
});

export const PASSWORD_MIN = 8;

/** The rules for a password the user chooses (sign-up and reset). */
const newPassword = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters for your password.`)
  .max(256, "That password is too long.");

export const signUpSchema = z.object({ email, password: newPassword });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({ password: newPassword });

export type FieldErrors = { email?: string; password?: string };

/** Flattens a zod error to the first message per field. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if ((key === "email" || key === "password") && !out[key]) out[key] = issue.message;
  }
  return out;
}
