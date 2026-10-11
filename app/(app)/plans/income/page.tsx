import { EmptyState } from "@/components/empty-state/EmptyState";
import { IncomeSources } from "@/components/plans/income/IncomeSources";
import { requireUser } from "@/lib/auth/session";
import { getIncomeSourcesData, type IncomeSourcesData } from "@/lib/data/income-sources";
import { createClient } from "@/lib/supabase/server";

export default async function IncomePage() {
  const user = await requireUser("/plans/income");
  const supabase = await createClient();

  let data: IncomeSourcesData | null = null;
  if (supabase) {
    try {
      data = await getIncomeSourcesData(supabase, user.id);
    } catch (err) {
      console.error("[plans/income] could not load", err);
    }
  }

  if (!data) return <EmptyState title="Couldn't load your income sources">Check your connection and reload the page. Nothing was changed.</EmptyState>;
  return <IncomeSources data={data} />;
}
