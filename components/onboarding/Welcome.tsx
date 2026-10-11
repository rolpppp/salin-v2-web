import { useEffect, useRef } from "react";
import { ArrowRightIcon, CheckIcon } from "@/components/icons";
import { bpShare, formatPeso } from "@/lib/money";
import styles from "./onboarding.module.css";

const EXAMPLE_PAY_MINOR = 2_500_000;
// The same example split the prototype shows (BR §10 O1). Decorative only: it never reads the user's data.
const EXAMPLE: ReadonlyArray<{ key: string; label: string; pct: number }> = [
  { key: "living", label: "Living", pct: 38 },
  { key: "rent", label: "Bills", pct: 12 },
  { key: "fun", label: "Fun", pct: 10 },
  { key: "emergency", label: "Emergency", pct: 25 },
  { key: "invest", label: "Invest", pct: 5 },
  { key: "sinking", label: "Sinking", pct: 10 },
];

/** SPEC §7.1. Presentational: the shell decides what choosing a path does. */
export function Welcome({ onChoose }: { onChoose: (path: "web" | "app") => void }) {
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    h1.current?.focus();
  }, []);
  return (
    <div className={styles.hero}>
      <div>
        <p className={styles.heroKicker}>Welcome to Salin</p>
        <h1 ref={h1} tabIndex={-1}>
          Let&apos;s give every peso a job.
        </h1>
        <p className={styles.lede}>
          In about three minutes you&apos;ll have a plan for your pay, built from your own numbers. Each payday after that, Salin shows you where every peso goes. It never moves money for you: it tells you, you
          decide.
        </p>
        <ul className={styles.gets}>
          {["A split for every payday, in buckets you name", "A short list of what to send where", "One number each day: what's safe to spend"].map((t) => (
            <li key={t}>
              <span className={styles.ck} aria-hidden="true">
                <CheckIcon />
              </span>
              {t}
            </li>
          ))}
        </ul>
        <h2 className={styles.q}>Have you used the Salin app on your phone?</h2>
        <div className={styles.paths}>
          <button type="button" className={styles.path} onClick={() => onChoose("web")}>
            <span>
              <b>I&apos;m new to Salin</b>
              <small>Start here on the web. You can log spending here too.</small>
            </span>
            <ArrowRightIcon />
          </button>
          <button type="button" className={styles.path} onClick={() => onChoose("app")}>
            <span>
              <b>I use the Salin app</b>
              <small>Bring in your accounts, categories and income. Same account, kept in sync.</small>
            </span>
            <ArrowRightIcon />
          </button>
        </div>
      </div>
      <div aria-hidden="true">
        <div className={styles.example}>
          <div className={styles.exampleHead}>
            <span>Example payday</span>
            <b>{formatPeso(EXAMPLE_PAY_MINOR).replace(".00", "")}</b>
          </div>
          <div className={styles.shelf}>
            {EXAMPLE.map((e, i) => (
              <div key={e.key} className={styles.col} style={{ "--c": `var(--b-${e.key})`, "--h": e.pct / 38, "--d": `${i * 70}ms` } as React.CSSProperties}>
                <span className={styles.colV}>{formatPeso(bpShare(EXAMPLE_PAY_MINOR, e.pct * 100)).replace(".00", "")}</span>
                <i />
                <span className={styles.colN}>{e.label}</span>
              </div>
            ))}
          </div>
          <p className={styles.exampleFoot}>Every peso has a job before you spend it.</p>
        </div>
      </div>
    </div>
  );
}
