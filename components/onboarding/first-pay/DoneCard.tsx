"use client";

import { useEffect, useRef } from "react";
import { ButtonLink } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { ArrowRightIcon, CheckIcon } from "@/components/icons";
import type { OnboardingDraft } from "@/lib/onboarding/draft";
import { doneLines, type FinishSummary } from "@/lib/onboarding/first-pay";
import { AppTile, ViewsTile } from "../Tour";
import styles from "./first-pay.module.css";

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.4 7.1L22 12l-7.6 2.9L12 22l-2.4-7.1L2 12l7.6-2.9z" />
    </svg>
  );
}

/**
 * SPEC §7.5 step 3: shown in place after Finish succeeded with every transfer sent (or none to send). The root carries
 * `data-burst="onboarding"`; the burst animation is CSS on that attribute. Focus lands on the heading.
 */
export function DoneCard({ draft, summary }: { draft: OnboardingDraft; summary: FinishSummary | null }) {
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    h.current?.focus();
  }, []);
  return (
    <Card tone="peak" as="section" className={styles.peak} aria-labelledby="ob-peak-h" role="status" data-burst="onboarding" data-testid="onboarding-done">
      <h2 id="ob-peak-h" ref={h} tabIndex={-1}>
        Every peso has a home.
      </h2>
      <ul>
        {doneLines(draft, summary).map((l) => (
          <li key={l.key}>
            <span className={`${styles.ck}${l.tone === "sun" ? ` ${styles.ckSun}` : ""}`} aria-hidden="true">
              {l.tone === "sun" ? <SparkIcon /> : <CheckIcon />}
            </span>
            {l.text}
          </li>
        ))}
      </ul>
      <ViewsTile />
      <AppTile name={draft.firstName} />
      <div className={styles.row}>
        <ButtonLink variant="primary" href="/today?grow=onboarding&tour=1">
          Open Today <ArrowRightIcon />
        </ButtonLink>
      </div>
    </Card>
  );
}
