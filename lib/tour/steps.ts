/**
 * The first-visit tour (tickets 33, 35): short steps over the real pages, right after onboarding. It starts on Today,
 * then walks through Money in, Review and Plans, and ends on the header (reminders, help, switching views).
 * Each step points at an element marked `data-tour="<target>"` on `path` (null: the header, on any page). A step whose
 * element isn't there (no bell, nothing waiting yet, ...) is dropped when the tour reaches it.
 */
export type TourView = "simple" | "full";

export type TourStep = {
  id: string;
  /** Value of the `data-tour` attribute it points at. */
  target: string;
  title: string;
  body: string;
  views: readonly TourView[];
  /** The page it lives on; null for the header, which is on every page. */
  path: string | null;
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "hero",
    path: "/today",
    target: "hero",
    title: "Your number for today",
    body: "This is what's fine to spend today, so the rest lasts until your next money comes in. Tap the date under it to make it last longer.",
    views: ["simple"],
  },
  {
    id: "actions",
    path: "/today",
    target: "actions",
    title: "Log spending, add money",
    body: "Log each thing you spend and today's number goes down right away. Got your allowance, a stipend or a gift? Tap I got money.",
    views: ["simple"],
  },
  {
    id: "habit",
    path: "/today",
    target: "habit",
    title: "Keep a streak",
    body: "Every day you log spending, or mark a no-spend day, adds to your streak.",
    views: ["simple"],
  },
  {
    id: "accounts",
    path: "/today",
    target: "accounts",
    title: "Where your money is",
    body: "Your accounts and what's in each. If money should move from one to another, Salin says so here.",
    views: ["simple"],
  },
  {
    id: "safe",
    path: "/today",
    target: "safe",
    title: "Safe to spend",
    body: "What you can spend until payday. Money for bills and savings is already taken out.",
    views: ["full"],
  },
  {
    id: "next",
    path: "/today",
    target: "next",
    title: "Your next step",
    body: "Salin always shows one thing to do next. Getting started, under it, tracks your first week.",
    views: ["full"],
  },
  {
    id: "shelf",
    path: "/today",
    target: "shelf",
    title: "Your buckets",
    body: "Each bucket holds money for one job, like Living or Emergency fund. Tap one to see what went in and out.",
    views: ["full"],
  },
  {
    id: "streak",
    path: "/today",
    target: "streak",
    title: "Keep a streak",
    body: "Every day you log spending, or mark a no-spend day, adds to your streak.",
    views: ["full"],
  },
  {
    id: "moneyin-steps",
    path: "/money-in",
    target: "moneyin-steps",
    title: "Money in",
    body: "New income waits here until you give it a job. Then Salin lists the transfers that put each peso in the right bucket.",
    views: ["simple", "full"],
  },
  {
    id: "moneyin-add",
    path: "/money-in",
    target: "moneyin-add",
    title: "Add income",
    body: "Got paid in a way the phone app didn't see? Add it here and it joins the queue.",
    views: ["full"],
  },
  {
    id: "review-steps",
    path: "/review",
    target: "review-steps",
    title: "Review, once a week",
    body: "Five minutes: look back at the week, fix one thing, then close it. Salin starts a fresh week.",
    views: ["full"],
  },
  {
    id: "review-slip",
    path: "/review",
    target: "review-slip",
    title: "Your week on one slip",
    body: "What came in, what you spent and what you put away. The numbers always add up.",
    views: ["simple", "full"],
  },
  {
    id: "plans-nav",
    path: "/plans/split",
    target: "plans-nav",
    title: "Plans is your setup",
    body: "Split plan, Income, Accounts, Categories and Goals. Changes apply to money that comes in next.",
    views: ["simple", "full"],
  },
  {
    id: "plans-body",
    path: "/plans/split",
    target: "plans-body",
    title: "How each payday is split",
    body: "Each bucket's share of a payday. Salin uses it every time money comes in to say what goes where.",
    views: ["full"],
  },
  {
    id: "bell",
    path: null,
    target: "bell",
    title: "Reminders",
    body: "Turn on a daily nudge to log spending. Your streak and notes show up here too.",
    views: ["simple", "full"],
  },
  {
    id: "help",
    path: null,
    target: "help",
    title: "Help is always here",
    body: "Short guides to every page. You can take this tour again from here.",
    views: ["simple", "full"],
  },
  {
    id: "avatar-simple",
    path: null,
    target: "avatar",
    title: "Want more detail?",
    body: "Switch to Full view from your account menu to see every bucket and your plan. You can switch back any time.",
    views: ["simple"],
  },
  {
    id: "avatar-full",
    path: null,
    target: "avatar",
    title: "Want it simpler?",
    body: "Switch to Simple view from your account menu for one number a day. You can switch back any time.",
    views: ["full"],
  },
];

/**
 * The steps for this view, in order. Header steps are checked now (the header is on every page); page steps are
 * checked when the tour gets there.
 */
export function stepsFor(view: TourView, isPresent: (target: string) => boolean): TourStep[] {
  return TOUR_STEPS.filter((s) => s.views.includes(view) && (s.path !== null || isPresent(s.target)));
}

/** Set once the tour was finished or skipped on this device. */
export const TOUR_DONE_KEY = "salin.tour.done";
/** Where a tour in progress is kept, so a reload mid-tour picks it up again. */
export const TOUR_STATE_KEY = "salin.tour.state";
/** Help's "Take the tour" fires this; the tour lives in the app layout, so it works from any page. */
export const TOUR_EVENT = "salin:tour";
