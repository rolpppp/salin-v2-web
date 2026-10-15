import { useEffect, useRef } from "react";
import { ArrowRightIcon } from "@/components/icons";
import type { Pattern } from "@/lib/onboarding/draft";
import { PATTERN_OPTIONS } from "@/lib/onboarding/simple-path";
import { AppNote } from "./AppNote";
import styles from "./onboarding.module.css";

// Decorative only: it never reads the user's data. Heights are shares of the tallest bar.
const DAYS: ReadonlyArray<{ d: string; h: number; today?: boolean }> = [
  { d: "M", h: 0.8 },
  { d: "T", h: 0.55 },
  { d: "W", h: 0.7 },
  { d: "T", h: 1, today: true },
  { d: "F", h: 0.62 },
  { d: "S", h: 0.62 },
  { d: "S", h: 0.62 },
];

/** SPEC §7.1, Onboarding v2: one question about the user's money, then the way in for people who already use the phone app. */
export function Welcome({ onChoose, onApp }: { onChoose: (pattern: Pattern) => void; onApp: () => void }) {
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    h1.current?.focus();
  }, []);
  return (
    <div className={styles.hero}>
      <div className={styles.rise} style={{ "--n": 0 } as React.CSSProperties}>
        <p className={styles.heroKicker}>Welcome to Salin</p>
        <h1 ref={h1} tabIndex={-1}>
          Know what&apos;s fine to spend today.
        </h1>
        <p className={styles.lede}>
          Tell Salin what you have and when more is coming. It gives you one number a day, and it never moves your money: it tells you, you decide. Takes about two minutes.
        </p>
        <h2 className={styles.q}>What describes your money?</h2>
        <div className={styles.patterns}>
          {PATTERN_OPTIONS.map((o, i) => (
            <button key={o.value} type="button" className={styles.pattern} style={{ "--n": i + 1 } as React.CSSProperties} onClick={() => onChoose(o.value)}>
              <span>
                <b>{o.title}</b>
                <small>{o.help}</small>
              </span>
              <ArrowRightIcon />
            </button>
          ))}
        </div>
        <button type="button" className={styles.appLink} onClick={onApp}>
          I already use the Salin app
        </button>
        <AppNote />
      </div>
      <div aria-hidden="true" className={styles.rise} style={{ "--n": 2 } as React.CSSProperties}>
        <div className={styles.example}>
          <div className={styles.exampleHead}>
            <span>Left to spend today</span>
            <span className={styles.streakChip}>5 days</span>
          </div>
          <p className={styles.exampleBig}>
            <span className={styles.exampleNum}>₱320</span>
          </p>
          <p className={styles.exampleSub}>₱1,940 left this week · lasts until Sunday</p>
          <div className={styles.week}>
            {DAYS.map((x, i) => (
              <div key={i} className={styles.day} data-today={x.today ? "" : undefined} style={{ "--h": x.h, "--d": `${300 + i * 60}ms` } as React.CSSProperties}>
                <i />
                <span>{x.d}</span>
              </div>
            ))}
          </div>
          <p className={styles.exampleFoot}>One number a day, whatever your money looks like.</p>
        </div>
      </div>
    </div>
  );
}
