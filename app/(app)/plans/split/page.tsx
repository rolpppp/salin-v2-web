import { EmptyState } from "@/components/empty-state/EmptyState";
import { RulesCard } from "@/components/plans/split/RulesCard";
import { SplitPlanEditor } from "@/components/plans/split/SplitPlanEditor";
import { requireUser } from "@/lib/auth/session";
import { getSplitPlanData, type SplitPlanData } from "@/lib/data/plans";
import { createClient } from "@/lib/supabase/server";

export default async function SplitPlanPage() {
  const user = await requireUser("/plans/split");
  const supabase = await createClient();

  let data: SplitPlanData | null = null;
  if (supabase) {
    try {
      data = await getSplitPlanData(supabase, user.id);
    } catch (err) {
      console.error("[plans/split] could not load", err);
    }
  }

  if (!data) return <EmptyState title="Couldn't load your plan">Check your connection and reload the page. Nothing was changed.</EmptyState>;
  if (data.plans.length === 0 || data.buckets.length === 0) {
    return <EmptyState title="No split plan yet">Set what share of each payday goes to each bucket. Your plan shows here once it is set up.</EmptyState>;
  }
  return <SplitPlanEditor data={data} rules={<RulesCard switchRule={data.switchRule} redirectRule={data.redirectRule} />} />;
}
