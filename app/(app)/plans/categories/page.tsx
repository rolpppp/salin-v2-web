import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CategoriesPanel } from "@/components/plans/categories/CategoriesPanel";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { requireUser } from "@/lib/auth/session";
import { getCategoriesData, type CategoriesData } from "@/lib/data/categories";
import { getProfile } from "@/lib/data/today";
import { createClient } from "@/lib/supabase/server";
import { TZ_COOKIE, nowMs, validTimeZone } from "@/lib/time";

export const metadata: Metadata = { title: "Categories · Plans" };

export default async function CategoriesPage() {
  const user = await requireUser("/plans/categories");
  const supabase = await createClient();
  const tzCookie = (await cookies()).get(TZ_COOKIE)?.value ?? null;
  const timeZone = validTimeZone(tzCookie ? decodeURIComponent(tzCookie) : null);
  let data: CategoriesData | null = null;
  let currency = "PHP";
  if (supabase) {
    try {
      const profile = await getProfile(supabase, user.id);
      currency = profile?.homeCurrency ?? "PHP";
      data = await getCategoriesData(supabase, { nowMs: nowMs(), timeZone, homeCurrency: currency });
    } catch (err) {
      console.error("[plans/categories] could not load", err);
    }
  }
  if (!data) return <EmptyState title="Couldn't load your categories">Check your connection and reload the page. Nothing was changed.</EmptyState>;
  return <CategoriesPanel data={data} currency={currency} />;
}
