import { z } from "zod";

/**
 * The onboarding draft (SPEC §7, DATA_MODEL `user_profiles.onboardingDraft`): every answer so far, autosaved so a
 * user can leave and resume on any device. Nothing is written to plan tables until Finish, when
 * `finish_onboarding(draft)` (or `apply_plan_only(draft)` for "Make a plan") turns it into rows in one transaction.
 *
 * This file is the contract between the onboarding UI (tickets 17, 18, 20) and the SQL (tickets 16, 18).
 * Change it only with the PM; bump `v` on any breaking change. The SQL validates the same shape.
 *
 * Conventions:
 * - Money is integer centavos (`*Minor`). Dates are ISO `YYYY-MM-DD` in the user's zone. Percents are whole numbers.
 * - Accounts are referenced by **id** everywhere. App-path accounts use their existing mobile ids. Web-path accounts
 *   are created by the client at pick time with a mobile-shaped id (`lib/domain/mobile`) and `isNew: true`, so refs
 *   stay stable across steps and Finish can insert them idempotently.
 * - Buckets don't exist until Finish, so the draft refers to them by key (`DraftBucket`).
 * - Unanswered fields are null (or empty arrays); a fresh draft is `emptyDraft()`.
 */

export const DRAFT_VERSION = 1 as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minor = z.number().int().min(0).max(1_000_000_000); // ≤ ₱10,000,000.00
const pct = z.number().int().min(0).max(100);
const id = z.string().min(1).max(100);

/** Plan buckets (BR §12.1) plus the planless Scholarship bucket. `rent` is the bills bucket; its display name comes from `billKinds`. */
export const PLAN_BUCKET_KEYS = ["living", "rent", "fun", "emergency", "invest", "sinking", "tax", "buffer"] as const;
export const DRAFT_BUCKET_KEYS = [...PLAN_BUCKET_KEYS, "scholarship"] as const;
export const planBucket = z.enum(PLAN_BUCKET_KEYS);
export const draftBucket = z.enum(DRAFT_BUCKET_KEYS);
export type DraftBucket = z.infer<typeof draftBucket>;

export const STEP_IDS = ["welcome", "app", "income", "accounts", "prio", "plan", "homes", "cats", "first"] as const;
export const stepId = z.enum(STEP_IDS);
export type StepId = z.infer<typeof stepId>;

/** Web path: Income · Accounts · Priorities · Your plan · Where it lives · First pay (SPEC §7.3). */
export const WEB_STEPS: readonly StepId[] = ["income", "accounts", "prio", "plan", "homes", "first"];
/** App path: Your app · Income · Priorities · Your plan · Where it lives · Categories · First pay (SPEC §7.4). */
export const APP_STEPS: readonly StepId[] = ["app", "income", "prio", "plan", "homes", "cats", "first"];
/** "Make a plan" after just tracking (SPEC §7.6): Priorities · Your plan · Where it lives (· Categories on the app path). */
export const planOnlySteps = (path: "web" | "app"): readonly StepId[] => (path === "app" ? ["prio", "plan", "homes", "cats"] : ["prio", "plan", "homes"]);

const percents = z.object({
  living: pct, rent: pct, fun: pct, emergency: pct, invest: pct, sinking: pct, tax: pct, buffer: pct,
});
export type DraftPercents = z.infer<typeof percents>;

const account = z.object({
  id,
  name: z.string().trim().min(1).max(60),
  /** Mobile `AccountType` name. */
  type: z.enum(["cash", "bank", "savings", "eWallet", "creditCard", "debitCard", "investment"]),
  currency: z.enum(["PHP", "AUD", "USD"]),
  /** Web path: created by Finish. App path: false (existing mobile row). */
  isNew: z.boolean(),
});
export type DraftAccount = z.infer<typeof account>;

const incomeSource = z.object({
  /** Stable key within the draft (web: the kind for extras, "main" for the main pay; app: the income category id). */
  key: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["salary", "scholarship", "side_hustle", "allowance", "gift", "refund", "other"]),
  rule: z.enum(["plan", "own", "whole", "ask"]),
  /** For rule `whole`. */
  wholeBucket: draftBucket.nullable(),
  /** For rule `own`: whole percents per plan bucket (Rent excluded); may total ≠ 100, then incomes from it need a job (BR §2.1.4). */
  ownSplit: percents.partial().nullable(),
  landsInAccountId: id.nullable(),
  /** App path: the existing income category this source is recognised by. Web path: null (Finish creates it). */
  categoryId: id.nullable(),
  isMain: z.boolean(),
});
export type DraftIncomeSource = z.infer<typeof incomeSource>;

export const draftSchema = z.object({
  v: z.literal(DRAFT_VERSION),
  path: z.enum(["web", "app"]).nullable(),
  /** Where to resume. */
  step: stepId,
  /** The user picked "Skip the plan, just track for now" (SPEC §7.6, BR §12.7). */
  skipped: z.boolean(),
  /** Re-entry from Today's "Make a plan": Finish calls `apply_plan_only` instead of `finish_onboarding`. */
  planOnly: z.boolean(),

  firstName: z.string().trim().max(40).nullable(),

  /** Main pay. App path: copied from the main detected source (amount = its latest entry). */
  income: z.object({
    kind: z.enum(["salary", "side_hustle", "scholarship", "allowance"]),
    amountMinor: minor.nullable(),
    frequency: z.enum(["monthly", "twice", "biweekly", "weekly", "varies"]).nullable(),
    nextPayday: isoDate.nullable(),
    paidInOtherCurrency: z.boolean(),
  }),
  /** Every income source Finish creates, main pay included (exactly one `isMain`). */
  sources: z.array(incomeSource).max(30),

  /** Accounts in the plan. App path: the synced accounts left ticked; web path: picked chips + custom ones. */
  accounts: z.array(account).max(40),
  landingAccountId: id.nullable(),

  priority: z.enum(["safety", "goal", "grow", "control"]).nullable(),
  /** For priority `goal` (Save for something). */
  goal: z.object({ name: z.string().trim().min(1).max(60), costMinor: minor }).nullable(),
  billsMinor: minor,
  billKinds: z.array(z.enum(["rent", "tuition", "utilities", "internet", "loan"])).max(5),
  /** Bills start later (rent redirect until this date, BR §2.2.2). Null = bills start now. */
  billsStart: isoDate.nullable(),

  preset: z.enum(["suggested", "fifty_thirty_twenty", "simple"]),
  /** Plan A as shown on the plan step. Null until the plan step first renders (then the suggestion is copied in). */
  planA: percents.nullable(),
  /** The user changed a share, so a re-suggestion must not overwrite silently (SPEC §7.3 step 4). */
  planEdited: z.boolean(),
  /** Fingerprint of the answers the suggestion came from; a change re-suggests and says so. */
  planInputsSig: z.string().max(200).nullable(),
  /** Plan B on (only offered when Emergency ≥ 10%, BR §12.1.6). Plan B itself is derived (`planBFrom`). */
  planBOn: z.boolean(),
  /** Safety-net target = Plan B switch = Emergency goal (BR §12.2). */
  targetMinor: minor.nullable(),

  /** Where each bucket lives (account id). Keys absent = not yet suggested. */
  homes: z.partialRecord(draftBucket, id).nullable(),
  /** Buckets whose home the user changed by hand (kept across Back/Continue while the account exists). */
  homesUserSet: z.array(draftBucket).max(9),

  /** App path: expense category id → bucket. `source` per BR §12.5 (`auto` may move later; `user` never). */
  categories: z.record(id, z.object({ bucket: draftBucket, source: z.enum(["auto", "user"]), notSure: z.boolean() })).nullable(),

  /** First pay (SPEC §7.5). */
  firstPay: z.object({
    choice: z.enum(["yes", "later"]).nullable(),
    /**
     * The income entry that gets split. App path: the existing latest main-pay `ledger_entries.id`.
     * Web path: a mobile-shaped id the client generates, so Finish inserts the inflow idempotently.
     */
    entryId: id.nullable(),
    amountMinor: minor.nullable(),
    date: isoDate.nullable(),
    /** Staged "Confirm split" (nothing is written until Finish). */
    splitConfirmed: z.boolean(),
    /** Transfers ticked on the Move-the-money stage, by account pair; Finish records them as real transfers (BR §3.6). */
    ticked: z.array(z.object({ fromAccountId: id, toAccountId: id })).max(20),
    reminder: z.enum(["email", "none"]),
  }),
});

export type OnboardingDraft = z.infer<typeof draftSchema>;

export function emptyDraft(): OnboardingDraft {
  return {
    v: DRAFT_VERSION,
    path: null,
    step: "welcome",
    skipped: false,
    planOnly: false,
    firstName: null,
    income: { kind: "salary", amountMinor: null, frequency: null, nextPayday: null, paidInOtherCurrency: false },
    sources: [],
    accounts: [],
    landingAccountId: null,
    priority: null,
    goal: null,
    billsMinor: 0,
    billKinds: [],
    billsStart: null,
    preset: "suggested",
    planA: null,
    planEdited: false,
    planInputsSig: null,
    planBOn: true,
    targetMinor: null,
    homes: null,
    homesUserSet: [],
    categories: null,
    firstPay: { choice: null, entryId: null, amountMinor: null, date: null, splitConfirmed: false, ticked: [], reminder: "none" },
  };
}

/** Parse what's stored in `user_profiles.onboardingDraft`; anything unreadable (or an old version) starts fresh. */
export function readDraft(stored: unknown): OnboardingDraft {
  const r = draftSchema.safeParse(stored);
  return r.success ? r.data : emptyDraft();
}
