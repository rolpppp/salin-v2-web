import type { ReactNode } from "react";
import { Button, ButtonLink } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { ArrowRightIcon, CheckIcon } from "@/components/icons";
import { ProgressBar } from "@/components/progress-bar/ProgressBar";
import { cn } from "@/lib/cn";
import type { NextView, WeekView } from "@/lib/data/today-model";
import { formatPesoWhole } from "@/lib/money";
import styles from "./today.module.css";

export type NextStepCardProps = {
  next: NextView;
  week: WeekView;
  /** Cover the Living bucket from Buffer. */
  onCover: (toBucketId: string) => void;
  coverBusy: boolean;
  /** A failed cover's message, shown at the button (SPEC §6). */
  coverError: string | null;
  /** "See what happened": opens the Living drawer. */
  onSeeWhatHappened: () => void;
  /** The "Log your first spending" launcher (ticket 19); empty until it exists. */
  logSlot: ReactNode;
};

/** Exactly one primary action (SPEC §1), then the week checklist ("Getting started" in the first week, BR §12.6). */
export function NextStepCard({ next, week, onCover, coverBusy, coverError, onSeeWhatHappened, logSlot }: NextStepCardProps) {
  const done = next.kind === "done";
  return (
    <Card tone={done ? "peak" : "next"} id="next-card" tabIndex={-1} aria-labelledby="next-h" className={cn(styles.next, done && styles.nextDone)} data-testid="next-card" data-next={next.kind}>
      <p className={styles.kicker} id="next-h">
        <i aria-hidden="true" />
        Next step
      </p>
      <h2 className={styles.nextH} data-testid="next-heading">
        {next.heading}
      </h2>
      <p className={styles.nextP}>{next.body}</p>

      {next.kind === "assign" ? (
        <ul className={styles.chips} aria-label="Waiting income" data-testid="next-chips">
          {next.chips.map((c) => (
            <li key={c.id} className={c.needsJob ? styles.needs : undefined}>
              <i aria-hidden="true" />
              {c.name}
              <b>{formatPesoWhole(c.amountMinor)}</b>
              {c.needsJob ? <small>Needs a job</small> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {next.kind === "living" ? (
        <div className={styles.nextRow}>
          {next.cover ? (
            <Button variant="primary" loading={coverBusy} loadingLabel="Covering" onClick={() => next.cover && onCover(next.cover.toBucketId)} data-testid="next-primary">
              Cover from {next.cover.fromName}
            </Button>
          ) : null}
          <Button variant={next.cover ? "quiet" : "primary"} onClick={onSeeWhatHappened} data-testid={next.cover ? undefined : "next-primary"}>
            See what happened
          </Button>
        </div>
      ) : next.cta ? (
        <div className={styles.nextRow}>
          <ButtonLink variant="primary" href={next.cta.href} data-testid="next-primary">
            {next.cta.label}
            {next.kind === "pay" ? null : <ArrowRightIcon width={16} height={16} aria-hidden="true" />}
          </ButtonLink>
          {next.hint ? <span className={styles.hint}>{next.hint}</span> : null}
        </div>
      ) : next.kind === "log" ? (
        <div className={styles.nextRow}>{logSlot}</div>
      ) : null}
      {coverError ? (
        <p className={styles.inlineError} role="alert">
          {coverError}
        </p>
      ) : null}

      <div className={styles.loop} data-testid="week-loop">
        <div className={styles.loopH}>
          <span>{week.title}</span>
          <b data-testid="week-count">
            {week.doneCount} of {week.total} done
          </b>
        </div>
        <ProgressBar label={week.title} value={week.doneCount} max={week.total} valueText={`${week.doneCount} of ${week.total} done`} />
        <ul className={styles.loopSteps}>
          {week.steps.map((s) => (
            <li key={s.id} className={s.done ? styles.on : undefined} data-done={s.done}>
              <span className={styles.ck} aria-hidden="true">
                <CheckIcon />
              </span>
              {s.label}
              {s.done ? <span className="sr"> (done)</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
