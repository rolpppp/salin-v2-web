"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ElementType, ReactNode } from "react";
import styles from "./landing.module.css";

/**
 * Scroll reveal. Server-renders as already shown (no flash, works without JS); on the client, anything still below the
 * fold is hidden, then shown once it scrolls into view. Reduced motion: shown straight away.
 */
export function Reveal({ children, as: Tag = "div", className, delay = 0, style, spotlight = false }: { children: ReactNode; as?: ElementType; className?: string; delay?: number; style?: CSSProperties; /** A soft light follows the pointer (fine pointers only, set in CSS). */ spotlight?: boolean }) {
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<"in" | "pending">("in");

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    setState("pending");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("in");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      onPointerMove={
        spotlight
          ? (e: React.PointerEvent<HTMLElement>) => {
              if (e.pointerType !== "mouse") return;
              const r = e.currentTarget.getBoundingClientRect();
              e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
              e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
            }
          : undefined
      } className={className ? `${styles.rv} ${className}` : styles.rv} data-reveal={state} style={{ ...style, "--delay": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}
