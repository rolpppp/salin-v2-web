import type { Metadata } from "next";
import { Button } from "@/components/button/Button";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { PageHeader } from "@/components/page-header/PageHeader";

export const metadata: Metadata = { title: "Money in" };

export default function MoneyInPage() {
  return (
    <>
      <PageHeader title="Money in" lede="Give each payday a job, then move the money." />
      <EmptyState
        title="Nothing waiting"
        action={
          // Disabled until the Add income form ships.
          <Button variant="primary" disabled>
            Add income
          </Button>
        }
      >
        When you add income it waits here until you choose its job.
      </EmptyState>
    </>
  );
}
