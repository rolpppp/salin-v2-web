"use client";

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { greeting } from "@/lib/time";
import styles from "./today.module.css";

const subscribeNever = () => () => {};
const dateFmt = new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "short", day: "numeric" });

/** "hour|date" in the visitor's own clock. Strings compare by value so the snapshot is stable. */
const clientSnapshot = () => {
  const now = new Date();
  return `${now.getHours()}|${dateFmt.format(now)}`;
};
const serverSnapshot = () => "";

/**
 * The greeting follows the visitor's local time. The server (and hydration) renders a neutral "Hello",
 * then the browser swaps in the time of day, so there is no hydration mismatch.
 * `daysText` ("10 days until payday") comes from the server; null hides it (no payday date set, D-15).
 * `children` are the soft actions on the right (+ Log spending, + Add income).
 */
export function Greeting({ firstName, daysText = null, children }: { firstName: string | null; daysText?: string | null; children?: ReactNode }) {
  const snap = useSyncExternalStore(subscribeNever, clientSnapshot, serverSnapshot);
  const sep = snap.indexOf("|");
  const hour = sep === -1 ? null : Number(snap.slice(0, sep));
  const date = sep === -1 ? "" : snap.slice(sep + 1);
  const text = hour === null ? (firstName ? `Hello, ${firstName}` : "Hello") : greeting(hour, firstName);
  return (
    <div className={styles.hello}>
      <div>
        <h1 className={styles.h1}>{text}</h1>
        <p className={styles.date} data-testid="today-date">
          {[date, daysText].filter(Boolean).join(" · ")}
        </p>
      </div>
      {children ? <div className={styles.acts}>{children}</div> : null}
    </div>
  );
}
