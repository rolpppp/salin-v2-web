import { PLAN_BUCKETS, suggestHomes, transferCount } from "@/lib/money/suggest";
import type { HomeAccount, PlanBucket, PlanPercents } from "@/lib/money/suggest";
import type { DraftAccount, DraftBucket, OnboardingDraft } from "./draft";
import { bucketName, effectivePlan, perPay } from "./plan-step";
import type { StepContext } from "./step";

/** Pure logic for the "Where it lives" step (SPEC §7.3 step 5, BR §12.3, §12.7). */

export const HOMES_QUESTION = "Where should each bucket live?";
export const HOMES_REASON = "Money you shouldn't touch is safer in a different account from your spending money. We suggested a home for each; change any.";

/** Accounts that can hold plan money: PHP only (BR §12.3). */
export const phpAccounts = (draft: OnboardingDraft): DraftAccount[] => draft.accounts.filter((a) => a.currency === "PHP");

/** The account pay lands in, falling back to the first PHP account if the saved one is gone. */
export function landingId(draft: OnboardingDraft): string | null {
  const php = phpAccounts(draft);
  if (draft.landingAccountId && php.some((a) => a.id === draft.landingAccountId)) return draft.landingAccountId;
  return php[0]?.id ?? null;
}

export const hasScholarshipSource = (draft: OnboardingDraft): boolean => draft.sources.some((s) => s.kind === "scholarship");

/** Buckets that get a select: those with a share, plus Scholarship when a scholarship source exists. */
export function homeBuckets(draft: OnboardingDraft): DraftBucket[] {
  const plan = effectivePlan(draft);
  const withShare: DraftBucket[] = PLAN_BUCKETS.filter((k) => (plan?.[k] ?? 0) > 0);
  return hasScholarshipSource(draft) ? [...withShare, "scholarship"] : withShare;
}

/**
 * Every bucket's home. Just tracking: all in the landing account. Otherwise the BR §12.3 suggestion, except buckets the
 * user chose by hand (`homesUserSet`) whose chosen account still exists.
 */
export function computeHomes(draft: OnboardingDraft): Partial<Record<DraftBucket, string>> {
  const landing = landingId(draft);
  if (!landing) return {};
  const php = phpAccounts(draft);
  const all: DraftBucket[] = [...PLAN_BUCKETS, "scholarship"];
  if (draft.skipped) return Object.fromEntries(all.map((k) => [k, landing]));
  const accounts: HomeAccount[] = php.map((a) => ({ id: a.id, kind: a.type, currency: a.currency }));
  const sug: Record<PlanBucket, string> = suggestHomes(accounts, landing);
  const out: Partial<Record<DraftBucket, string>> = { ...sug, scholarship: landing };
  for (const k of draft.homesUserSet) {
    const chosen = draft.homes?.[k];
    if (chosen && php.some((a) => a.id === chosen)) out[k] = chosen;
  }
  return out;
}

/** User-set buckets whose account no longer exists drop out of `homesUserSet`. */
function prunedUserSet(draft: OnboardingDraft): DraftBucket[] {
  const php = phpAccounts(draft);
  return draft.homesUserSet.filter((k) => {
    const chosen = draft.homes?.[k];
    return !!chosen && php.some((a) => a.id === chosen);
  });
}

const sameHomes = (a: OnboardingDraft["homes"], b: Partial<Record<DraftBucket, string>>): boolean => {
  if (!a) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k as DraftBucket] !== b[k as DraftBucket]) return false;
  return true;
};

export function homesOnEnter(draft: OnboardingDraft): Partial<OnboardingDraft> | null {
  const homes = computeHomes(draft);
  const userSet = draft.skipped ? [] : prunedUserSet(draft);
  const sameSet = userSet.length === draft.homesUserSet.length;
  if (sameHomes(draft.homes, homes) && sameSet) return null;
  return { homes, homesUserSet: userSet };
}

/** The user picks an account for one bucket. */
export function setHome(draft: OnboardingDraft, bucket: DraftBucket, accountId: string): Partial<OnboardingDraft> {
  const homes = { ...computeHomes(draft), [bucket]: accountId };
  const userSet = draft.homesUserSet.includes(bucket) ? draft.homesUserSet : [...draft.homesUserSet, bucket];
  return { homes, homesUserSet: userSet };
}

export interface PaydayPreview {
  amountMinor: number;
  landing: { id: string; name: string } | null;
  keepMinor: number;
  keepNames: string[];
  sends: Array<{ toId: string; toName: string; amountMinor: number; names: string[] }>;
  /** BR §12.3: distinct homes other than the landing account among buckets with a share. */
  transfers: number;
  text: string;
}

/** "What payday will look like": what stays in the landing account and what is sent where. */
export function paydayPreview(draft: OnboardingDraft, ctx: StepContext): PaydayPreview {
  const landing = landingId(draft);
  const plan: PlanPercents | null = effectivePlan(draft);
  const amount = draft.income.amountMinor ?? 0;
  const empty: PaydayPreview = { amountMinor: amount, landing: null, keepMinor: 0, keepNames: [], sends: [], transfers: 0, text: "" };
  if (!landing || !plan) return empty;
  const effective = computeHomes(draft) as Record<PlanBucket, string>;
  const nameOf = (id: string): string => draft.accounts.find((a) => a.id === id)?.name ?? "";
  const split = perPay(draft, ctx, plan, amount);
  const pairs = new Map<string, { toId: string; toName: string; amountMinor: number; names: string[] }>();
  let keepMinor = 0;
  const keepNames: string[] = [];
  for (const k of PLAN_BUCKETS) {
    const v = split[k];
    if (!v) continue;
    const to: string = effective[k] ?? landing;
    if (to === landing) {
      keepMinor += v;
      keepNames.push(bucketName(draft, k));
    } else {
      const p = pairs.get(to) ?? { toId: to, toName: nameOf(to), amountMinor: 0, names: [] };
      p.amountMinor += v;
      p.names.push(bucketName(draft, k));
      pairs.set(to, p);
    }
  }
  const sends = [...pairs.values()];
  const transfers = sends.length;
  return {
    amountMinor: amount,
    landing: { id: landing, name: nameOf(landing) },
    keepMinor,
    keepNames,
    sends,
    transfers,
    text:
      transfers === 0
        ? "No transfers needed: everything stays where it lands."
        : `${transfers} transfer${transfers > 1 ? "s" : ""} each payday. Fewer homes means fewer transfers.`,
  };
}

/** BR §12.3 count over the plan's shares (same number as the preview when every share is above zero pesos). */
export function transfersEachPayday(draft: OnboardingDraft): number {
  const landing = landingId(draft);
  const plan = effectivePlan(draft);
  if (!landing || !plan) return 0;
  return transferCount(computeHomes(draft) as Record<PlanBucket, string>, plan, landing);
}
