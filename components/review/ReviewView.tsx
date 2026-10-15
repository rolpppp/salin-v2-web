"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/button/Button";
import { Card, CardTitle } from "@/components/card/Card";
import { CheckIcon, SunIcon } from "@/components/icons";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { PageHeader } from "@/components/page-header/PageHeader";
import { ProgressBar } from "@/components/progress-bar/ProgressBar";
import { closeWeekAction, coverFromBufferAction, nudgeFunToLivingAction, trackReviewOpenedAction } from "@/lib/actions/review";
import {
  closedHeading,
  closedSummary,
  coverMessage,
  emergencyProgress,
  formatWeekRange,
  nudgeMessage,
  pickObservation,
  reviewChecks,
  reviewSteps,
  spendSummary,
  type ReviewData,
} from "@/lib/data/review-model";
import { hueVar } from "@/lib/data/hues";
import { formatPeso } from "@/lib/money";
import styles from "./review.module.css";
import { WeekSlipCard } from "./WeekSlipCard";

const OBS_HEADING = "review-obs-h";
const CLOSED_HEADING = "review-closed-h";
const hueColor = (hue: string | null) => hueVar(hue, "var(--accent)");

type Busy = "cover" | "nudge" | "close" | null;

/** Review (SPEC §3): look back, fix one thing, close the week. All numbers arrive from SQL; this only lays them out. */
export function ReviewView({ data }: { data: ReviewData }) {
  const announce = useAnnounce();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<{ where: "obs" | "close"; message: string } | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const opened = useRef(false);
  // The burst is for the moment the week closes in this view, never for a later visit to an already-closed week.
  const [celebrate, setCelebrate] = useState(false);

  const spend = useMemo(() => spendSummary(data.buckets), [data.buckets]);
  const obs = useMemo(() => pickObservation(data), [data]);
  const progress = useMemo(() => emergencyProgress(data), [data]);
  const checks = useMemo(() => reviewChecks(data), [data]);
  const steps = reviewSteps(obs, data.closed !== null);
  const closed = data.closed ? closedSummary({ weekStart: data.weekStart, reviewDay: data.reviewDay, closed: data.closed }) : null;

  // review_opened: once per visit, never on a refresh after an action.
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void trackReviewOpenedAction(data.weekStart);
  }, [data.weekStart]);

  // After an action re-renders the page, put focus somewhere sensible instead of letting it fall to <body>.
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    const el = document.getElementById(id);
    if (el) {
      el.focus();
      pendingFocus.current = null;
    }
  });

  const overspentBucket = obs.bucketId ? data.buckets.find((b) => b.id === obs.bucketId) : undefined;

  async function cover() {
    if (!obs.bucketId || busy) return;
    setBusy("cover");
    setError(null);
    const r = await coverFromBufferAction({ toBucketId: obs.bucketId });
    setBusy(null);
    if (!r.ok) return setError({ where: "obs", message: r.error });
    pendingFocus.current = OBS_HEADING;
    announce(coverMessage(r, overspentBucket?.name ?? "That bucket"));
  }

  async function nudge() {
    if (busy) return;
    setBusy("nudge");
    setError(null);
    const r = await nudgeFunToLivingAction();
    setBusy(null);
    if (!r.ok) return setError({ where: "obs", message: r.error });
    pendingFocus.current = OBS_HEADING;
    announce(nudgeMessage(r.plans, r.fromName, r.toName, 100));
  }

  async function close() {
    if (busy) return;
    setBusy("close");
    setError(null);
    const r = await closeWeekAction({ weekStart: data.weekStart, observation: obs.text.slice(0, 400) });
    setBusy(null);
    if (!r.ok) return setError({ where: "close", message: r.error });
    pendingFocus.current = CLOSED_HEADING;
    if (!r.alreadyClosed) setCelebrate(true);
    announce(r.alreadyClosed ? "This week was already closed." : `${closedHeading(data.weekStart)}${r.openItems ? ` ${r.openItems} open ${r.openItems === 1 ? "item carries" : "items carry"} into next week.` : ""}`);
  }

  const signed = (n: number) => (n > 0 ? `+${formatPeso(n)}` : formatPeso(n));

  return (
    <>
      <PageHeader
        title={`Week of ${formatWeekRange(data.weekStart, data.weekEnd)}`}
        lede="Five minutes: look back, fix one thing, then close the week."
      />
      <ol className={styles.stepper} aria-label="Review progress" data-tour="review-steps">
        {steps.map((s, i) => (
          <li key={s.label} className={s.done ? styles.on : undefined}>
            <i aria-hidden="true">{s.done ? <CheckIcon /> : i + 1}</i>
            {s.label}
            <span className="sr">{s.done ? " (done)" : " (not yet)"}</span>
          </li>
        ))}
      </ol>
      <div className={styles.review} data-week-closed={data.closed ? "true" : "false"}>
        <div className={styles.slipCol} data-tour="review-slip">
          <WeekSlipCard data={data} />
        </div>

        <div className={styles.cards}>
          <Card aria-labelledby="where-h">
            <CardTitle id="where-h">Where your spending went</CardTitle>
            {spend.empty ? (
              <p className={styles.muted} data-testid="spend-empty">
                {spend.text}
              </p>
            ) : (
              <>
                <ul className={styles.bars} data-testid="spend-bars">
                  {spend.bars.map((b) => (
                    <li key={b.id} className={styles.bar} style={{ "--c": hueColor(b.hue) } as CSSProperties}>
                      <span className={styles.barName}>
                        <i aria-hidden="true" />
                        {b.name}
                      </span>
                      <ProgressBar label={`${b.name} spent this week`} value={Math.round(b.spentRatio * 1000)} max={1000} valueText={formatPeso(b.spentMinor)} className={styles.tone} />
                      <span className={styles.barValue}>{formatPeso(b.spentMinor)}</span>
                    </li>
                  ))}
                </ul>
                <p className={styles.muted} data-testid="spend-note">
                  {spend.text}
                </p>
              </>
            )}
          </Card>

          <Card aria-labelledby={OBS_HEADING} data-observation={obs.kind}>
            <CardTitle id={OBS_HEADING} tabIndex={-1} className={styles.focusable}>
              One thing to look at
            </CardTitle>
            <p className={styles.honest} data-testid="observation">
              {obs.text}
            </p>
            {obs.canCover || obs.canNudge ? (
              <div className={styles.row}>
                {obs.canCover ? (
                  <Button variant="soft" onClick={cover} loading={busy === "cover"} loadingLabel="Covering" disabled={busy !== null && busy !== "cover"}>
                    Cover from Buffer
                  </Button>
                ) : null}
                {obs.canNudge ? (
                  <Button variant="soft" onClick={nudge} loading={busy === "nudge"} loadingLabel="Moving 1%" disabled={busy !== null && busy !== "nudge"}>
                    Move 1% from Fun to Living
                  </Button>
                ) : null}
              </div>
            ) : null}
            {obs.canNudge ? <p className={styles.muted}>Moving 1% changes every plan that gives Fun money at least 1%, from your next payday. Paydays you already confirmed stay as they were.</p> : null}
            {error?.where === "obs" ? (
              <p className={styles.error} role="alert">
                {error.message}
              </p>
            ) : null}
          </Card>

          <Card aria-labelledby="goal-h">
            <CardTitle id="goal-h">Progress this week</CardTitle>
            <div className={styles.leader}>
              <span>Emergency fund</span>
              <span className={styles.dots} aria-hidden="true" />
              <b className={progress.changeMinor > 0 ? styles.good : undefined} data-testid="emergency-change">
                {signed(progress.changeMinor)}
              </b>
            </div>
            {progress.targetMinor !== null && progress.barLabel ? (
              <ProgressBar label={progress.barLabel} value={progress.savedMinor} max={progress.targetMinor} valueText={`${progress.percent}%`} tone="good" size="goal" />
            ) : null}
            <p className={styles.muted} data-testid="emergency-note">
              {progress.text}
            </p>
          </Card>

          {closed ? (
            <Card tone="peak" aria-labelledby={CLOSED_HEADING} className={styles.closedCard} data-burst={celebrate ? "week" : undefined} data-testid="week-closed">
              <CardTitle id={CLOSED_HEADING} tabIndex={-1} className={styles.focusable}>
                {closed.heading}
              </CardTitle>
              <ul>
                {closed.checks.map((c) => (
                  <li key={c.id} data-check={c.id} data-on={c.on}>
                    <span className={`${styles.ck} ${c.on ? "" : styles.ckOpen}`} aria-hidden="true">
                      {c.on ? <CheckIcon /> : null}
                    </span>
                    <span>
                      {c.label}
                      {c.carries ? <span className={styles.sub}> (carries into next week)</span> : <span className="sr"> (done)</span>}
                    </span>
                  </li>
                ))}
                <li>
                  <span className={`${styles.ck} ${styles.sun}`} aria-hidden="true">
                    <SunIcon />
                  </span>
                  <span data-testid="start-next">{closed.startNext}</span>
                </li>
              </ul>
              <p className={styles.muted} data-testid="next-review">
                {closed.nextReview}
              </p>
            </Card>
          ) : (
            <Card aria-labelledby="close-h">
              <CardTitle id="close-h">Close the week</CardTitle>
              <ul className={styles.checks} data-testid="close-checks">
                {checks.map((c) => (
                  <li key={c.id} data-check={c.id} data-on={c.on}>
                    <span className={`${styles.ck} ${c.on ? styles.ckOn : ""}`} aria-hidden="true">
                      {c.on ? <CheckIcon /> : null}
                    </span>
                    <span>
                      {c.label}
                      <span className="sr">{c.on ? " (done)" : " (not done)"}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className={styles.row}>
                <Button variant="primary" onClick={close} loading={busy === "close"} loadingLabel="Closing the week" disabled={busy !== null && busy !== "close"}>
                  Close the week
                </Button>
              </div>
              <p className={styles.muted}>You can close with open items. They carry into next week.</p>
              {error?.where === "close" ? (
                <p className={styles.error} role="alert">
                  {error.message}
                </p>
              ) : null}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
