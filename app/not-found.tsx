import { ButtonLink } from "@/components/button/Button";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { PageHeader } from "@/components/page-header/PageHeader";
import { BareHeader } from "@/components/app-shell/AppHeader";
import { Page } from "@/components/app-shell/Page";

export default function NotFound() {
  return (
    <>
      <BareHeader />
      <Page>
        <PageHeader title="Page not found" />
        <EmptyState
          title="We couldn't find that page"
          action={
            <ButtonLink href="/today" variant="primary">
              Go to Today
            </ButtonLink>
          }
        >
          Check the address, or head back to Today.
        </EmptyState>
      </Page>
    </>
  );
}
