import { AccountType, CategoryType, LedgerOrigin, MoneyDirection } from "@/lib/domain/enums";
import { buildPhoneFacts, type BuiltPhone, type RawAccount, type RawCategory, type RawEntry } from "./facts";
import { emptyDraft, type OnboardingDraft } from "./draft";
import type { StepContext } from "./step";

/** Test-only fixtures for the onboarding tests: a realistic phone (Sep and Oct 2026) and the draft/ctx that go with it. */
export const TODAY = "2026-10-12";
export const TZ = "Asia/Manila";

/** Noon in Manila on an ISO date. */
export const at = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), 4);

export const accounts: RawAccount[] = [
  { id: "a-gcash", name: "GCash", accountType: AccountType.eWallet, currency: "PHP", isArchived: false },
  { id: "a-bdo", name: "BDO Savings", accountType: AccountType.bank, currency: "PHP", isArchived: false },
  { id: "a-maya", name: "Maya Savings", accountType: AccountType.savings, currency: "PHP", isArchived: false },
  { id: "a-old", name: "Old wallet", accountType: AccountType.cash, currency: "PHP", isArchived: true },
];

export const categories: RawCategory[] = [
  { id: "c-salary", name: "Salary", categoryType: CategoryType.income },
  { id: "c-stipend", name: "DOST Stipend", categoryType: CategoryType.income },
  { id: "c-groc", name: "Groceries", categoryType: CategoryType.expense },
  { id: "c-movies", name: "Movies", categoryType: CategoryType.expense },
  { id: "c-misc", name: "Misc", categoryType: CategoryType.expense },
];

let n = 0;
const entry = (over: Partial<RawEntry> & Pick<RawEntry, "accountId" | "amountMinor" | "direction" | "occurredAt">): RawEntry => ({
  id: `e${++n}`,
  categoryId: null,
  origin: LedgerOrigin.manual,
  transferId: null,
  ...over,
});

export const entries = (): RawEntry[] => {
  n = 0;
  return [
    entry({ id: "sal-aug", accountId: "a-bdo", categoryId: "c-salary", amountMinor: 2_500_000, direction: MoneyDirection.inflow, occurredAt: at("2026-08-07") }),
    entry({ id: "sal-sep", accountId: "a-bdo", categoryId: "c-salary", amountMinor: 2_500_000, direction: MoneyDirection.inflow, occurredAt: at("2026-09-07") }),
    entry({ id: "sal-oct", accountId: "a-bdo", categoryId: "c-salary", amountMinor: 2_500_000, direction: MoneyDirection.inflow, occurredAt: at("2026-10-07") }),
    entry({ id: "dost-oct", accountId: "a-gcash", categoryId: "c-stipend", amountMinor: 700_000, direction: MoneyDirection.inflow, occurredAt: at("2026-10-05") }),
    entry({ id: "groc-sep", accountId: "a-gcash", categoryId: "c-groc", amountMinor: 500_000, direction: MoneyDirection.outflow, occurredAt: at("2026-09-15") }),
    entry({ id: "movie-sep", accountId: "a-gcash", categoryId: "c-movies", amountMinor: 120_000, direction: MoneyDirection.outflow, occurredAt: at("2026-09-20") }),
    entry({ id: "misc-sep", accountId: "a-gcash", categoryId: "c-misc", amountMinor: 30_000, direction: MoneyDirection.outflow, occurredAt: at("2026-09-21") }),
    entry({ id: "groc-oct", accountId: "a-gcash", categoryId: "c-groc", amountMinor: 80_000, direction: MoneyDirection.outflow, occurredAt: at("2026-10-09") }),
    // A transfer leg must never count as income or spending.
    entry({ id: "t-in", accountId: "a-gcash", amountMinor: 300_000, direction: MoneyDirection.inflow, origin: LedgerOrigin.transfer, transferId: "t1", occurredAt: at("2026-10-08") }),
  ];
};

export const phone = (): BuiltPhone => buildPhoneFacts({ accounts, categories, entries: entries(), todayIso: TODAY, timeZone: TZ });
export const facts = () => phone().facts!;

export const ctx = (over: Partial<StepContext> = {}): StepContext => ({ path: "app", todayIso: TODAY, homeCurrency: "PHP", lastMonthSpendMinor: null, phoneBills: null, ...over });

export const plan = (over: Partial<NonNullable<OnboardingDraft["planA"]>> = {}): NonNullable<OnboardingDraft["planA"]> => ({
  living: 40,
  rent: 10,
  fun: 10,
  emergency: 25,
  invest: 5,
  sinking: 10,
  tax: 0,
  buffer: 0,
  ...over,
});

export const appDraft = (over: Partial<OnboardingDraft> = {}): OnboardingDraft => ({ ...emptyDraft(), path: "app", step: "app", ...over });
