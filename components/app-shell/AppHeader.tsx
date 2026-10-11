"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/cn";
import { AvatarMenu } from "./AvatarMenu";
import { Logo } from "./Logo";
import { NAV_ITEMS, isActive } from "./nav";
import styles from "./header.module.css";

const subscribeNever = () => () => {};
const serverLabel = () => "";
const todayLabel = () =>
  new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric" }).format(new Date());

export type TabBadge = { tone: "needs" | "due"; label: string; count?: number };

/**
 * Sticky top bar. `badges` maps a tab href to a status dot (Money in: needs attention,
 * Review: due). Nothing passes badges yet because there is no data.
 */
export function AppHeader({ badges = {}, email }: { badges?: Partial<Record<string, TabBadge>>; email?: string | null }) {
  const pathname = usePathname();
  // Empty on the server and during hydration, today's date afterwards (avoids a mismatch).
  const today = useSyncExternalStore(subscribeNever, todayLabel, serverLabel);

  return (
    <header className={styles.top}>
      <div className={styles.inner}>
        <Logo />
        <nav aria-label="Salin" className={styles.tabs}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item);
            const badge = badges[item.href];
            return (
              <Link key={item.href} href={item.href} className={styles.tab} aria-current={active ? "page" : undefined}>
                {item.label}
                {badge ? (
                  <span className={cn(styles.dot, badge.tone === "due" && styles.dotDue)} role="img" aria-label={badge.label} />
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className={styles.right}>
          <span className={styles.when} suppressHydrationWarning>
            {today}
          </span>
          <ThemeToggle />
          <AvatarMenu email={email} />
        </div>
      </div>
    </header>
  );
}

/** Header for onboarding and sign-in: logo and theme toggle only. */
export function BareHeader() {
  return (
    <header className={styles.top}>
      <div className={styles.inner}>
        <Logo href="/" />
        <div className={styles.right}>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
