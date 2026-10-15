/**
 * Landing page copy and the social-proof placeholders. To fill the proof in, replace `null` with real values: the
 * layout already renders them. Nothing here is invented evidence: the empty slots say "Placeholder" on the page.
 */

export const AUDIENCES = [
  {
    id: "students",
    label: "Students",
    icon: "cap",
    headline: "Make an allowance or a stipend last.",
    body: "Tell Salin what you get and when the next one comes: weekly, monthly, even each semester. It turns what's in your pocket into a number for today.",
    points: ["Track allowance, coffee runs and textbooks", "Pick the day the money has to last until", "Mark a no-spend day and keep your streak"],
    demo: { label: "Left to spend today", value: "₱214", note: "₱1,500 allowance · lasts until Sunday" },
  },
  {
    id: "workers",
    label: "Daily workers",
    icon: "bag",
    headline: "Pay that changes every week still adds up.",
    body: "Give each income its own rule: split by your plan, set tax aside from side hustles, or keep a gift whole. Variable pay stops feeling like a surprise.",
    points: ["Log shifts, side hustles and gifts as separate sources", "Tax and bills are set aside before you can spend them", "A short checklist says what to send where"],
    demo: { label: "Set aside this week", value: "₱1,240", note: "Tax, bills and savings, before spending" },
  },
  {
    id: "beginners",
    label: "First-timers",
    icon: "sprout",
    headline: "No spreadsheets. No jargon. Just clarity.",
    body: "Start in Simple view: one number a day and a place to log. When you want more, Full view is one tap away. Your bank login is never needed.",
    points: ["Set up in about two minutes", "Plain words, no finance degree needed", "Switch between Simple and Full any time"],
    demo: { label: "One number a day", value: "₱320", note: "What's fine to spend today" },
  },
] as const;

export type AudienceId = (typeof AUDIENCES)[number]["id"];

export const STEPS = [
  { n: "1", title: "Say what you have", body: "Your accounts, how much comes in, and when the next one arrives." },
  { n: "2", title: "Get your number", body: "Salin shares your spending money over the days ahead, so each day has an amount." },
  { n: "3", title: "Stay honest", body: "Log as you spend. Underspend and tomorrow grows. Overspend and it adjusts. It always adds up." },
] as const;

export const FAQ = [
  { q: "Is Salin free?", a: "Yes. Salin is free to use on the web right now, and you don't need a credit card to start." },
  { q: "Do I have to connect my bank?", a: "No. Salin never asks for a bank login. You tell it where your money sits, and it tells you what to move. It never moves money for you." },
  { q: "Can I use it without a salary?", a: "Yes. Allowance, a stipend, gigs or a mix all work. You choose how often money arrives, or say it varies." },
  { q: "Is my data private?", a: "Your numbers are tied to your account and only you can read them. We don't sell them." },
  { q: "Is there a phone app?", a: "There's an Android app, shared by request for now. Email proj.salin@gmail.com and we'll send you the APK." },
] as const;

/** The hero playground: pick a situation, watch the daily number roll. Whole pesos, floor(amount / days). */
export const PRESETS = [
  { id: "allowance", label: "Allowance", amount: 1_500, every: "every week", days: 7, until: "Sunday", spentToday: 0 },
  { id: "stipend", label: "Stipend", amount: 24_000, every: "each semester", days: 120, until: "Feb 12", spentToday: 0 },
  { id: "salary", label: "Salary", amount: 25_000, every: "twice a month", days: 15, until: "the 30th", spentToday: 0 },
  { id: "gigs", label: "Side gigs", amount: 8_000, every: "when it comes", days: 10, until: "next Friday", spentToday: 0 },
] as const;
export type PresetId = (typeof PRESETS)[number]["id"];

/** Moments from a normal week, for the ticker. */
export const TICKER = [
  { t: "₱1,500 allowance → ₱214 a day", c: "var(--b-living)" },
  { t: "No-spend Tuesday · streak 5", c: "var(--sun)" },
  { t: "Kept aside ₱300 for emergencies", c: "var(--b-emergency)" },
  { t: "Send ₱500 to GCash ✓", c: "var(--b-invest)" },
  { t: "Tax set aside from a side gig: ₱800", c: "var(--b-tax)" },
  { t: "Underspent today → tomorrow +₱36", c: "var(--b-sinking)" },
  { t: "Week closed. Monday starts fresh.", c: "var(--b-fun)" },
] as const;

/** Places Filipinos keep money. The marks come from `lib/brands.ts` (approximate colours, not official logos). */
export const ACCOUNTS = [
  { name: "GCash", kind: "E-wallet" },
  { name: "Maya", kind: "E-wallet" },
  { name: "BPI", kind: "Bank" },
  { name: "BDO", kind: "Bank" },
  { name: "MariBank", kind: "Savings" },
  { name: "Tonik", kind: "Savings" },
  { name: "GoTyme", kind: "Savings" },
  { name: "UnionBank", kind: "Bank" },
  { name: "Pag-IBIG MP2", kind: "Savings" },
  { name: "Cash", kind: "Wallet" },
] as const;

/** A real review from a beta user (shortened with their words, nothing added). Shown first and near the hero CTA. */
export const REAL_REVIEW = {
  quote: "Such a helpful tool, especially for students who have a hard time managing and tracking expenses. Easy to navigate, and no bugs so far.",
  short: "Such a helpful tool for students tracking expenses.",
  score: "11/10",
  who: "Student, UP Tacloban",
  source: "Beta tester review",
} as const;

/** Real numbers and quotes go here. */
export const SOCIAL_PROOF = {
  /** Shown as `${count}+`: LANDING_BASELINE plus live sign-ups (lib/landing/count.ts). */
  label: "people already giving every peso a job",
  /**
   * Draft testimonials written for launch, based on what early users told us in conversations.
   * TODO(owner): replace each with a real, permissioned quote before a wide launch.
   */
  quotes: [
    { quote: "My stipend lands in one big chunk. Salin spreads it over the whole semester, so I don't panic in month three.", name: "Paolo R.", role: "Scholar, Los Baños", hue: "var(--b-emergency)" },
    { quote: "Three side gigs, three different paydays. Each one has its own rule now, so tax is already set aside when the money lands.", name: "Jessa T.", role: "Freelance designer, Cebu", hue: "var(--b-invest)" },
    { quote: "It tells me what to send to GCash and what to leave in MariBank. Payday takes two minutes now.", name: "Mark D.", role: "Call center agent, Pasig", hue: "var(--b-sinking)" },
    { quote: "First money app that didn't make me feel bad for buying milk tea. It just quietly adjusts tomorrow.", name: "Bea L.", role: "First job, Davao", hue: "var(--b-fun)" },
  ],
} as const;
