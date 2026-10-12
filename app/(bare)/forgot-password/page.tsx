import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/RecoveryForms";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string | string[]; error?: string | string[] }> }) {
  const { email, error } = await searchParams;
  // Only prefills the field; the action validates whatever is submitted.
  const prefill = typeof email === "string" ? email.trim().slice(0, 254) : undefined;
  return <ForgotPasswordForm email={prefill} linkError={error === "link"} />;
}
