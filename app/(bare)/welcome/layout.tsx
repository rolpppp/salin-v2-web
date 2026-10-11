import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { requireUser } from "@/lib/auth/session";
import { loadOnboarding, type OnboardingLoad } from "@/lib/data/onboarding";
import { createClient } from "@/lib/supabase/server";
import { TZ_COOKIE, nowMs, validTimeZone } from "@/lib/time";

export const metadata: Metadata = { title: "Set up Salin" };

/**
 * Loads everything onboarding needs once per full page load (the draft, what the phone synced, today's date) and
 * keeps the shell mounted while the steps change underneath it, so moving between steps costs no server work.
 * An onboarded user goes to Today, except "Make a plan" re-entry (`planOnly`, SPEC §7.6).
 */
export default async function WelcomeLayout({ children }: { children: ReactNode }) {
  const user = await requireUser("/welcome");
  const client = await createClient();
  const raw = (await cookies()).get(TZ_COOKIE)?.value ?? null;
  const timeZone = validTimeZone(raw ? decodeURIComponent(raw) : null);

  let load: OnboardingLoad | null = null;
  if (client) {
    try {
      load = await loadOnboarding(client, { userId: user.id, nowMs: nowMs(), timeZone });
    } catch (err) {
      console.error("[onboarding] could not load", err);
    }
  }
  if (!load) {
    return <EmptyState title="Couldn't load setup">Check your connection and reload the page. Nothing was changed.</EmptyState>;
  }
  if (load.onboarded && !load.draft.planOnly) redirect("/today");

  return (
    <>
      <OnboardingFlow initialDraft={load.draft} initialCtx={load.ctx} initialFacts={load.facts} autoDetected={load.autoDetected} userId={user.id} />
      {children}
    </>
  );
}
