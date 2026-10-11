import type { ReactNode } from "react";
import { Card } from "@/components/card/Card";
import styles from "./empty-state.module.css";

export type EmptyStateProps = {
  title: string;
  /** Say how to add the first real item. Never show sample numbers here. */
  children: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <Card className={styles.empty}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.body}>{children}</p>
      {action ? <div className={styles.action}>{action}</div> : null}
    </Card>
  );
}
