import type { Metadata } from "next";
import { cookies } from "next/headers";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { PageHeader } from "@/components/page-header/PageHeader";
import { ReviewView } from "@/components/review/ReviewView";
import { requireUser } from "@/lib/auth/session";
import { getReviewData } from "@/lib/data/review";
import type { ReviewData } from "@/lib/data/review-model";
import { createClient } from "@/lib/supabase/server";
import { TZ_COOKIE, nowMs, validTimeZone } from "@/lib/time";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage() {
  const user = await requireUser("/review");
  const supabase = await createClient();
  const tzCookie = (await cookies()).get(TZ_COOKIE)?.value ?? null;
  const timeZone = validTimeZone(tzCookie ? decodeURIComponent(tzCookie) : null);

  let data: ReviewData | null = null;
  if (supabase) {
    try {
      data = await getReviewData(supabase, { userId: user.id, nowMs: nowMs(), timeZone });
    } catch (err) {
      console.error("[review] could not load", err);
    }
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Review" lede="Close the week with an honest look at what happened." />
        <EmptyState title="Couldn't load your review">Check your connection and reload the page. Nothing was changed.</EmptyState>
      </>
    );
  }
  return <ReviewView data={data} />;
}
