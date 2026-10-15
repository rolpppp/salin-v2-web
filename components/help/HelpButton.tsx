"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Drawer } from "@/components/drawer/Drawer";
import { HelpIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { HELP_TOPICS, helpTopic, topicForPath } from "@/lib/help/topics";
import { TOUR_EVENT } from "@/lib/tour/steps";
import styles from "./help.module.css";

/**
 * The (?) button in the header. Opens "How Salin works": short topics in plain words, with the one that matches the
 * current page already open. One topic is open at a time. Nothing here changes any data.
 */
export function HelpButton({ viewMode }: { viewMode?: "simple" | "full" }) {
  const pathname = usePathname();
  const here = topicForPath(pathname, viewMode);
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(here);

  function onOpenChange(next: boolean) {
    // Each time it opens, start on the topic that fits this page.
    if (next) setOpenId(here);
    setOpen(next);
  }

  // Put the topic for this page first, so "what am I looking at?" is the first thing they see.
  const topics = [helpTopic(here), ...HELP_TOPICS.filter((t) => t.id !== here)].filter((t): t is NonNullable<typeof t> => t !== undefined);

  return (
    <>
      <button type="button" className={styles.btn} aria-label="Help: how Salin works" aria-haspopup="dialog" onClick={() => onOpenChange(true)} data-testid="help-button" data-tour="help">
        <HelpIcon width={18} height={18} />
      </button>
      <Drawer open={open} onOpenChange={onOpenChange} title="How Salin works" description="Short guides to your buckets, plan, accounts, categories and goals.">
        <p className={styles.intro}>Pick a topic. Each one is short, and the first is about the page you&apos;re on.</p>
        {viewMode ? (
          <button
            type="button"
            className={styles.tourBtn}
            onClick={() => {
              setOpen(false);
              // The tour lives in the app layout; it starts on Today once the drawer has slid away.
              setTimeout(() => window.dispatchEvent(new Event(TOUR_EVENT)), 320);
            }}
            data-testid="take-tour"
          >
            Take the tour
          </button>
        ) : null}
        <ul className={styles.list}>
          {topics.map((t, i) => {
            const isOpen = openId === t.id;
            return (
              <li key={t.id} className={cn(styles.item, i === 0 && styles.here)} style={{ "--i": i } as React.CSSProperties} data-open={isOpen ? "" : undefined}>
                <h3 className={styles.h}>
                  <button type="button" className={styles.trigger} aria-expanded={isOpen} aria-controls={`help-${t.id}`} id={`help-t-${t.id}`} onClick={() => setOpenId(isOpen ? null : t.id)}>
                    <span>
                      {t.title}
                      {i === 0 ? <em className={styles.badge}>This page</em> : null}
                    </span>
                    <i className={styles.chev} aria-hidden="true" />
                  </button>
                </h3>
                <div id={`help-${t.id}`} role="region" aria-labelledby={`help-t-${t.id}`} className={styles.panel} hidden={false} inert={!isOpen}>
                  <div className={styles.inner}>
                    <p className={styles.summary}>{t.summary}</p>
                    <ol className={styles.how}>
                      {t.how.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                    <p className={styles.tip}>
                      <b>Get more from it.</b> {t.tip}
                    </p>
                    {t.go && t.go.href !== pathname ? (
                      <Link href={t.go.href} className={styles.go} onClick={() => setOpen(false)}>
                        {t.go.label}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Drawer>
    </>
  );
}
