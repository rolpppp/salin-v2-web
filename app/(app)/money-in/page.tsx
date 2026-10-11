import type { Metadata } from "next";
import { cookies } from "next/headers";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { MoneyInView } from "@/components/money-in/MoneyInView";
import { PageHeader } from "@/components/page-header/PageHeader";
import { requireUser } from "@/lib/auth/session";
import { getMoneyInData } from "@/lib/data/money-in";
import type { MoneyInData } from "@/lib/data/money-in-model";
import { getProfile } from "@/lib/data/today";
import { createClient } from "@/lib/supabase/server";
import { TZ_COOKIE, nowMs, validTimeZone } from "@/lib/time";

export const metadata: Metadata = { title: "Money in" };

export default async function MoneyInPage({ searchParams }: { searchParams: Promise<{ add?: string | string[] }> }) {
  const user = await requireUser("/money-in");
  const sp = await searchParams;
  const supabase = await createClient();
  const tzCookie = (await cookies()).get(TZ_COOKIE)?.value ?? null;
  const timeZone = validTimeZone(tzCookie ? decodeURIComponent(tzCookie) : null);
  const now = nowMs();

  let data: MoneyInData | null = null;
  if (supabase) {
    try {
      const profile = await getProfile(supabase, user.id);
      data = await getMoneyInData(supabase, { nowMs: now, timeZone, homeCurrency: profile?.homeCurrency ?? "PHP" });
    } catch (err) {
      console.error("[money-in] could not load", err);
    }
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Money in" lede="Give each payday a job, then move the money." />
        <EmptyState title="Couldn't load Money in">Check your connection and reload the page. Nothing was changed.</EmptyState>
      </>
    );
  }
  return <MoneyInView data={data} initialAddOpen={sp.add === "1"} nowMs={now} />;
}
