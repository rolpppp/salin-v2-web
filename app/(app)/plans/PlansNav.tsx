"use client";

import { useRouter, useSelectedLayoutSegment } from "next/navigation";
import { SegmentedControl } from "@/components/segmented-control/SegmentedControl";
import { PLAN_SECTIONS, isPlanSection } from "./sections";

export function PlansNav() {
  const router = useRouter();
  const segment = useSelectedLayoutSegment();
  const current = segment && isPlanSection(segment) ? segment : "split";
  return (
    <SegmentedControl
      label="Plans sections"
      options={PLAN_SECTIONS}
      value={current}
      onValueChange={(v) => router.push(`/plans/${v}`)}
    />
  );
}
