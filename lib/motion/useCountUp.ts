"use client";

import { useLayoutEffect, type RefObject } from "react";
import { countValue } from "./countUp";

export type CountUpOptions = {
  /** Play only when true. Reduced motion never plays. */
  active: boolean;
  from: number;
  to: number;
  /** Renders one integer step as the text the element shows (e.g. digits only). */
  format: (n: number) => string;
  /** The text the element shows when finished; also what React rendered, so it is in the DOM from the first render. */
  finalText: string;
  durationMs?: number;
  delayMs?: number;
};

/**
 * Animates the text of `ref` from `from` to `to`. The element already holds `finalText` (server render, tests,
 * and anything reading the DOM before the effect). The effect only paints intermediate frames over it, marks the
 * element `aria-hidden` while it runs (the final value is announced elsewhere), and always restores `finalText`.
 */
export function useCountUp(ref: RefObject<HTMLElement | null>, o: CountUpOptions): void {
  const { active, from, to, format, finalText, durationMs = 900, delayMs = 0 } = o;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active || from === to) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let cancelled = false;
    const start = performance.now() + delayMs;
    el.setAttribute("aria-hidden", "true");
    el.textContent = format(from);
    const step = (now: number) => {
      if (cancelled) return;
      const t = (now - start) / durationMs;
      if (t >= 1) {
        el.textContent = finalText;
        el.removeAttribute("aria-hidden");
        return;
      }
      el.textContent = format(countValue(from, to, Math.max(0, t)));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      el.textContent = finalText;
      el.removeAttribute("aria-hidden");
    };
    // A one-shot per mount: later renders must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
