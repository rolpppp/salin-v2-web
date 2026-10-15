import { splitReceive, paceAfter } from "@/components/simple-today/receive-split";
import { addDays, dayNumber, formatPeso } from "@/lib/money";
import { daysUntilDay, dayWithWeekday, resolveUntil } from "@/lib/money/pace";
import { buildSources, accountIdFor, MAX_PAY_MINOR, WEB_FIELDS } from "./web-path";
import type { DraftAccount, OnboardingDraft, Pattern } from "./draft";
import type { StepContext, StepError } from "./step";

/**
 * Onboarding v2 (P-12): the allowance / stipend / mix path. Pure logic behind the Welcome choice, "Your rhythm" and
 * "First money". The draft stays a "just tracking" draft (`skipped`), so the SQL needs no plan for it; Finish adds
 * Simple view, the "make it last until" date and the first money (docs/pm/ONBOARDING_V2.md).
 */

type Patch = Partial<OnboardingDraft>;
type Rhythm = OnboardingDraft["rhythm"];
type RhythmFrequency = NonNullable<Rhythm["frequency"]>;

export const PATTERN_OPTIONS: ReadonlyArray<{ value: Pattern; title: string; help: string }> = [
  { value: "allowance", title: "Allowance or stipend", help: "Money arrives from family or a scholarship" },
  { value: "salary", title: "Salary or regular pay", help: "A paycheck on a schedule" },
  { value: "mix", title: "A mix, or it varies", help: "Gigs, commissions, or both" },
];

export const isSimplePattern = (p: Pattern | null | undefined): boolean => p === "allowance" || p === "mix";
export const isSimple = (d: Pick<OnboardingDraft, "pattern" | "path">): boolean => d.path === "web" && isSimplePattern(d.pattern);

export const RHYTHM_OPTIONS: ReadonlyArray<{ value: RhythmFrequency; label: string }> = [
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "quarterly", label: "Every few months" },
  { value: "semester", label: "Each semester" },
  { value: "varies", label: "It varies" },
];

/** `income.frequency` has no quarterly or semester; those read as "varies" there. The real answer stays in `rhythm`. */
export const incomeFrequencyOf = (f: RhythmFrequency): NonNullable<OnboardingDraft["income"]["frequency"]> =>
  f === "quarterly" || f === "semester" ? "varies" : f;

export const RHYTHM_FIELDS = { amount: "ob-rhythm-amount", frequency: "ob-rhythm-freq-weekly", next: "ob-rhythm-next", unsure: "ob-rhythm-unsure" } as const;
export const MONEY_FIELDS = { amount: "ob-money-amount", keep: "ob-money-keep" } as const;

export const sourceNameOf = (p: Pattern | null): string => (p === "mix" ? "Money in" : "Allowance");

/** Welcome choice: allowance and mix start the short path with Cash ticked and landing; salary starts the usual one. */
export function startPattern(pattern: Pattern, userId: string): Patch {
  if (pattern === "salary") return { pattern, path: "web", step: "income", skipped: false };
  const cash: DraftAccount = { id: accountIdFor(userId, "Cash"), name: "Cash", type: "cash", currency: "PHP", isNew: true };
  const income = { kind: "allowance" as const, amountMinor: null, frequency: null, nextPayday: null, paidInOtherCurrency: false };
  return {
    pattern,
    path: "web",
    step: "accounts",
    skipped: true,
    income,
    accounts: [cash],
    landingAccountId: cash.id,
    sources: sourcesFor(pattern, cash.id),
  };
}

function sourcesFor(pattern: Pattern | null, landing: string | null) {
  return buildSources("allowance", [], landing).map((s) => ({ ...s, name: sourceNameOf(pattern) }));
}

/** Entering Your rhythm: the main source exists (Accounts may have changed the landing account). */
export function rhythmOnEnter(draft: OnboardingDraft): Patch | null {
  const want = sourcesFor(draft.pattern, draft.landingAccountId);
  return JSON.stringify(want) === JSON.stringify(draft.sources) ? null : { sources: want };
}

/** Change a rhythm answer; the pay fields the SQL reads follow it. */
export function setRhythm(draft: OnboardingDraft, change: Partial<Rhythm>): Patch {
  const rhythm = { ...draft.rhythm, ...change };
  return {
    rhythm,
    income: { ...draft.income, kind: "allowance", amountMinor: rhythm.amountMinor, frequency: rhythm.frequency ? incomeFrequencyOf(rhythm.frequency) : null, nextPayday: rhythm.nextDate },
  };
}

export function validateRhythm(draft: OnboardingDraft, ctx: Pick<StepContext, "todayIso">): StepError | null {
  const { amountMinor, frequency, nextDate } = draft.rhythm;
  const name = (draft.firstName ?? "").trim();
  if (name.length < 1 || name.length > 40) return { field: WEB_FIELDS.name, message: "Tell us what to call you, in 40 letters or fewer." };
  if (amountMinor === null || !(amountMinor > 0)) return { field: RHYTHM_FIELDS.amount, message: "Enter about how much you usually get, above ₱0." };
  if (amountMinor > MAX_PAY_MINOR) return { field: RHYTHM_FIELDS.amount, message: "That amount looks too large. Check the number of zeros." };
  if (frequency === null) return { field: RHYTHM_FIELDS.frequency, message: "Pick how often it comes." };
  if (nextDate !== null && nextDate < ctx.todayIso) return { field: RHYTHM_FIELDS.next, message: "Pick the next date: today or later, or say you're not sure." };
  return null;
}

/** Monday of the week containing `iso`. */
function mondayOf(iso: string): string {
  const wd = new Date(dayNumber(iso) * 86_400_000).getUTCDay();
  return addDays(iso, -((wd + 6) % 7));
}

/** The day the money must last until, and how many days that is (the same rules Simple Today uses; Monday weeks). */
export function untilFor(draft: Pick<OnboardingDraft, "rhythm">, todayIso: string): { day: string; days: number; known: boolean } {
  const r = resolveUntil({ today: todayIso, spendUntil: draft.rhythm.nextDate, nextPayday: null, weekStart: mondayOf(todayIso) });
  return { day: r.day, days: daysUntilDay(todayIso, r.day), known: r.source === "chosen" };
}

export function validateFirstMoney(draft: OnboardingDraft): StepError | null {
  const fm = draft.firstMoney;
  if (fm.amountMinor === null || !(fm.amountMinor > 0)) return { field: MONEY_FIELDS.amount, message: "Enter what you have right now, above ₱0, or skip this step." };
  const r = moneySplit(draft);
  if (!r.ok) return { field: r.problem === "keep_too_big" ? MONEY_FIELDS.keep : MONEY_FIELDS.amount, message: r.message };
  return null;
}

const MESSAGES = {
  over_moved: "The amounts in your other accounts add up to more than you have.",
  keep_too_big: "You can keep aside only what stays in the account that holds most of it.",
  bad_row: "Check the amounts in your accounts.",
  no_amount: "Enter what you have right now.",
} as const;

export type MoneySplit = { ok: true; landingMinor: number; spendMinor: number; rows: Array<{ accountId: string; name: string; minor: number }> } | { ok: false; problem: keyof typeof MESSAGES; message: string };

/** The first money split across accounts. The landing account holds the remainder, so the rows always add up. */
export function moneySplit(draft: OnboardingDraft): MoneySplit {
  const land = draft.landingAccountId ?? "";
  const moved = Object.entries(draft.firstMoney.extra).filter(([id]) => id !== land && draft.accounts.some((a) => a.id === id)).map(([accountId, minor]) => ({ accountId, minor }));
  const r = splitReceive({ amountMinor: draft.firstMoney.amountMinor, keepMinor: draft.firstMoney.keepMinor, receivedInId: land, moved, spendingBucketId: "spend", keepBucketId: "keep" });
  if (!r.ok) return { ok: false, problem: r.problem, message: MESSAGES[r.problem] };
  const name = (id: string) => draft.accounts.find((a) => a.id === id)?.name ?? "Account";
  return {
    ok: true,
    landingMinor: r.remainderMinor,
    spendMinor: r.spendMinor,
    rows: [{ accountId: land, name: name(land), minor: r.remainderMinor }, ...moved.map((m) => ({ accountId: m.accountId, name: name(m.accountId), minor: m.minor }))],
  };
}

/** About how much a day, as the slip and the step's live line say it. Null until the amount is valid. */
export function perDayFor(draft: OnboardingDraft, todayIso: string): { perDayMinor: number; days: number; untilLabel: string; known: boolean } | null {
  const s = moneySplit(draft);
  if (!s.ok) return null;
  const u = untilFor(draft, todayIso);
  return { perDayMinor: paceAfter(0, s.spendMinor, u.days), days: u.days, untilLabel: dayWithWeekday(u.day), known: u.known };
}

export const perDayText = (minor: number): string => formatPeso(minor).replace(/\.00$/, "");

/** Slip rows for the allowance / mix path. */
export function moneySlipRows(draft: OnboardingDraft, todayIso: string): Array<{ key: string; label: string; value: string | null }> {
  const r = draft.rhythm;
  const freq = RHYTHM_OPTIONS.find((o) => o.value === r.frequency)?.label ?? null;
  const landing = draft.accounts.find((a) => a.id === draft.landingAccountId);
  const pd = perDayFor(draft, todayIso);
  return [
    { key: "for", label: "For", value: draft.firstName?.trim() || null },
    { key: "gets", label: "You get", value: r.amountMinor ? perDayText(r.amountMinor) : null },
    { key: "freq", label: "How often", value: r.amountMinor && freq ? freq : null },
    { key: "next", label: "Next one", value: r.frequency ? (r.nextDate ? dayWithWeekday(r.nextDate) : "Not sure yet") : null },
    { key: "accts", label: "Accounts", value: draft.accounts.length > 0 ? draft.accounts.map((a) => a.name).join(", ") : null },
    { key: "lands", label: "Lands in", value: landing?.name ?? null },
    { key: "now", label: "Right now", value: draft.firstMoney.amountMinor ? perDayText(draft.firstMoney.amountMinor) : null },
    { key: "day", label: "A day", value: pd ? `about ${perDayText(pd.perDayMinor)}` : null },
  ];
}
