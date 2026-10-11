/**
 * Frozen enum map (DATA_MODEL.md §1.3). Mirrors the mobile app's `financial_enums.dart`.
 * The stored integer IS the Dart enum index. NEVER reorder or insert; only append at the end
 * if mobile appends. `enums.test.ts` fails if this drifts from the Dart file.
 */

export const AccountType = { cash: 0, bank: 1, savings: 2, eWallet: 3, creditCard: 4, debitCard: 5, investment: 6 } as const;
export const MoneyDirection = { inflow: 0, outflow: 1 } as const;
export const LedgerOrigin = {
  manual: 0,
  quickAdd: 1,
  recurring: 2,
  transfer: 3,
  debtSettlement: 4,
  splitSettlement: 5,
  adjustment: 6,
  import: 7,
  migration: 8,
} as const;
export const CategoryType = { income: 0, expense: 1 } as const;
export const BudgetPeriod = { weekly: 0, monthly: 1, quarterly: 2, yearly: 3, custom: 4 } as const;
export const RecurringFrequency = { daily: 0, weekly: 1, monthly: 2, quarterly: 3, yearly: 4, custom: 5 } as const;
export const RecurringInstanceStatus = { pending: 0, generated: 1, paid: 2, skipped: 3, cancelled: 4 } as const;
/** Dart: `DebtStatus { active, paid, cancelled }`. */
export const DebtStatus = { active: 0, paid: 1, cancelled: 2 } as const;
/** Dart: `SplitStatus { active, settled, cancelled }`. */
export const SplitStatus = { active: 0, settled: 1, cancelled: 2 } as const;
export const SyncStatus = { localOnly: 0, pendingUpload: 1, synced: 2, pendingDelete: 3, conflicted: 4 } as const;
export const WeekStart = { sunday: 0, monday: 1 } as const;

export const ENUMS = {
  AccountType,
  MoneyDirection,
  LedgerOrigin,
  CategoryType,
  BudgetPeriod,
  RecurringFrequency,
  RecurringInstanceStatus,
  DebtStatus,
  SplitStatus,
  SyncStatus,
  WeekStart,
} as const;

type ValueOf<T> = T[keyof T];
export type AccountType = ValueOf<typeof AccountType>;
export type MoneyDirection = ValueOf<typeof MoneyDirection>;
export type LedgerOrigin = ValueOf<typeof LedgerOrigin>;
export type CategoryType = ValueOf<typeof CategoryType>;
export type BudgetPeriod = ValueOf<typeof BudgetPeriod>;
export type RecurringFrequency = ValueOf<typeof RecurringFrequency>;
export type RecurringInstanceStatus = ValueOf<typeof RecurringInstanceStatus>;
export type DebtStatus = ValueOf<typeof DebtStatus>;
export type SplitStatus = ValueOf<typeof SplitStatus>;
export type SyncStatus = ValueOf<typeof SyncStatus>;
export type WeekStart = ValueOf<typeof WeekStart>;

/** Name of the enum member with this stored integer, or undefined. */
export function enumName<E extends Record<string, number>>(e: E, value: number): keyof E | undefined {
  return (Object.keys(e) as (keyof E)[]).find((k) => e[k] === value);
}
