"use client";

import { useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/segmented-control/SegmentedControl";
import { PLAN_SECTIONS, type PlanSection } from "./sections";

export function PlansNav({ current }: { current: PlanSection }) {
  const router = useRouter();
  return (
    <SegmentedControl
      label="Plans sections"
      options={PLAN_SECTIONS}
      value={current}
      onValueChange={(v) => router.push(`/plans/${v}`)}
    />
  );
}
