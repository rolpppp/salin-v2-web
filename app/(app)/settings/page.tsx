import type { Metadata } from "next";
import { cookies } from "next/headers";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { PageHeader } from "@/components/page-header/PageHeader";
import { SettingsView } from "@/components/settings/SettingsView";
import { requireUser } from "@/lib/auth/session";
import { saveIncomeRhythm, saveKeepBucket, saveProfileBasics, saveViewMode } from "@/lib/actions/settings";
import { getSettingsData, type SettingsData } from "@/lib/data/settings";
import { isoDateIn } from "@/lib/data/money-in-model";
import { createClient } from "@/lib/supabase/server";
import { TZ_COOKIE, nowMs, validTimeZone } from "@/lib/time";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const supabase = await createClient();
  const tzCookie = (await cookies()).get(TZ_COOKIE)?.value ?? null;
  const todayIso = isoDateIn(nowMs(), validTimeZone(tzCookie ? decodeURIComponent(tzCookie) : null));

  let data: SettingsData | null = null;
  if (supabase) {
    try {
      data = await getSettingsData(supabase, user.id);
    } catch (err) {
      console.error("[settings] could not load", err);
    }
  }

  return (
    <>
      <PageHeader title="Settings" lede="What you set up when you started. Change it any time." />
      {data ? (
        <SettingsView data={data} todayIso={todayIso} actions={{ saveIncomeRhythm, saveProfileBasics, saveKeepBucket, saveViewMode }} />
      ) : (
        <EmptyState title="Couldn't load your settings">Check your connection and reload the page. Nothing was changed.</EmptyState>
      )}
    </>
  );
}
