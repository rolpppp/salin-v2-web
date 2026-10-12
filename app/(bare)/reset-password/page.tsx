import type { Metadata } from "next";
import { ResetLinkExpired, ResetPasswordForm } from "@/components/auth/RecoveryForms";
import { getRecoveryState } from "@/lib/auth/recovery";

export const metadata: Metadata = { title: "Choose a new password" };

// The form only appears for the fresh recovery session the emailed link creates (PKCE: same browser).
// A normal signed-in session can't change the password here without the current one.
export default async function ResetPasswordPage() {
  const state = await getRecoveryState();
  if (state.recovery) return <ResetPasswordForm />;
  return <ResetLinkExpired signedInEmail={state.signedIn ? (state.email ?? "") : undefined} />;
}
