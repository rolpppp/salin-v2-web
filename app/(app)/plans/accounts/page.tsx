import type { Metadata } from "next";
import { AccountsPanel } from "@/components/plans/accounts/AccountsPanel";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { requireUser } from "@/lib/auth/session";
import { getAccountsData, type AccountsData } from "@/lib/data/accounts";
import { getStartGroups } from "@/lib/data/starting";
import type { StartGroup } from "@/lib/data/starting-model";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Accounts · Plans" };

export default async function AccountsPage() {
  await requireUser("/plans/accounts");
  const supabase = await createClient();
  let data: AccountsData | null = null;
  let startGroups: StartGroup[] = [];
  if (supabase) {
    try {
      [data, startGroups] = await Promise.all([
        getAccountsData(supabase),
        // Never blocks the page: without the card the accounts still show.
        getStartGroups(supabase).catch((err) => {
          console.error("[plans/accounts] starting money could not load", err);
          return [] as StartGroup[];
        }),
      ]);
    } catch (err) {
      console.error("[plans/accounts] could not load", err);
    }
  }
  if (!data) return <EmptyState title="Couldn't load your accounts">Check your connection and reload the page. Nothing was changed.</EmptyState>;
  return <AccountsPanel data={data} startGroups={startGroups} />;
}
