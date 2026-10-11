import type { Metadata } from "next";
import { GoalsPanel } from "@/components/plans/goals/GoalsPanel";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { requireUser } from "@/lib/auth/session";
import { getGoalsData, type GoalsData } from "@/lib/data/goals";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Goals · Plans" };

export default async function GoalsPage() {
  await requireUser("/plans/goals");
  const supabase = await createClient();
  let data: GoalsData | null = null;
  if (supabase) {
    try {
      data = await getGoalsData(supabase);
    } catch (err) {
      console.error("[plans/goals] could not load", err);
    }
  }
  if (!data) return <EmptyState title="Couldn't load your goals">Check your connection and reload the page. Nothing was changed.</EmptyState>;
  return <GoalsPanel data={data} />;
}
