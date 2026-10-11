import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { PageHeader } from "@/components/page-header/PageHeader";
import { PlansNav } from "../PlansNav";
import { PLAN_SECTIONS, isPlanSection, type PlanSection } from "../sections";

export const dynamicParams = false;

export function generateStaticParams() {
  return PLAN_SECTIONS.map((s) => ({ section: s.value }));
}

export const metadata: Metadata = { title: "Plans" };

const EMPTY: Record<PlanSection, { title: string; body: string }> = {
  split: { title: "No split plan yet", body: "Set what share of each payday goes to each bucket. Your plan shows here once it is set up." },
  income: { title: "No income sources yet", body: "Add where your money comes from, such as salary or a side hustle, and choose each source's rule." },
  accounts: { title: "No accounts yet", body: "Add the accounts you keep money in so each bucket knows where it lives." },
  categories: { title: "No categories yet", body: "Categories sit inside buckets. Add one to start grouping your spending." },
  goals: { title: "No goals yet", body: "Add a goal with a target to watch it fill. Add a goal when you are ready." },
};

export default async function PlansSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isPlanSection(section)) notFound();
  const e = EMPTY[section];
  return (
    <>
      <PageHeader title="Plans" lede="How your money is split, and where it lives." />
      <div style={{ marginBottom: 20, maxWidth: "100%" }}>
        <PlansNav current={section} />
      </div>
      <EmptyState title={e.title}>{e.body}</EmptyState>
    </>
  );
}
