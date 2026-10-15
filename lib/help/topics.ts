/**
 * The in-app guide ("How Salin works"). Plain words, no jargon, each topic answers three things: what it is, how to use it,
 * and how to get more out of it. Content follows SPEC.md and BUSINESS_RULES.md; change it with them.
 */
export interface HelpTopic {
  id: string;
  title: string;
  /** One or two sentences: what this is for. */
  summary: string;
  /** The steps, in order. */
  how: readonly string[];
  /** One thing that makes it work harder for you. */
  tip: string;
  /** Where to do it. */
  go?: { href: string; label: string };
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "daily",
    title: "Your number for today",
    summary: "Simple view shows one number: what's fine to spend today. It comes from your Spending money, shared out over the days until your next money arrives.",
    how: [
      "Tap the date under the number to say when your money has to last until (a payday, an allowance day, the end of a semester).",
      "Tap I got money when money arrives. Type the amount, say which accounts it landed in, and keep some aside if you want.",
      "Log spending as you go. Underspend and tomorrow's number grows; overspend and it shrinks, so it always adds up.",
      "On a day you spend nothing, tap No spend today to keep your streak.",
    ],
    tip: "Keep some aside every time money arrives, even a little. It leaves your daily number, so it can't be spent by accident.",
    go: { href: "/today", label: "Open Today" },
  },
  {
    id: "buckets",
    title: "Buckets",
    summary: "Salin sorts your money into buckets. Each bucket has one job, so you always know what's free to spend and what's already spoken for.",
    how: [
      "Spend buckets (Living, Fun) are for day-to-day. Your safe-to-spend number comes from these.",
      "Save & grow buckets (Emergency fund, Investments, Sinking funds) are for later.",
      "Set aside buckets (Tax, Buffer, Rent, Scholarship) are money that isn't yours to spend freely.",
      "Each bucket is kept in a real account, such as GCash or a bank. Tap a bucket on Today to see what went in and out of it.",
    ],
    tip: "Taller ribbons mean more money left. If a bucket shows a coral \"Needs ₱X\", it's overspent: cover it from your Buffer with one tap.",
    go: { href: "/today", label: "See your buckets" },
  },
  {
    id: "plans",
    title: "Your plan",
    summary: "A plan says what share of every payday goes to each bucket. Plan A is your everyday split. Plan B takes over once your Emergency fund reaches its target.",
    how: [
      "Open Plans, then Split plan. Each bucket has a percentage; Plan A has to add up to 100%.",
      "Pick where each bucket is kept. This decides which transfers Salin asks you to make.",
      "Change a percentage and it applies to paydays after the change. Past money is never rewritten.",
      "Set the Emergency target that switches you to Plan B, and the date rent starts if it's later.",
    ],
    tip: "Start with the suggested split, then nudge one bucket at a time. The Review page will tell you if one bucket keeps running out.",
    go: { href: "/plans/split", label: "Open Split plan" },
  },
  {
    id: "income",
    title: "Income sources and rules",
    summary: "Each place your money comes from (salary, scholarship, side hustle, allowance, gifts) is a source. A source's rule decides what job its money gets.",
    how: [
      "Open Plans, then Income, and add a source with + Add income source.",
      "Choose its rule: Split by my plan, Its own split, Keep it whole in one bucket, or Ask me each time.",
      "Pick which account its money usually lands in.",
      "Changing a rule only affects money that hasn't been given a job yet.",
    ],
    tip: "Give side hustle money its own split with a share for tax. Then tax is set aside before you can spend it.",
    go: { href: "/plans/income", label: "Open Income" },
  },
  {
    id: "money-in",
    title: "Money in and transfers",
    summary: "When money arrives, it waits in Money in until it has a job. Then Salin tells you exactly what to send between your accounts. It never moves money for you.",
    how: [
      "Add income, or let it appear by itself if you log on your phone.",
      "Step 1: check each income's job and press Confirm. Confirm all does every one that has a job.",
      "Step 2: open your banking app and send each transfer in the list, then tick it here. Unticking undoes it.",
      "When everything is sent, your accounts match your buckets.",
    ],
    tip: "Do this on payday while the money is fresh. It takes about two minutes, and it's what keeps the whole system honest.",
    go: { href: "/money-in", label: "Open Money in" },
  },
  {
    id: "accounts",
    title: "Accounts",
    summary: "Accounts are the real places your money sits: banks, e-wallets, cash. They are the same accounts your phone app uses.",
    how: [
      "Open Plans, then Accounts, and add one with + Add account (name, type, currency).",
      "Rename an account right in its row. The Should hold figure is what Salin expects to be in it, based on your buckets.",
      "If Should hold and your real balance differ, something hasn't been sent or logged yet.",
      "Archive an account you stopped using. It comes back with Restore, and accounts in use can't be archived.",
    ],
    tip: "Add every place you keep money, including cash. The more complete your accounts, the more accurate your transfers.",
    go: { href: "/plans/accounts", label: "Open Accounts" },
  },
  {
    id: "categories",
    title: "Categories",
    summary: "Every spending category lives inside a bucket. When you log \"Groceries\", it comes out of the bucket Groceries belongs to.",
    how: [
      "Open Plans, then Categories. They are grouped by bucket, with what you spent this month.",
      "Use Move to to put a category in a different bucket. It changes where new spending goes, not old spending.",
      "Add a category under a bucket with New category. Remove one only when it has no entries.",
    ],
    tip: "If one bucket keeps running dry, check which category is eating it. Moving a treat category to Fun is often the fix.",
    go: { href: "/plans/categories", label: "Open Categories" },
  },
  {
    id: "goals",
    title: "Goals",
    summary: "A goal is something you're saving for. Your Emergency fund is the first goal, and its target is also the amount that switches you to Plan B.",
    how: [
      "Open Plans, then Goals, and add a goal with a name and a target.",
      "Link it to a bucket, all of it or a share (for example, a PC build can take half of Sinking funds).",
      "Today shows how much is saved, how much to go, and about how many more paydays it needs.",
    ],
    tip: "Small, specific goals work best. A named goal with a number moves faster than \"save more\".",
    go: { href: "/plans/goals", label: "Open Goals" },
  },
  {
    id: "review",
    title: "Weekly review",
    summary: "Five minutes, once a week: look back, fix one thing, close the week. Then Monday starts fresh.",
    how: [
      "Read the week slip: what came in, what you spent, what you put away.",
      "Look at the one thing Salin points out. If a bucket ran short, cover it from your Buffer or nudge the plan.",
      "Press Close the week. You can close with open items; they carry into next week.",
    ],
    tip: "Do it at the same time each week. A reliable habit beats a perfect plan.",
    go: { href: "/review", label: "Open Review" },
  },
  {
    id: "log",
    title: "Logging spending",
    summary: "Log what you spend so your numbers stay true. It takes about five seconds.",
    how: [
      "Tap + Log spending, type the amount, pick a category.",
      "Salin takes it out of that category's bucket and updates your safe-to-spend number straight away.",
      "Logged something on your phone? It shows up here by itself when sync is on.",
    ],
    tip: "Log as you spend, not at night. Small, quick entries are easier than remembering everything later.",
  },
  {
    id: "views",
    title: "Simple view and Full view",
    summary: "Simple shows one number a day. Full shows every bucket, your plans and the money waiting to be sorted. They use the same data.",
    how: [
      "Switch from the account menu at the top right, or from the link at the bottom of Today.",
      "Nothing is lost or changed when you switch. It only changes how Today looks.",
    ],
    tip: "Start in Simple. Move to Full when you want to adjust your plan, or you get several kinds of income.",
    go: { href: "/today", label: "Go to Today" },
  },
  {
    id: "app",
    title: "The phone app",
    summary: "Salin has an Android app for logging on the go. It shares the same account, so what you log there shows up here.",
    how: ["For now it's shared by request. Email proj.salin@gmail.com and we'll send you the APK.", "Install it, sign in with the same account, and turn on sync."],
    tip: "Log on your phone through the day, then use the web for payday and your weekly review.",
  },
];

const BY_ID = new Map(HELP_TOPICS.map((t) => [t.id, t]));
export const helpTopic = (id: string): HelpTopic | undefined => BY_ID.get(id);

/** Which topic fits the page the user is on (and the view they're in on Today). */
export function topicForPath(pathname: string, viewMode: "simple" | "full" | undefined): string {
  if (pathname.startsWith("/money-in")) return "money-in";
  if (pathname.startsWith("/review")) return "review";
  if (pathname.startsWith("/plans/income")) return "income";
  if (pathname.startsWith("/plans/accounts")) return "accounts";
  if (pathname.startsWith("/plans/categories")) return "categories";
  if (pathname.startsWith("/plans/goals")) return "goals";
  if (pathname.startsWith("/plans")) return "plans";
  return viewMode === "simple" ? "daily" : "buckets";
}
