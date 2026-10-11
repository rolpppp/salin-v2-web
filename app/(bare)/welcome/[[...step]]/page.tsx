import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { PageHeader } from "@/components/page-header/PageHeader";

export const metadata: Metadata = { title: "Set up Salin" };

export default function WelcomePage() {
  return (
    <>
      <PageHeader title="Set up Salin" />
      <EmptyState title="Setup is on its way">Onboarding arrives in a later release. For now, there is nothing to set up.</EmptyState>
    </>
  );
}
