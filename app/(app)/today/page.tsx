import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { ButtonLink } from "@/components/button/Button";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { Skeleton } from "@/components/skeleton/Skeleton";
import { Greeting } from "@/components/today/Greeting";
import { LogSpendingSlot, startLogSpendingLoad } from "@/components/today/LogSpendingSlot";
import { PasswordUpdatedNotice } from "@/components/today/PasswordUpdatedNotice";
import { TimezoneSync } from "@/components/today/TimezoneSync";
import { TodayView } from "@/components/today/TodayView";
import styles from "@/components/today/today.module.css";
import { requireUser, displayFirstName } from "@/lib/auth/session";
import { parseGrow } from "@/lib/motion/grow";
import { getRequestProfile } from "@/lib/data/request-profile";
import { getTodayInput } from "@/lib/data/today";
import { buildTodayView, daysUntilPayday, daysUntilText, type TodayView as TodayViewModel } from "@/lib/data/today-model";
import { createClient } from "@/lib/supabase/server";
import { TZ_COOKIE, nowMs, validTimeZone } from "@/lib/time";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ grow?: string | string[] }> }) {
  const grow = parseGrow((await searchParams).grow);
  const user = await requireUser("/today");
  // Starts the Log spending sheet's reads now, in parallel with the page's own, instead of after they finish.
  startLogSpendingLoad();
  const supabase = await createClient();
  const tzCookie = (await cookies()).get(TZ_COOKIE)?.value ?? null;
  const timeZone = validTimeZone(tzCookie ? decodeURIComponent(tzCookie) : null);

  let view: TodayViewModel | null = null;
  let firstName: string | null = displayFirstName(null, user);
  let daysText: string | null = null;
  if (supabase) {
    try {
      const profile = await getRequestProfile(user.id);
      firstName = displayFirstName(profile?.firstName, user);
      const input = await getTodayInput(supabase, { userId: user.id, nowMs: nowMs(), timeZone, profile });
      view = buildTodayView(input);
      daysText = daysUntilText(daysUntilPayday(input.todayIso, input.profile.nextPaydayDate));
    } catch (err) {
      console.error("[today] could not load", err);
    }
  }

  return (
    <>
      <TimezoneSync serverZone={tzCookie ? timeZone : null} />
      <PasswordUpdatedNotice />
      <Greeting firstName={firstName} daysText={daysText}>
        {/* Ticket 19 fills this slot with the Log spending launcher. */}
        <Suspense fallback={<Skeleton width={130} height={40} radius={12} />}>
          <LogSpendingSlot variant="soft" />
        </Suspense>
        <ButtonLink variant="soft" href="/money-in?add=1" data-testid="add-income">
          + Add income
        </ButtonLink>
      </Greeting>
      {!view ? (
        <EmptyState title="Couldn't load your numbers">Check your connection and reload the page. Nothing was changed.</EmptyState>
      ) : (
        <>
          {view.syncOff ? (
            <p className={styles.banner} role="status" data-testid="sync-off-banner">
              Spending from your phone shows here when sync is on in the Salin app.
            </p>
          ) : null}
          <TodayView view={view} grow={grow} logSlot={
              <Suspense fallback={<Skeleton width={170} height={44} radius={12} />}>
                <LogSpendingSlot variant="primary" />
              </Suspense>
            } />
        </>
      )}
    </>
  );
}
