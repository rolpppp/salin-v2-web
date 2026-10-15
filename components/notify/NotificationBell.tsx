"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/drawer/Drawer";
import { BellIcon, SproutIcon } from "@/components/icons";
import { useAnnounce } from "@/components/live-region/LiveRegion";
import { checkNotice, markNoticesRead, setNotifyPrefs } from "@/lib/actions/notify";
import { cn } from "@/lib/cn";
import type { NotifyBundle } from "@/lib/data/notify";
import { inbox, unreadCount, upcoming, type NoticeKind, type NotifyPrefs } from "@/lib/notify/rules";
import { askPermission, browserSupport, ensureWorker, showOnce, type BrowserSupport } from "./browser";
import styles from "./notify.module.css";

const KIND_HUE: Record<NoticeKind, string> = {
  daily_log: "var(--accent)",
  streak_risk: "var(--sun)",
  money_day: "var(--b-emergency)",
  weekly_review: "var(--b-invest)",
  milestone: "var(--sun)",
};

const fmtTime = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  return m === 0 ? "Today" : `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? "AM" : "PM"}`;
};

const TOGGLES: ReadonlyArray<{ k: keyof NotifyPrefs; label: string; help: string }> = [
  { k: "dailyLog", label: "Daily log nudge", help: "Only if nothing is logged yet that day." },
  { k: "streakRisk", label: "Keep my streak", help: "Late evening, when a 3+ day streak hasn't been counted yet." },
  { k: "moneyDay", label: "Money day", help: "On your payday or allowance day." },
  { k: "weeklyReview", label: "Weekly review", help: "On your review day." },
];

/**
 * The bell in the header: today's notices (streak, money day, review), and the reminder switches. Opening it marks what's
 * there as read. With browser notifications on, it also schedules today's remaining reminders while a Salin tab is open,
 * re-checking each one with the server right before it shows (so a reminder never nags about something already done).
 */
export function NotificationBell({ bundle }: { bundle: NotifyBundle }) {
  const announce = useAnnounce();
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<Set<string>>(() => new Set(bundle.notices.filter((n) => n.read).map((n) => n.key)));
  const [prefs, setPrefs] = useState<NotifyPrefs>(bundle.prefs);
  const [error, setError] = useState<string | null>(null);
  // Only read inside the drawer, which renders after a click (never on the server), so this can't mismatch on hydration.
  const [support, setSupport] = useState<BrowserSupport>(() => (typeof window === "undefined" ? "default" : browserSupport()));
  /** What was new when the drawer opened, so it stays highlighted while it's open. */
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());

  // Server data wins when it changes (another tab saved, a new day).
  const [seen, setSeen] = useState(bundle);
  if (seen !== bundle) {
    setSeen(bundle);
    setPrefs(bundle.prefs);
    setRead(new Set(bundle.notices.filter((n) => n.read).map((n) => n.key)));
  }

  const notices = useMemo(() => bundle.notices.map((n) => ({ ...n, read: n.read || read.has(n.key) })), [bundle.notices, read]);
  const list = inbox(notices);
  const unread = unreadCount(notices);

  // ---- browser reminders for the rest of today (tab open only)
  const later = useMemo(() => upcoming(bundle.notices), [bundle.notices]);
  useEffect(() => {
    if (!prefs.browser || browserSupport() !== "ok") return;
    void ensureWorker();
    const timers: number[] = [];
    const elapsed = Date.now() - bundle.nowMs;
    for (const n of later) {
      const delay = (n.atMinutes - bundle.nowMinutes) * 60_000 - elapsed;
      if (delay <= 0 || delay > 2_000_000_000) continue;
      timers.push(
        window.setTimeout(async () => {
          try {
            const r = await checkNotice(n.key);
            if (r.show) await showOnce(r.show);
          } catch {
            // offline: skip this one
          }
        }, delay),
      );
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [prefs.browser, later, bundle.nowMinutes, bundle.nowMs]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    const keys = list.filter((n) => !n.read).map((n) => n.key);
    setNewKeys(new Set(keys));
    if (keys.length === 0) return;
    setRead((r) => new Set([...r, ...keys]));
    void markNoticesRead(keys);
  }

  async function save(patch: Partial<NotifyPrefs>, okMsg: string) {
    const before = prefs;
    setPrefs({ ...prefs, ...patch });
    setError(null);
    const r = await setNotifyPrefs(patch).catch(() => ({ ok: false as const, error: "Couldn't save. Check your connection and try again." }));
    if (!r.ok) {
      setPrefs(before);
      setError(r.error);
      announce(r.error);
      return;
    }
    announce(okMsg);
  }

  async function toggleBrowser(on: boolean) {
    if (!on) return save({ browser: false }, "Browser notifications off.");
    const got = await askPermission();
    setSupport(got);
    if (got === "ok") return save({ browser: true }, "Browser notifications on.");
    const msg = got === "unsupported" ? "This browser can't show notifications." : got === "denied" ? "Notifications are blocked for Salin in this browser's site settings." : "Allow notifications when your browser asks, then try again.";
    setError(msg);
    announce(msg);
  }

  const label = unread > 0 ? `Notifications, ${unread} new` : "Notifications";

  return (
    <>
      <button type="button" className={styles.bell} aria-label={label} aria-haspopup="dialog" onClick={() => onOpenChange(true)} data-testid="bell" data-tour="bell">
        <BellIcon width={18} height={18} />
        {unread > 0 ? (
          <span className={styles.badge} aria-hidden="true" data-testid="bell-count">
            {unread}
          </span>
        ) : null}
      </button>
      <Drawer open={open} onOpenChange={onOpenChange} title="Notifications" description="Today's reminders and your reminder settings.">
        {bundle.streak.days > 0 ? (
          <div className={styles.streak} data-testid="notify-streak">
            <span className={styles.streakIcon} aria-hidden="true">
              <SproutIcon />
            </span>
            <span>
              <b>{bundle.streak.days}-day streak</b>
              <small>{bundle.streak.todayDone ? "Today is counted." : "Log something or mark a no-spend day to count today."}</small>
            </span>
          </div>
        ) : null}

        <section aria-labelledby="notify-today-h" className={styles.sec}>
          <h3 id="notify-today-h" className={styles.h}>
            Today
          </h3>
          {list.length === 0 ? (
            <p className={styles.empty}>You&apos;re all caught up.</p>
          ) : (
            <ul className={styles.list}>
              {list.map((n, i) => (
                <li key={n.key} style={{ "--c": KIND_HUE[n.kind], "--i": i } as React.CSSProperties} data-new={newKeys.has(n.key) ? "" : undefined}>
                  <Link href={n.href} className={styles.item} onClick={() => setOpen(false)}>
                    <i aria-hidden="true" />
                    <span>
                      <b>{n.title}</b>
                      <small>{n.body}</small>
                    </span>
                    <time>{fmtTime(n.atMinutes)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="notify-set-h" className={styles.sec}>
          <h3 id="notify-set-h" className={styles.h}>
            Reminders
          </h3>
          <ul className={styles.toggles}>
            {TOGGLES.map((t) => (
              <li key={t.k}>
                <label className={styles.tog}>
                  <span>
                    <b>{t.label}</b>
                    <small>{t.help}</small>
                  </span>
                  <input type="checkbox" role="switch" checked={prefs[t.k] as boolean} onChange={(e) => void save({ [t.k]: e.target.checked }, `${t.label} ${e.target.checked ? "on" : "off"}.`)} data-testid={`pref-${t.k}`} />
                  <i aria-hidden="true" />
                </label>
                {t.k === "dailyLog" && prefs.dailyLog ? (
                  <label className={styles.time}>
                    <span>Remind me at</span>
                    <input type="time" value={prefs.dailyLogAt} step={900} onChange={(e) => e.target.value && void save({ dailyLogAt: e.target.value.slice(0, 5) }, `Daily nudge at ${e.target.value.slice(0, 5)}.`)} data-testid="pref-dailyLogAt" />
                  </label>
                ) : null}
              </li>
            ))}
            <li>
              <label className={styles.tog}>
                <span>
                  <b>Show in this browser</b>
                  <small>{support === "unsupported" ? "This browser can't show notifications." : "Pops up while Salin is open in a tab. The phone app reminds you even when it's closed."}</small>
                </span>
                <input type="checkbox" role="switch" checked={prefs.browser && support === "ok"} disabled={support === "unsupported"} onChange={(e) => void toggleBrowser(e.target.checked)} data-testid="pref-browser" />
                <i aria-hidden="true" />
              </label>
            </li>
          </ul>
          <p className={cn(styles.err)} role="alert">
            {error}
          </p>
        </section>
      </Drawer>
    </>
  );
}
