import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-shell/AppHeader";
import { Page } from "@/components/app-shell/Page";
import { SkipLink } from "@/components/app-shell/SkipLink";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <AppHeader />
      <Page>{children}</Page>
    </>
  );
}
