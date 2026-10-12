"use client";

import { useEffect } from "react";
import { useRouter, useSelectedLayoutSegment } from "next/navigation";
import { SegmentedControl } from "@/components/segmented-control/SegmentedControl";
import { PLAN_SECTIONS, isPlanSection } from "./sections";

export function PlansNav() {
  const router = useRouter();
  const segment = useSelectedLayoutSegment();
  // The tabs are a segmented control (router.push, no <Link>), so warm each section's loading shell ourselves.
  useEffect(() => {
    for (const s of PLAN_SECTIONS) router.prefetch(`/plans/${s.value}`);
  }, [router]);
  const current = segment && isPlanSection(segment) ? segment : "split";
  return (
    <SegmentedControl
      label="Plans sections"
      options={PLAN_SECTIONS}
      value={current}
      onValueChange={(v) => router.push(`/plans/${v}`)}
      narrow="wrap"
    />
  );
}
