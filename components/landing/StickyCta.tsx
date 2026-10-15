"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./landing.module.css";

/**
 * Phones only (CSS hides it from 721px): once the hero's button has scrolled away, a "Start free" bar waits in the thumb
 * zone (Fitts's law), and it gets out of the way again when the final call to action is on screen.
 */
export function StickyCta() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.querySelector("[data-hero-cta]");
    const final = document.querySelector("[data-final-cta]");
    if (!hero || !final || !("IntersectionObserver" in window)) return;
    let heroGone = false;
    let finalOn = false;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) heroGone = !e.isIntersecting && e.boundingClientRect.top < 0;
        if (e.target === final) finalOn = e.isIntersecting;
      }
      setShow(heroGone && !finalOn);
    });
    io.observe(hero);
    io.observe(final);
    return () => io.disconnect();
  }, []);
  return (
    <div className={styles.sticky} data-show={show ? "" : undefined} aria-hidden={!show}>
      <span>
        <b>One number a day.</b> Free to start.
      </span>
      <Link href="/sign-up" className={styles.stickyBtn} tabIndex={show ? 0 : -1} data-testid="sticky-cta">
        Start free
      </Link>
    </div>
  );
}
