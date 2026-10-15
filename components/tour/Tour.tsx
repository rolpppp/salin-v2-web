"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/button/Button";
import { GROW_CLEAR_MS } from "@/lib/motion/grow";
import { TOUR_DONE_KEY, TOUR_EVENT, TOUR_STATE_KEY, TOUR_STEPS, stepsFor, type TourStep, type TourView } from "@/lib/tour/steps";
import styles from "./tour.module.css";

const PAD = 8; // space around the lit element
const GAP = 14; // between the lit element and the card
const EDGE = 16; // keep the card this far from the viewport edge
const PHONE_MAX = 719; // matches the bottom-sheet media query
const FIND_FOR_MS = 3000; // how long to wait for a step's element after arriving on its page

const find = (target: string) => document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
const onPage = (target: string) => {
  const r = find(target)?.getBoundingClientRect();
  return !!r && r.width > 0 && r.height > 0;
};
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Saved = { view: TourView; ids: string[]; index: number };
const save = (s: Saved | null) => {
  try {
    if (s) sessionStorage.setItem(TOUR_STATE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(TOUR_STATE_KEY);
  } catch {
    // Private mode: a reload mid-tour just ends it.
  }
};
const load = (view: TourView): { steps: TourStep[]; index: number } | null => {
  try {
    const s = JSON.parse(sessionStorage.getItem(TOUR_STATE_KEY) ?? "null") as Saved | null;
    if (!s || s.view !== view) return null;
    const steps = s.ids.flatMap((id) => TOUR_STEPS.filter((t) => t.id === id));
    return steps.length && s.index >= 0 && s.index < steps.length ? { steps, index: s.index } : null;
  } catch {
    return null;
  }
};

/**
 * The first-visit tour (tickets 33, 35). Lives in the app layout so it can walk across pages: Today, then Money in,
 * Review and Plans, then the header. Starts when a page opens with `?tour=1` (the onboarding Done buttons) or when
 * Help fires `salin:tour`. Skip, Escape or Done ends it and it never comes back on its own. While it moves to another
 * page the dialog closes, so the page isn't inert during the navigation.
 */
export function Tour({ view }: { view: TourView }) {
  const router = useRouter();
  const pathname = usePathname();
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false); // the current step's element is on screen
  const dir = useRef<1 | -1>(1);

  const start = useCallback(() => {
    dir.current = 1;
    setReady(false);
    setIndex(0);
    setSteps(stepsFor(view, onPage));
  }, [view]);

  // ?tour=1 (any app page), and a tour in progress after a reload.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.has("tour")) {
      q.delete("tour");
      const rest = q.toString();
      router.replace(`${pathname}${rest ? `?${rest}` : ""}`, { scroll: false });
      // After Today's welcome grow, so the first thing lit isn't still moving.
      const t = setTimeout(start, reducedMotion() ? 0 : q.has("grow") ? GROW_CLEAR_MS : 400);
      return () => clearTimeout(t);
    }
    const resumed = load(view);
    if (resumed && !steps) {
      const t = setTimeout(() => {
        setSteps(resumed.steps);
        setIndex(resumed.index);
      }, 0);
      return () => clearTimeout(t);
    }
    // Only on arrival at a page; the tour's own navigation is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    window.addEventListener(TOUR_EVENT, start);
    return () => window.removeEventListener(TOUR_EVENT, start);
  }, [start]);

  const step = steps?.[index] ?? null;

  // Go to the step's page, then wait for its element; a step whose element never shows is dropped.
  useEffect(() => {
    if (!steps || !step) return;
    save({ view, ids: steps.map((s) => s.id), index });
    if (step.path && step.path !== pathname) {
      router.push(step.path, { scroll: false });
      return;
    }
    let raf = 0;
    const until = performance.now() + FIND_FOR_MS;
    const look = () => {
      if (onPage(step.target)) return setReady(true);
      if (performance.now() < until) {
        raf = requestAnimationFrame(look);
        return;
      }
      const rest = steps.filter((s) => s.id !== step.id);
      if (rest.length === 0) return setSteps(null);
      setSteps(rest);
      setIndex((i) => Math.max(0, Math.min(rest.length - 1, dir.current === 1 ? i : i - 1)));
    };
    look();
    return () => cancelAnimationFrame(raf);
  }, [steps, step, index, pathname, router, view]);

  const go = (i: number) => {
    if (!steps || !step) return;
    dir.current = i < index ? -1 : 1;
    const next = steps[i];
    if (next && next.path && next.path !== step.path && next.path !== pathname) setReady(false);
    setIndex(i);
  };

  const end = useCallback(
    (finished: boolean) => {
      setSteps(null);
      setReady(false);
      save(null);
      try {
        localStorage.setItem(TOUR_DONE_KEY, "1");
      } catch {
        // Private mode: nothing else depends on it.
      }
      if (finished && pathname !== "/today") router.push("/today");
    },
    [pathname, router],
  );

  if (!steps || !step || !ready || (step.path && step.path !== pathname)) return null;
  return createPortal(<TourDialog steps={steps} index={index} onGo={go} onEnd={end} />, document.body);
}

type Placement = { spot: { top: number; left: number; width: number; height: number }; card: { top: number; left: number } | "sheet" };

function TourDialog({ steps, index, onGo, onEnd }: { steps: TourStep[]; index: number; onGo: (i: number) => void; onEnd: (finished: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  const step = steps[index]!;
  const last = index === steps.length - 1;

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  // Bring the step's element into view, then keep the light and the card on it while the page scrolls or resizes.
  useEffect(() => {
    const el = find(step.target);
    if (!el) return;
    const phone = window.innerWidth <= PHONE_MAX;
    if (!el.closest("header")) {
      const r = el.getBoundingClientRect();
      const headerH = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const roomBelow = phone ? (card.current?.offsetHeight ?? 220) + 28 : EDGE;
      const fits = r.top >= headerH + EDGE && r.bottom <= window.innerHeight - roomBelow;
      if (!fits) window.scrollTo({ top: Math.max(0, r.top + window.scrollY - headerH - 24), behavior: reducedMotion() ? "auto" : "smooth" });
    }
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const spot = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
        if (window.innerWidth <= PHONE_MAX) {
          setPlace({ spot, card: "sheet" });
          return;
        }
        const c = card.current?.getBoundingClientRect() ?? { width: 360, height: 200 };
        const vh = window.innerHeight;
        let top = spot.top + spot.height + GAP; // below
        let left = Math.min(window.innerWidth - c.width - EDGE, Math.max(EDGE, spot.left));
        if (top + c.height > vh - EDGE) top = spot.top - GAP - c.height; // above
        if (top < EDGE) {
          // Too tall for either (a whole page section): the bottom-right corner covers the least of it.
          top = vh - c.height - EDGE;
          left = window.innerWidth - c.width - EDGE;
        }
        setPlace({ spot, card: { top, left } });
      });
    };
    measure();
    // Smooth scrolling moves the element for a while; follow it.
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [step.target]);

  useEffect(() => {
    next.current?.focus();
  }, [index]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
      onCancel={(e) => {
        e.preventDefault();
        onEnd(false);
      }}
      data-testid="tour"
    >
      <div className={styles.spot} style={place?.spot} data-hidden={place ? undefined : ""} aria-hidden="true" />
      <div
        ref={card}
        key={step.id}
        className={styles.card}
        style={place && place.card !== "sheet" ? place.card : undefined}
        data-placed={place ? "" : undefined}
        data-step={step.id}
        data-testid="tour-card"
      >
        <p className={styles.count}>
          {index + 1} of {steps.length}
        </p>
        <h2 id="tour-title" className={styles.title}>
          {step.title}
        </h2>
        <p id="tour-body" className={styles.body}>
          {step.body}
        </p>
        <div className={styles.dots} aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.id} data-on={i === index ? "" : undefined} />
          ))}
        </div>
        <div className={styles.actions}>
          {last ? (
            <span />
          ) : (
            <button type="button" className={styles.skip} onClick={() => onEnd(false)}>
              Skip tour
            </button>
          )}
          <span>
            {index > 0 ? (
              <Button variant="quiet" onClick={() => onGo(index - 1)}>
                Back
              </Button>
            ) : null}
            <Button ref={next} variant="primary" aria-describedby="tour-title tour-body" onClick={() => (last ? onEnd(true) : onGo(index + 1))} data-testid="tour-next">
              {last ? "Done" : nextLabel(steps, index)}
            </Button>
          </span>
        </div>
      </div>
    </dialog>
  );
}

/** "Next" on the same page; names the page when the next step is somewhere else. */
function nextLabel(steps: TourStep[], index: number): string {
  const here = steps[index]!.path;
  const there = steps[index + 1]?.path;
  if (!there || there === here) return "Next";
  return { "/today": "Next: Today", "/money-in": "Next: Money in", "/review": "Next: Review", "/plans/split": "Next: Plans" }[there] ?? "Next";
}
