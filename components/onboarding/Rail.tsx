import { CheckIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import styles from "./onboarding.module.css";

export interface RailStep {
  id: string;
  label: string;
}

/**
 * The top rail (SPEC §7.2): "Signed in" pre-ticked, then one pill per step. The current pill shows its label and is
 * highlighted; done pills show a check. Under 1100px only the current label shows; under 720px "Signed in" is hidden.
 * Hidden labels are visually hidden, not removed, so screen readers still hear them.
 */
export function Rail({ steps, currentIndex, showSignedIn }: { steps: readonly RailStep[]; currentIndex: number; showSignedIn: boolean }) {
  return (
    <div className={styles.top}>
      <ol className={styles.rail} aria-label="Setup steps">
        {showSignedIn ? (
          <li className={cn(styles.pill, styles.signedIn, styles.done)}>
            <span className={styles.dot} aria-hidden="true">
              <CheckIcon />
            </span>
            <span className={styles.label}>Signed in</span>
          </li>
        ) : null}
        {steps.map((s, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <li key={s.id} className={cn(styles.pill, done && styles.done, current && styles.on)} aria-current={current ? "step" : undefined}>
              <span className={styles.dot} aria-hidden="true">
                {done ? <CheckIcon /> : i + 1}
              </span>
              <span className={styles.label}>{s.label}</span>
              {done ? <span className="sr">, done</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
