import type { Metadata } from "next";
import { ButtonLink } from "@/components/button/Button";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { PageHeader } from "@/components/page-header/PageHeader";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <PageHeader title="Today" />
      <EmptyState
        title="Nothing to show yet"
        action={
          <ButtonLink href="/money-in" variant="primary">
            Go to Money in
          </ButtonLink>
        }
      >
        Your safe-to-spend and buckets appear here once you have added income and given it a job.
      </EmptyState>
    </>
  );
}
