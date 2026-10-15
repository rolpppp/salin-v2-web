"use client";

import { useEffect, useRef } from "react";
import { ButtonLink } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { ArrowRightIcon } from "@/components/icons";
import { formatPeso } from "@/lib/money";
import type { OnboardingDraft } from "@/lib/onboarding/draft";
import { moneySplit, perDayFor, perDayText } from "@/lib/onboarding/simple-path";
import { AppTile, ViewsTile } from "./Tour";
import styles from "./tour.module.css";

/**
 * The last screen for allowance / mix (Onboarding v2): your number, how the buckets work, the Simple / Full switch and
 * how to ask for the phone app. Shown in place after Finish; focus lands on the heading.
 */
export function SimpleDone({ draft, todayIso }: { draft: OnboardingDraft; todayIso: string }) {
  const h = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    h.current?.focus();
  }, []);
  const pd = draft.firstMoney.amountMinor ? perDayFor(draft, todayIso) : null;
  const split = draft.firstMoney.amountMinor ? moneySplit(draft) : null;
  const spend = split?.ok ? split.spendMinor : null;
  const keep = split?.ok ? draft.firstMoney.keepMinor : null;
  const total = spend !== null && keep !== null ? spend + keep : 0;
  const share = (n: number | null) => (total > 0 && n !== null ? Math.max(0.04, n / total) : 0.5);
  const name = draft.firstName?.trim();

  return (
    <Card tone="peak" as="section" className={styles.done} aria-labelledby="tour-h" role="status" data-testid="onboarding-done" data-burst="onboarding">
      <h2 id="tour-h" ref={h} tabIndex={-1}>
        You&apos;re set{name ? `, ${name}` : ""}.
      </h2>
      {pd ? (
        <p className={styles.number} data-testid="tour-per-day" data-per-day-minor={pd.perDayMinor}>
          About <b>{perDayText(pd.perDayMinor)}</b> a day until {pd.untilLabel}.
        </p>
      ) : (
        <p className={styles.number}>Add what you have from Today, and Salin turns it into a number for the day.</p>
      )}

      <section className={styles.tile} style={{ "--n": 0 } as React.CSSProperties} aria-labelledby="tour-buckets-h" data-testid="tour-buckets">
        <h3 id="tour-buckets-h">How your money is kept</h3>
        <p>Salin sorts every peso into buckets. Each bucket has one job, so you always know what&apos;s free.</p>
        <ul className={styles.buckets}>
          <li style={{ "--c": "var(--b-living)", "--w": share(spend) } as React.CSSProperties}>
            <span>
              <b>Spending</b>
              <small>Day to day. Your daily number comes from here.</small>
            </span>
            {spend !== null ? <em>{formatPeso(spend)}</em> : null}
            <i aria-hidden="true" />
          </li>
          <li style={{ "--c": "var(--b-emergency)", "--w": share(keep) } as React.CSSProperties}>
            <span>
              <b>Kept aside</b>
              <small>Set apart for emergencies. Never counted as spending.</small>
            </span>
            {keep !== null ? <em>{formatPeso(keep)}</em> : null}
            <i aria-hidden="true" />
          </li>
        </ul>
        <p className={styles.hint}>Full view shows all your buckets, and you can add your own later.</p>
      </section>

      <ViewsTile index={1} />
      <AppTile index={2} name={name} />

      <div className={styles.row}>
        <ButtonLink variant="primary" href="/today?tour=1">
          Open Today <ArrowRightIcon />
        </ButtonLink>
      </div>
    </Card>
  );
}
