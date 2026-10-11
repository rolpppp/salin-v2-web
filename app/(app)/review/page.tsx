import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { PageHeader } from "@/components/page-header/PageHeader";

export const metadata: Metadata = { title: "Review" };

export default function ReviewPage() {
  return (
    <>
      <PageHeader title="Review" lede="Close the week with an honest look at what happened." />
      <EmptyState title="Nothing logged this week">
        Log spending on your phone and it shows here.
      </EmptyState>
    </>
  );
}
