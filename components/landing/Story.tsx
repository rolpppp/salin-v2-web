"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CheckIcon } from "./icons";
import styles from "./landing.module.css";

function ScreenAccounts() {
  return (
    <div className={styles.sc}>
      <p className={styles.scK}>Where does your money sit?</p>
      {["Cash", "GCash", "MariBank"].map((n, i) => (
        <span key={n} className={styles.scRow} style={{ "--d": `${i * 120}ms` } as CSSProperties}>
          {n}
          <i>
            <CheckIcon width={12} height={12} />
          </i>
        </span>
      ))}
      <span className={styles.scAdd}>+ Add another</span>
    </div>
  );
}
function ScreenRhythm() {
  return (
    <div className={styles.sc}>
      <p className={styles.scK}>When does your allowance come?</p>
      <p className={styles.scAmt}>₱1,500</p>
      <div className={styles.scSeg}>
        <span data-on="">Every week</span>
        <span>Monthly</span>
        <span>Varies</span>
      </div>
      <div className={styles.scCal}>
        {["M", "T", "W", "T", "F", "S", "S", "M"].map((d, i) => (
          <span key={i} data-next={i === 7 ? "" : undefined} style={{ "--d": `${i * 50}ms` } as CSSProperties}>
            {d}
          </span>
        ))}
      </div>
      <p className={styles.scNote}>Next one: Monday</p>
    </div>
  );
}
function ScreenNumber() {
  return (
    <div className={styles.sc}>
      <p className={styles.scK}>Left to spend today</p>
      <p className={styles.scBig}>₱214</p>
      <div className={styles.scDots}>
        {Array.from({ length: 7 }, (_, i) => (
          <i key={i} style={{ "--d": `${i * 70}ms` } as CSSProperties} />
        ))}
      </div>
      <span className={styles.scBtn}>No spend today</span>
    </div>
  );
}

const STEPS: Array<{ k: string; title: string; body: string; screen: ReactNode }> = [
  { k: "01", title: "Say where your money sits.", body: "Cash, GCash, a bank, a savings app. Just the names. Salin never asks for a bank login.", screen: <ScreenAccounts /> },
  { k: "02", title: "Say when more is coming.", body: "Weekly allowance, a stipend each semester, or pay twice a month. Not sure? That's fine too.", screen: <ScreenRhythm /> },
  { k: "03", title: "Get your number. Every morning.", body: "Your spending money, shared over the days ahead. Spend less and tomorrow grows. Spend more and it adjusts.", screen: <ScreenNumber /> },
];

/** "How it works" as a scroll story: the steps scroll, the phone stays and changes with them (inline phones on small screens). */
export function Story() {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const el of refs.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className={styles.story}>
      <div className={styles.storyStage} aria-hidden="true">
        <div className={cn(styles.phone, styles.phoneSm)}>
          <div className={styles.notch} />
          <div className={cn(styles.screen, styles.screenStack)}>
            {STEPS.map((s, i) => (
              <div key={s.k} className={styles.layer} data-on={i === active ? "" : undefined}>
                {s.screen}
              </div>
            ))}
          </div>
        </div>
        <div className={styles.progress}>
          {STEPS.map((s, i) => (
            <i key={s.k} data-on={i <= active ? "" : undefined} />
          ))}
        </div>
      </div>
      <ol className={styles.storySteps}>
        {STEPS.map((s, i) => (
          <li
            key={s.k}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-i={i}
            data-on={i === active ? "" : undefined}
            className={styles.storyStep}
          >
            <span className={styles.storyK}>{s.k}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
            <div className={styles.storyInline} aria-hidden="true">
              <div className={cn(styles.phone, styles.phoneSm)}>
                <div className={styles.notch} />
                <div className={styles.screen}>{s.screen}</div>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
