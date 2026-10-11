import Link from "next/link";
import { Card } from "@/components/card/Card";
import { Chip } from "@/components/chip/Chip";
import { ProgressBar } from "@/components/progress-bar/ProgressBar";
import { cn } from "@/lib/cn";
import type { GoalCardView, GoalsView } from "@/lib/data/today-model";
import { formatPeso } from "@/lib/money";
import styles from "./today.module.css";

const TICKS = [25, 50, 75] as const;

function joinNames(names: readonly string[]): string {
  return names.length > 2 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join(" and ");
}

/** Up to three goals, Emergency first (SPEC §1, BR §7). With none: one inviting line. */
export function Goals({ goals }: { goals: GoalsView }) {
  if (goals.cards.length === 0) {
    return (
      <p className={styles.moreGoals} data-testid="goals-empty">
        Saving toward something? <Link href="/plans/goals">Add a goal in Plans</Link>.
      </p>
    );
  }
  const n = goals.cards.length;
  return (
    <>
      <section className={cn(styles.goals, n === 1 && styles.n1, n === 2 && styles.n2)} aria-label="Goals" data-testid="goals">
        {goals.cards.map((g) => (
          <GoalCard key={g.id} g={g} />
        ))}
      </section>
      <p className={styles.moreGoals}>
        {goals.moreNames.length ? `${joinNames(goals.moreNames)} ${goals.moreNames.length > 1 ? "goals are" : "goal is"} in ` : "Add or change goals in "}
        <Link href="/plans/goals">Plans</Link>.
      </p>
    </>
  );
}

function GoalCard({ g }: { g: GoalCardView }) {
  return (
    <Card as="article" className={cn(styles.goal, g.main && styles.goalMain)} data-testid="goal-card" data-goal-id={g.id} data-progress-bp={g.progressBp} data-prev-progress-bp={g.prevProgressBp}>
      <div className={styles.goalTop}>
        <h3 className={styles.goalName}>{g.name}</h3>
        <span className={styles.pct} data-testid="goal-percent">
          {g.percent}%
        </span>
      </div>
      <ProgressBar label={g.name} value={g.progressBp} max={10_000} valueText={`${g.percent}% saved`} size="goal" tone={g.main ? "good" : "accent"} />
      <div className={styles.ticks} aria-hidden="true">
        {TICKS.map((m) => (
          <span key={m} className={cn(styles.tick, g.hitTicks.includes(m) && styles.tickHit)} style={{ left: `${m}%` }} data-tick={m}>
            {m}%
          </span>
        ))}
      </div>
      <p className={styles.goalSub} data-testid="goal-sub">
        {g.reached ? null : (
          <>
            <b>{formatPeso(g.toGoMinor)}</b> to go.{g.tail ? " " : ""}
          </>
        )}
        {g.tail}
      </p>
      {g.passedToday ? (
        <Chip tone="milestone" dot={false} data-testid="passed-chip" style={{ justifySelf: "start" }}>
          Passed {g.passedToday}% today
        </Chip>
      ) : null}
    </Card>
  );
}
