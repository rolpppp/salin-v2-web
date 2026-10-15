import type { CSSProperties } from "react";
import { brandFor } from "@/lib/brands";
import styles from "./bank-mark.module.css";

/** A small app-icon tile for an account. Decorative: the account's name is always written next to it. */
export function BankMark({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const b = brandFor(name);
  const text = b?.mono ?? (name.trim().slice(0, 1).toUpperCase() || "?");
  const style = (b ? { "--from": b.from, "--to": b.to, "--ink": b.ink } : {}) as CSSProperties;
  return (
    <span className={[styles.mark, styles[size], b ? styles.brand : styles.plain, className].filter(Boolean).join(" ")} style={style} data-len={text.length} aria-hidden="true">
      {b?.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG; next/image adds nothing here
        <img src={b.logo} alt="" />
      ) : (
        <span className={styles.glyph}>{text}</span>
      )}
    </span>
  );
}
