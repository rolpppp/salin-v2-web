import type { ReactNode } from "react";
import styles from "./page-header.module.css";

export function PageHeader({ title, lede, actions }: { title: string; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={styles.head}>
      <div>
        <h1 className={styles.h1}>{title}</h1>
        {lede ? <p className={styles.lede}>{lede}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
