"use client";

import { useSyncExternalStore } from "react";
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
 */
export function Greeting({ firstName }: { firstName: string | null }) {
  const snap = useSyncExternalStore(subscribeNever, clientSnapshot, serverSnapshot);
  const sep = snap.indexOf("|");
  const hour = sep === -1 ? null : Number(snap.slice(0, sep));
  const date = sep === -1 ? "" : snap.slice(sep + 1);
  const text = hour === null ? (firstName ? `Hello, ${firstName}` : "Hello") : greeting(hour, firstName);
  return (
    <div className={styles.hello}>
      <h1 className={styles.h1}>{text}</h1>
      <p className={styles.date}>{date}</p>
    </div>
  );
}
