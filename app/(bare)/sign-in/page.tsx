import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { PageHeader } from "@/components/page-header/PageHeader";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <PageHeader title="Sign in" />
      <EmptyState title="Sign-in is on its way">Use the same account as the Salin app once sign-in is turned on.</EmptyState>
    </>
  );
}
