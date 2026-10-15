"use client";

import { useEffect, useRef, useState } from "react";
import { Odometer } from "./Odometer";
import styles from "./landing.module.css";

/** The people count rolls up from zero the first time it scrolls into view. Server-renders the real number. */
export function StatCount({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setShown(0);
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          // One frame at zero first, so the columns have somewhere to roll from.
          requestAnimationFrame(() => setShown(value));
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);
  return (
    <span ref={ref} className={styles.statN} data-testid="people-count" data-value={value}>
      <Odometer value={shown} />
      <span className={styles.statPlus}>+</span>
    </span>
  );
}
