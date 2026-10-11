import { autoMapCategory, type PlanBucket } from "@/lib/money";
import type { DraftAccount, DraftBucket, DraftIncomeSource, OnboardingDraft } from "./draft";
import type { PhoneAccount, PhoneFacts, PhoneIncomeSource } from "./facts";
import { frequencyFromCadence } from "./labels";
import type { StepContext, StepError } from "./step";

/**
 * Pure logic behind the app-path steps (SPEC §7.4): turning what the phone synced into draft answers.
 * Everything takes the draft and the phone facts and returns a patch (or null for "nothing to change").
 */

type Patch = Partial<OnboardingDraft>;
type Rule = DraftIncomeSource["rule"];
export type DraftCategories = NonNullable<OnboardingDraft["categories"]>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// ------------------------------------------------------------------ Your app: accounts in the plan

export function toDraftAccount(a: PhoneAccount): DraftAccount {
  return { id: a.id, name: a.name.trim().slice(0, 60) || "Account", type: a.type, currency: a.currency, isNew: false };
}

/** The account the main pay lands in, as far as the phone says (before the Income step confirms it). */
export function landingDefault(facts: PhoneFacts): string | null {
  const main = facts.sources.find((s) => s.categoryId === facts.mainCategoryId);
  const id = main?.landsInAccountId;
  return id && facts.accounts.some((a) => a.id === id) ? id : null;
}

/** The account that can't be unticked: where the pay lands. */
export function protectedAccountId(draft: OnboardingDraft, facts: PhoneFacts): string | null {
  const id = draft.landingAccountId ?? landingDefault(facts);
  return id && facts.accounts.some((a) => a.id === id) ? id : null;
}

/** First arrival: every synced account is in the plan. */
export function initAccounts(draft: OnboardingDraft, facts: PhoneFacts | null): Patch | null {
  if (!facts || draft.accounts.length > 0 || facts.accounts.length === 0) return null;
  return { accounts: facts.accounts.map(toDraftAccount) };
}

/** Tick or untick one account. The landing account and the last remaining account can't be unticked. */
export function toggleAccount(draft: OnboardingDraft, facts: PhoneFacts, accountId: string, on: boolean): Patch | null {
  if (!on && (accountId === protectedAccountId(draft, facts) || draft.accounts.length <= 1)) return null;
  const ticked = new Set(draft.accounts.map((a) => a.id));
  if (on) ticked.add(accountId);
  else ticked.delete(accountId);
  return { accounts: facts.accounts.filter((a) => ticked.has(a.id)).map(toDraftAccount) };
}

export function validateApp(draft: OnboardingDraft, facts: PhoneFacts | null): StepError | null {
  if (!facts) return { field: "ob-wait", message: "Still waiting for your phone. Turn on sync in the Salin app, or continue without the app." };
  if (draft.accounts.length === 0) return { field: "ob-acct-0", message: "Keep at least one account in your plan." };
  return null;
}

// ------------------------------------------------------------------ Income

export const wholeBucketFor = (kind: DraftIncomeSource["kind"]): DraftBucket => (kind === "scholarship" ? "scholarship" : "living");

function sourceFrom(s: PhoneIncomeSource, isMain: boolean): DraftIncomeSource {
  const rule: Rule = isMain ? "plan" : s.rule;
  return {
    key: s.categoryId,
    name: s.name.trim().slice(0, 60) || "Income",
    kind: s.kind,
    rule,
    wholeBucket: rule === "whole" ? wholeBucketFor(s.kind) : null,
    ownSplit: null,
    landsInAccountId: s.landsInAccountId,
    categoryId: s.categoryId,
    isMain,
  };
}

function withAccount(accounts: DraftAccount[], facts: PhoneFacts, id: string): DraftAccount[] {
  if (accounts.some((a) => a.id === id)) return accounts;
  const a = facts.accounts.find((x) => x.id === id);
  if (!a) return accounts;
  const ticked = new Set([...accounts.map((x) => x.id), id]);
  return facts.accounts.filter((x) => ticked.has(x.id)).map(toDraftAccount);
}

/** Everything the main pay decides: the plan's amount and rhythm, where it lands, and which entry First pay splits. */
function mainPatch(draft: OnboardingDraft, facts: PhoneFacts, main: PhoneIncomeSource, sources: DraftIncomeSource[]): Patch {
  const landing = facts.accounts.some((a) => a.id === main.landsInAccountId) ? main.landsInAccountId : (draft.accounts[0]?.id ?? facts.accounts[0]?.id ?? null);
  return {
    sources,
    income: {
      ...draft.income,
      kind: main.kind === "other" ? "salary" : main.kind,
      amountMinor: main.latestAmountMinor,
      frequency: frequencyFromCadence(main.cadence),
      nextPayday: main.nextPayday,
    },
    landingAccountId: landing,
    accounts: landing ? withAccount(draft.accounts, facts, landing) : draft.accounts,
    firstPay: { ...draft.firstPay, entryId: main.latestEntryId, amountMinor: main.latestAmountMinor, date: main.latestDate },
  };
}

/** First arrival on the Income step: every detected source, the most frequent one as main pay (BR §12.4.3). */
export function initIncome(draft: OnboardingDraft, facts: PhoneFacts | null): Patch | null {
  if (!facts || draft.sources.length > 0 || facts.sources.length === 0) return null;
  const main = facts.sources.find((s) => s.categoryId === facts.mainCategoryId) ?? facts.sources[0];
  if (!main) return null;
  return mainPatch(draft, facts, main, facts.sources.map((s) => sourceFrom(s, s.categoryId === main.categoryId)));
}

/** Pick the main pay. The old main goes back to the rule its kind suggests; the new main always splits by plan. */
export function setMain(draft: OnboardingDraft, facts: PhoneFacts, key: string): Patch | null {
  const main = facts.sources.find((s) => s.categoryId === key);
  if (!main || !draft.sources.some((s) => s.key === key)) return null;
  const sources = draft.sources.map((src): DraftIncomeSource => {
    if (src.key === key) return { ...src, isMain: true, rule: "plan", wholeBucket: null, ownSplit: null };
    if (!src.isMain) return src;
    const was = facts.sources.find((s) => s.categoryId === src.key);
    return was ? sourceFrom(was, false) : { ...src, isMain: false };
  });
  return mainPatch(draft, facts, main, sources);
}

export function setRule(draft: OnboardingDraft, key: string, rule: Rule): Patch | null {
  const target = draft.sources.find((s) => s.key === key);
  if (!target || target.isMain) return null;
  return {
    sources: draft.sources.map((s) => (s.key === key ? { ...s, rule, wholeBucket: rule === "whole" ? (s.wholeBucket ?? wholeBucketFor(s.kind)) : null } : s)),
  };
}

export function validateAppIncome(draft: OnboardingDraft, ctx: StepContext): StepError | null {
  if (draft.sources.length === 0) return { field: "ob-scratch", message: "We didn't find any income on your phone in the last 90 days. Log a payday in the app, or set up from scratch." };
  if (draft.sources.filter((s) => s.isMain).length !== 1 || !draft.landingAccountId) return { field: "ob-main-0", message: "Pick one main pay." };
  const next = draft.income.nextPayday;
  if (!next || !ISO.test(next)) return { field: "ob-next-payday", message: "Add the date of your next main payday." };
  if (next < ctx.todayIso) return { field: "ob-next-payday", message: "Pick a payday that's today or later." };
  return null;
}

// ------------------------------------------------------------------ Categories

/** Home for a category whose bucket is off: Living, or the biggest bucket when Living has no share. */
function fallbackBucket(plan: Record<PlanBucket, number>): PlanBucket {
  if (plan.living > 0) return "living";
  return (Object.keys(plan) as PlanBucket[]).reduce((best, k) => (plan[k] > plan[best] ? k : best), "living" as PlanBucket);
}

/**
 * BR §12.5 over the phone's expense categories and the plan on screen. A hand-picked bucket stays while that bucket
 * is on; automatic mappings are redone; anything whose bucket is off goes back to "not sure" (SPEC §7.4 step 6).
 */
export function mapCategories(draft: OnboardingDraft, facts: PhoneFacts): DraftCategories | null {
  const plan = draft.planA;
  if (!plan) return null;
  const on = (b: DraftBucket): boolean => b !== "scholarship" && plan[b] > 0;
  const out: DraftCategories = {};
  for (const c of facts.expenseCategories) {
    const prev = draft.categories?.[c.id];
    if (prev?.source === "user" && on(prev.bucket)) {
      out[c.id] = prev;
      continue;
    }
    const m = autoMapCategory(c.name, plan, { justTrack: draft.skipped });
    out[c.id] = on(m.bucket) ? { bucket: m.bucket, source: "auto", notSure: !m.sure } : { bucket: fallbackBucket(plan), source: "auto", notSure: true };
  }
  return out;
}

export function initCategories(draft: OnboardingDraft, facts: PhoneFacts | null): Patch | null {
  if (!facts) return null;
  const mapped = mapCategories(draft, facts);
  if (!mapped || JSON.stringify(mapped) === JSON.stringify(draft.categories)) return null;
  return { categories: mapped };
}

/** Set one category's bucket by hand. It stays where the user put it (`source: "user"`). */
export function chooseCategoryBucket(draft: OnboardingDraft, categoryId: string, bucket: DraftBucket): Patch | null {
  const cur = draft.categories?.[categoryId];
  if (!cur) return null;
  return { categories: { ...draft.categories, [categoryId]: { bucket, source: "user", notSure: false } } };
}

// ------------------------------------------------------------------ First pay

/** App path: the entry First pay splits is the latest one of the main source. */
export function initFirstPay(draft: OnboardingDraft, facts: PhoneFacts | null): Patch | null {
  if (!facts || draft.path !== "app") return null;
  const key = draft.sources.find((s) => s.isMain)?.key;
  const main = facts.sources.find((s) => s.categoryId === key);
  if (!main) return null;
  const f = draft.firstPay;
  if (f.entryId === main.latestEntryId && f.amountMinor === main.latestAmountMinor && f.date === main.latestDate) return null;
  return { firstPay: { ...f, entryId: main.latestEntryId, amountMinor: main.latestAmountMinor, date: main.latestDate } };
}

export interface WaitingNote {
  name: string;
  amountMinor: number;
  how: string;
}

/** Other income sitting in Money in and what will happen to each (SPEC §7.4 step 7). */
export function otherIncomeWaiting(draft: OnboardingDraft, facts: PhoneFacts): WaitingNote[] {
  return facts.waiting
    .filter((w) => w.entryId !== draft.firstPay.entryId)
    .map((w) => {
      const src = draft.sources.find((s) => s.key === w.categoryId);
      const how =
        !src || src.rule === "plan"
          ? "split by your plan"
          : src.rule === "ask"
            ? "you'll pick its job"
            : src.rule === "own"
              ? "its own split"
              : src.wholeBucket === "scholarship"
                ? "kept whole in Scholarship"
                : "kept whole";
      return { name: w.name, amountMinor: w.amountMinor, how };
    });
}
