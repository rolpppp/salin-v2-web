import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header/PageHeader";
import { PlansNav } from "./PlansNav";

export const metadata: Metadata = { title: "Plans" };

// Each section is its own route folder (split, income, accounts, categories, goals) so they can be built independently.
export default function PlansLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="Plans" lede="How your money is split, and where it lives." />
      <div style={{ marginBottom: 20, maxWidth: "100%" }} data-tour="plans-nav">
        <PlansNav />
      </div>
      <div data-tour="plans-body">{children}</div>
    </>
  );
}
