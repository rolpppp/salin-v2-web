import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-shell/AppHeader";
import { Page } from "@/components/app-shell/Page";
import { SkipLink } from "@/components/app-shell/SkipLink";
import { requireUser } from "@/lib/auth/session";

/** proxy.ts redirects signed-out users first; this re-checks on the server so no app route renders without a user. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <SkipLink />
      <AppHeader email={user.email} />
      <Page>{children}</Page>
    </>
  );
}
