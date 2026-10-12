import { AccountType as AccountTypeEnum, enumName } from "@/lib/domain/enums";
import { newUuidV4 } from "@/lib/domain/mobile";
import { emptyDraft, type DraftAccount, type DraftIncomeSource, type OnboardingDraft } from "./draft";
import type { StepContext, StepError } from "./step";

/** Pure logic for the web path's Income and Accounts steps (SPEC §7.3 steps 1-2, §4.2 default rules, BR §2). */

type Kind = DraftIncomeSource["kind"];
type MainKind = OnboardingDraft["income"]["kind"];
type Frequency = NonNullable<OnboardingDraft["income"]["frequency"]>;
type Patch = Partial<OnboardingDraft>;

export const INCOME_QUESTION = "What money comes in?";
export const INCOME_REASON = "Start with the money you count on most. Your plan is built around it, and other money gets its own rule.";
export const ACCOUNTS_QUESTION = "Where does your money sit?";
export const ACCOUNTS_REASON = "Pick every place you keep money. No bank login: Salin only needs the names, so it can tell you what to move where.";

export const MAX_PAY_MINOR = 1_000_000_000; // ₱10,000,000.00

export const MAIN_KIND_OPTIONS: ReadonlyArray<{ value: MainKind; title: string; help: string }> = [
  { value: "salary", title: "Salary", help: "A regular paycheck" },
  { value: "side_hustle", title: "Freelance or side hustle", help: "Paid per project or client" },
  { value: "scholarship", title: "Scholarship", help: "A stipend or grant" },
  { value: "allowance", title: "Allowance", help: "From family" },
];

export const EXTRA_KIND_OPTIONS: ReadonlyArray<{ value: Kind; label: string }> = [
  { value: "side_hustle", label: "Side hustle" },
  { value: "scholarship", label: "Scholarship" },
  { value: "allowance", label: "Allowance" },
  { value: "gift", label: "Gifts" },
];

export const WEB_FREQUENCY_OPTIONS: ReadonlyArray<{ value: Frequency; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "twice", label: "Twice a month" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "weekly", label: "Weekly" },
  { value: "varies", label: "It varies" },
];

/** Field ids the shell focuses on error. */
export const WEB_FIELDS = {
  name: "ob-name",
  kind: "ob-kind-salary", // the first radio
  amount: "ob-amount",
  payday: "ob-next-payday",
  frequency: "ob-freq-monthly", // the first radio
  firstAccount: "ob-acct-0",
  customName: "ob-custom",
  landing: "ob-landed",
} as const;

const SOURCE_NAME: Record<Kind, string> = {
  salary: "Salary",
  side_hustle: "Side hustle",
  scholarship: "Scholarship",
  allowance: "Allowance",
  gift: "Gift",
  refund: "Refund",
  other: "Other",
};

/** A source with its kind's default rule (SPEC §4.2): salary plan; scholarship whole Scholarship; side hustle own Tax 10 / Sinking 40 / Fun 50; allowance whole Living; the rest ask. */
export function sourceFor(kind: Kind, opts: { isMain: boolean; landsInAccountId: string | null }): DraftIncomeSource {
  const base = { key: opts.isMain ? "main" : kind, name: SOURCE_NAME[kind], kind, landsInAccountId: opts.landsInAccountId, categoryId: null, isMain: opts.isMain } as const;
  if (opts.isMain) return { ...base, rule: "plan", wholeBucket: null, ownSplit: null };
  switch (kind) {
    case "salary":
      return { ...base, rule: "plan", wholeBucket: null, ownSplit: null };
    case "scholarship":
      return { ...base, rule: "whole", wholeBucket: "scholarship", ownSplit: null };
    case "allowance":
      return { ...base, rule: "whole", wholeBucket: "living", ownSplit: null };
    case "side_hustle":
      return { ...base, rule: "own", wholeBucket: null, ownSplit: { tax: 10, sinking: 40, fun: 50 } };
    default:
      return { ...base, rule: "ask", wholeBucket: null, ownSplit: null };
  }
}

/** The extra kinds currently on the draft, in chip order. */
export const extraKinds = (draft: Pick<OnboardingDraft, "sources">): Kind[] => {
  const on = new Set(draft.sources.filter((s) => !s.isMain).map((s) => s.kind));
  return EXTRA_KIND_OPTIONS.map((o) => o.value).filter((k) => on.has(k));
};

/** Main pay plus one source per extra kind (never the main's own kind), all landing where the pay lands. */
export function buildSources(main: MainKind, extras: readonly Kind[], landing: string | null): DraftIncomeSource[] {
  const out = [sourceFor(main, { isMain: true, landsInAccountId: landing })];
  for (const o of EXTRA_KIND_OPTIONS) if (o.value !== main && extras.includes(o.value)) out.push(sourceFor(o.value, { isMain: false, landsInAccountId: landing }));
  return out;
}

/** Change main-pay answers; the sources follow. */
export function setIncome(draft: OnboardingDraft, change: Partial<OnboardingDraft["income"]>): Patch {
  const income = { ...draft.income, ...change };
  return { income, sources: buildSources(income.kind, extraKinds(draft), draft.landingAccountId) };
}

export function toggleExtra(draft: OnboardingDraft, kind: Kind): Patch {
  const has = extraKinds(draft).includes(kind);
  const next = has ? extraKinds(draft).filter((k) => k !== kind) : [...extraKinds(draft), kind];
  return { sources: buildSources(draft.income.kind, next, draft.landingAccountId) };
}

export function setFirstName(value: string): Patch {
  const v = value.slice(0, 40);
  return { firstName: v.trim() === "" ? null : v };
}

/** Entering Income: pay comes monthly unless said otherwise, and the main source always exists. */
export function webIncomeOnEnter(draft: OnboardingDraft): Patch | null {
  const patch: Patch = {};
  if (draft.income.frequency === null) patch.income = { ...draft.income, frequency: "monthly" };
  if (!draft.sources.some((s) => s.isMain)) patch.sources = buildSources(draft.income.kind, extraKinds(draft), draft.landingAccountId);
  return Object.keys(patch).length ? patch : null;
}

export function validateWebIncome(draft: OnboardingDraft, ctx: StepContext): StepError | null {
  const name = (draft.firstName ?? "").trim();
  if (name.length < 1 || name.length > 40) return { field: WEB_FIELDS.name, message: "Tell us what to call you, in 40 letters or fewer." };
  const amount = draft.income.amountMinor;
  if (amount === null || !(amount > 0)) return { field: WEB_FIELDS.amount, message: "Enter about how much you get each time, above ₱0." };
  if (amount > MAX_PAY_MINOR) return { field: WEB_FIELDS.amount, message: "That amount looks too large. Check the number of zeros." };
  if (!draft.income.nextPayday) return { field: WEB_FIELDS.payday, message: "Pick the date of your next payday." };
  if (draft.income.nextPayday < ctx.todayIso) return { field: WEB_FIELDS.payday, message: "Pick your next payday: today or later." };
  if (draft.income.frequency === null) return { field: WEB_FIELDS.frequency, message: "Pick how often you're paid." };
  return null;
}

// ------------------------------------------------------------------ Accounts

type AccountType = DraftAccount["type"];

export const ACCOUNT_PICKS: ReadonlyArray<{ name: string; type: AccountType; label: string }> = [
  { name: "GCash", type: "eWallet", label: "E-wallet" },
  { name: "Maya", type: "eWallet", label: "E-wallet" },
  { name: "BPI", type: "bank", label: "Bank" },
  { name: "BDO", type: "bank", label: "Bank" },
  { name: "Metrobank", type: "bank", label: "Bank" },
  { name: "UnionBank", type: "bank", label: "Bank" },
  { name: "MariBank", type: "savings", label: "Savings" },
  { name: "Tonik", type: "savings", label: "Savings" },
  { name: "GoTyme", type: "savings", label: "Savings" },
  { name: "CIMB", type: "savings", label: "Savings" },
  { name: "Pag-IBIG MP2", type: "investment", label: "Investment" },
  { name: "Cash", type: "cash", label: "Cash" },
];

export const CUSTOM_ACCOUNT_TYPES: ReadonlyArray<{ value: AccountType; label: string }> = [
  { value: "bank", label: "Bank" },
  { value: "eWallet", label: "E-wallet" },
  { value: "savings", label: "Savings" },
  { value: "cash", label: "Cash" },
  { value: "investment", label: "Investment" },
];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank",
  savings: "Savings",
  eWallet: "E-wallet",
  creditCard: "Credit card",
  debitCard: "Debit card",
  investment: "Investment",
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Account ids made at pick time (mobile-shaped, `lib/domain/mobile`). Remembered per user and name for the browser session,
 * so unpicking and picking again, or going Back and forward, hands the same id out and Finish can insert it once.
 */
const issued = new Map<string, string>();
export function accountIdFor(userId: string, name: string, existing: readonly DraftAccount[] = []): string {
  const have = existing.find((a) => same(a.name, name));
  if (have) return have.id;
  const key = `${userId}:${name.trim().toLowerCase()}`;
  let id = issued.get(key);
  if (!id) {
    id = newUuidV4();
    issued.set(key, id);
  }
  return id;
}

/** Presets in chip order, then custom accounts in the order they were added. */
function ordered(accounts: readonly DraftAccount[]): DraftAccount[] {
  const rank = (a: DraftAccount) => ACCOUNT_PICKS.findIndex((p) => same(p.name, a.name));
  const preset = accounts.filter((a) => rank(a) >= 0).sort((a, b) => rank(a) - rank(b));
  return [...preset, ...accounts.filter((a) => rank(a) < 0)];
}

/** Chips to show: every preset, then the custom accounts picked so far. */
export function accountChips(draft: Pick<OnboardingDraft, "accounts">): Array<{ name: string; type: AccountType; label: string; custom: boolean }> {
  const custom = draft.accounts.filter((a) => !ACCOUNT_PICKS.some((p) => same(p.name, a.name)));
  return [...ACCOUNT_PICKS.map((p) => ({ ...p, custom: false })), ...custom.map((a) => ({ name: a.name, type: a.type, label: ACCOUNT_TYPE_LABEL[a.type], custom: true }))];
}

/** Where the pay lands changed (or went away): every source follows. */
export function setLanding(draft: OnboardingDraft, id: string | null): Patch {
  return { landingAccountId: id, sources: draft.sources.map((s) => ({ ...s, landsInAccountId: id })) };
}

/** Tick or untick an account. Unticking the landing account clears it. */
export function toggleAccount(draft: OnboardingDraft, userId: string, chip: { name: string; type: AccountType }, on: boolean): Patch {
  const found = draft.accounts.find((a) => same(a.name, chip.name));
  if (!on) {
    if (!found) return {};
    const accounts = draft.accounts.filter((a) => a.id !== found.id);
    return { accounts, ...(draft.landingAccountId === found.id ? setLanding({ ...draft, accounts }, null) : {}) };
  }
  if (found) return {};
  const account: DraftAccount = { id: accountIdFor(userId, chip.name, draft.accounts), name: chip.name, type: chip.type, currency: "PHP", isNew: true };
  return { accounts: ordered([...draft.accounts, account]) };
}

/** "Another account" + Add. */
export function addCustomAccount(
  draft: OnboardingDraft,
  userId: string,
  rawName: string,
  type: AccountType,
): { ok: true; patch: Patch; name: string } | { ok: false; message: string } {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (name === "") return { ok: false, message: "Type the account's name first." };
  if (name.length > 40) return { ok: false, message: "Keep the name to 40 letters or fewer." };
  const preset = ACCOUNT_PICKS.find((p) => same(p.name, name));
  if (preset) return { ok: false, message: `${preset.name} is already in the list above. Tick it instead.` };
  if (draft.accounts.some((a) => same(a.name, name))) return { ok: false, message: "You already added an account with that name." };
  const account: DraftAccount = { id: accountIdFor(userId, name), name, type, currency: "PHP", isNew: true };
  return { ok: true, name, patch: { accounts: ordered([...draft.accounts, account]) } };
}

export function validateWebAccounts(draft: OnboardingDraft): StepError | null {
  if (draft.accounts.length === 0) return { field: WEB_FIELDS.firstAccount, message: "Pick at least one place your money sits." };
  if (!draft.landingAccountId || !draft.accounts.some((a) => a.id === draft.landingAccountId)) return { field: WEB_FIELDS.landing, message: "Pick where your pay lands." };
  return null;
}

// ------------------------------------------------------------------ Just track for now (SPEC §7.6)

/**
 * Back from First pay on a just-tracking draft returns to Priorities and undoes the skip: the one-bucket plan is dropped so
 * Your plan suggests afresh. Null when there is nothing to undo.
 */
export function undoSkipOnBack(draft: OnboardingDraft, from: OnboardingDraft["step"]): Patch | null {
  if (from !== "first" || !draft.skipped) return null;
  return { skipped: false, planA: null, planEdited: false, planInputsSig: null, planBOn: true, targetMinor: null, homes: null, homesUserSet: [] };
}

// ------------------------------------------------------------------ Make a plan (SPEC §7.6)

export interface MakePlanSeed {
  profile: { firstName: string | null; onboardingPath: string | null; payFrequency: string | null; nextPaydayDate: string | null };
  /** Live (not deleted) accounts, in display order. */
  accounts: ReadonlyArray<{ id: string; name: string; accountType: number; currency: string; isArchived: boolean }>;
  /** Live, unarchived income sources, oldest first. */
  sources: ReadonlyArray<{ kind: string; landsInAccountId: string | null; categoryId: string | null }>;
  /** The latest pay recorded for the main source (centavos), if any. */
  latestPayMinor: number | null;
  /** What's stored in `user_profiles.onboardingDraft` now (empty after Finish). */
  stored: OnboardingDraft;
}

const MAIN_KINDS = new Set<string>(MAIN_KIND_OPTIONS.map((o) => o.value));
const FREQUENCIES = new Set<string>(WEB_FREQUENCY_OPTIONS.map((o) => o.value));

/** The source the plan is built around: the salary source if there is one, else the oldest. */
export const mainSourceOf = <T extends { kind: string }>(sources: readonly T[]): T | null => sources.find((s) => s.kind === "salary") ?? sources[0] ?? null;

/**
 * The draft "Make a plan" opens: `planOnly`, at Priorities, nothing skipped, seeded from what the user already has
 * (their accounts by id, the account their pay lands in, the main pay's kind, amount and rhythm). An unfinished
 * Make-a-plan draft is kept as it is, so leaving and coming back resumes.
 */
export function makePlanDraft(seed: MakePlanSeed): OnboardingDraft {
  const { stored, profile } = seed;
  if (stored.planOnly) return stored;
  const accounts: DraftAccount[] = [];
  for (const a of seed.accounts) {
    const type = enumName(AccountTypeEnum, a.accountType);
    if (a.isArchived || !type || !(a.currency === "PHP" || a.currency === "AUD" || a.currency === "USD")) continue;
    accounts.push({ id: a.id, name: a.name.trim().slice(0, 60) || "Account", type, currency: a.currency, isNew: false });
  }
  const main = mainSourceOf(seed.sources);
  const landsIn = main?.landsInAccountId ?? null;
  const land = landsIn && accounts.some((a) => a.id === landsIn) ? landsIn : (accounts.find((a) => a.currency === "PHP")?.id ?? null);
  const kind = main && MAIN_KINDS.has(main.kind) ? (main.kind as MainKind) : "salary";
  const pay = seed.latestPayMinor;
  return {
    ...emptyDraft(),
    path: profile.onboardingPath === "app" ? "app" : "web",
    step: "prio",
    skipped: false,
    planOnly: true,
    firstName: profile.firstName,
    income: {
      kind,
      amountMinor: pay !== null && pay > 0 && pay <= MAX_PAY_MINOR ? pay : null,
      frequency: profile.payFrequency && FREQUENCIES.has(profile.payFrequency) ? (profile.payFrequency as Frequency) : null,
      nextPayday: profile.nextPaydayDate && /^\d{4}-\d{2}-\d{2}$/.test(profile.nextPaydayDate) ? profile.nextPaydayDate : null,
      paidInOtherCurrency: false,
    },
    accounts,
    landingAccountId: land,
    billsMinor: stored.billsMinor,
    billKinds: stored.billKinds,
    billsStart: stored.billsStart,
  };
}
