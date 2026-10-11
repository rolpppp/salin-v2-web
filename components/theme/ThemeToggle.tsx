"use client";

import { MoonIcon, SunIcon } from "@/components/icons";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { applyTheme, effectiveTheme } from "./theme";
import styles from "./theme-toggle.module.css";

/** Follows the system until clicked; then persists light/dark. Icons switch via CSS so SSR matches. */
export function ThemeToggle() {
  const announce = useAnnounce();
  return (
    <button
      type="button"
      className={styles.btn}
      aria-label="Switch theme"
      onClick={() => {
        const next = effectiveTheme() === "dark" ? "light" : "dark";
        applyTheme(next);
        announce(next === "dark" ? "Dark theme on" : "Light theme on");
      }}
    >
      <MoonIcon className={styles.moon} width={18} height={18} />
      <SunIcon className={styles.sun} width={18} height={18} />
    </button>
  );
}
