import type { ReactNode } from "react";
import styles from "./shell.module.css";

export function Page({ children }: { children: ReactNode }) {
  return (
    <main id="main" className={styles.page} tabIndex={-1}>
      {children}
    </main>
  );
}
