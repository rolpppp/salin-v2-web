import type { ReactNode } from "react";
import { BareHeader } from "@/components/app-shell/AppHeader";
import { Page } from "@/components/app-shell/Page";
import { SkipLink } from "@/components/app-shell/SkipLink";

export default function BareLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <BareHeader />
      <Page>{children}</Page>
    </>
  );
}
