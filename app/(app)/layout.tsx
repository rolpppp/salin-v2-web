import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-shell/AppHeader";
import { Page } from "@/components/app-shell/Page";
import { LiveRefresh } from "@/components/live/LiveRefresh";
import { SkipLink } from "@/components/app-shell/SkipLink";
import { getViewMode, simpleActions } from "@/components/simple-today/seam";
import { requireUser } from "@/lib/auth/session";
import { getTabBadges } from "@/lib/data/badges";

/** proxy.ts redirects signed-out users first; this re-checks on the server so no app route renders without a user. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Independent reads, so one wave: the badges RPC runs on the same token and does not need the user object.
  const [user, badges] = await Promise.all([requireUser(), getTabBadges()]);
  const mode = await getViewMode(user.id);
  return (
    <>
      <SkipLink />
      <LiveRefresh userId={user.id} />
      <AppHeader email={user.email} badges={badges} view={{ mode, set: simpleActions.setViewMode }} />
      <Page>{children}</Page>
    </>
  );
}
