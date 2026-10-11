import type { ReactNode } from "react";
import { CheckIcon } from "@/components/icons";
import styles from "./money-in.module.css";

/** The numbered heading of a Money in step. `done` swaps the number for a check. */
export function StepHead({ n, done, id, title, sub, headingTabIndex }: { n: number | string; done?: boolean; id: string; title: string; sub?: ReactNode; headingTabIndex?: -1 }) {
  return (
    <div className={styles.stepHead}>
      <span className={styles.stepN} aria-hidden="true">
        {done ? <CheckIcon /> : n}
      </span>
      <h2 id={id} tabIndex={headingTabIndex}>
        {title}
      </h2>
      {sub ? <span className={styles.sub}>{sub}</span> : null}
    </div>
  );
}
