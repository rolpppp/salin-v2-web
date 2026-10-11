/**
 * Pure builders: domain input -> a complete, insertable row for the mobile-synced tables, with every NOT NULL
 * column filled the way the mobile app would fill it. `now` is passed in (ms epoch) so builders stay pure.
 *
 * Note: the DB `updatedAt` trigger (D-16) overwrites `updatedAt` with server time; we still send `now`
 * because the column is NOT NULL.
 */
import { AccountType, CategoryType, LedgerOrigin, MoneyDirection, SyncStatus } from "../enums";
import { MAX_MINOR } from "../../money/core";
import { newUuidV4, transferInId, transferOutId } from "./ids";
import {
  accountRowSchema,
  categoryRowSchema,
  ledgerEntryRowSchema,
  transferRowSchema,
  type AccountRow,
  type CategoryRow,
  type LedgerEntryRow,
  type TransferRow,
} from "./schemas";
import { MobileRowError, validateName } from "./validate";

/** Defaults copied from the mobile app. */
export const MOBILE_DEFAULTS = {
  currency: "PHP",
  accountIcon: "default_icon", // accounts_page.dart
  accountColor: null, // accounts_page.dart passes null
  categoryIcon: "category", // categories_page.dart default
  categoryColor: "#2E6EA6", // categories_page.dart default (Ocean Blue)
  transferNote: "Transfer", // add_transaction_page.dart when note is empty
  /** Rows written by the web are already in Postgres, so they are "synced" when mobile pulls them. */
  syncStatus: SyncStatus.synced,
} as const;

export type AccountTypeName = keyof typeof AccountType;
export type CategoryTypeName = keyof typeof CategoryType;

interface Common {
  userId: string;
  nowMs: number;
}

function assertNowMs(nowMs: number): number {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new MobileRowError("nowMs must be a non-negative integer");
  return nowMs;
}

function assertAmount(amountMinor: number, what = "amount"): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new MobileRowError(`${what} must be a positive integer (centavos)`);
  if (amountMinor > MAX_MINOR) throw new MobileRowError(`${what} must be at most ${MAX_MINOR} centavos`);
  return amountMinor;
}

function base(nowMs: number) {
  return { createdAt: nowMs, updatedAt: nowMs, deletedAt: null, syncStatus: MOBILE_DEFAULTS.syncStatus } as const;
}

export interface NewAccountInput extends Common {
  name: string;
  type: AccountTypeName;
  /** Centavos; mobile rejects negatives, the web follows. */
  openingBalanceMinor?: number;
  icon?: string;
  color?: string | null;
  displayOrder?: number;
  id?: string;
}

export function newAccountRow(input: NewAccountInput): AccountRow {
  const now = assertNowMs(input.nowMs);
  const opening = input.openingBalanceMinor ?? 0;
  if (!Number.isSafeInteger(opening) || opening < 0 || opening > MAX_MINOR) throw new MobileRowError("openingBalanceMinor out of range");
  return accountRowSchema.parse({
    id: input.id ?? newUuidV4(),
    user_id: input.userId,
    name: validateName(input.name),
    accountType: AccountType[input.type],
    openingBalanceMinor: opening,
    currency: MOBILE_DEFAULTS.currency,
    icon: input.icon ?? MOBILE_DEFAULTS.accountIcon,
    color: input.color === undefined ? MOBILE_DEFAULTS.accountColor : input.color,
    displayOrder: input.displayOrder ?? now,
    isArchived: false,
    ...base(now),
  });
}

export interface NewCategoryInput extends Common {
  name: string;
  type: CategoryTypeName;
  icon?: string;
  color?: string;
  displayOrder?: number;
  id?: string;
}

export function newCategoryRow(input: NewCategoryInput): CategoryRow {
  const now = assertNowMs(input.nowMs);
  return categoryRowSchema.parse({
    id: input.id ?? newUuidV4(),
    user_id: input.userId,
    name: validateName(input.name),
    icon: input.icon ?? MOBILE_DEFAULTS.categoryIcon,
    color: input.color ?? MOBILE_DEFAULTS.categoryColor,
    categoryType: CategoryType[input.type],
    isSystem: false,
    displayOrder: input.displayOrder ?? now,
    ...base(now),
  });
}

interface EntryInput extends Common {
  accountId: string;
  amountMinor: number;
  occurredAt: number;
  note?: string | null;
  id?: string;
}

function entryRow(
  input: EntryInput,
  direction: MoneyDirection,
  origin: LedgerOrigin,
  categoryId: string | null,
  transferId: string | null,
  id: string,
): LedgerEntryRow {
  const now = assertNowMs(input.nowMs);
  return ledgerEntryRowSchema.parse({
    id,
    user_id: input.userId,
    accountId: input.accountId,
    categoryId,
    recurringInstanceId: null,
    debtId: null,
    splitId: null,
    transferId,
    amountMinor: assertAmount(input.amountMinor),
    direction,
    origin,
    occurredAt: assertNowMs(input.occurredAt),
    note: input.note ?? null,
    metadataJson: null,
    ...base(now),
  });
}

export interface NewIncomeEntryInput extends EntryInput {
  /** The income category of the source being ticked (BR: categoryId = the source's income category). */
  categoryId: string;
}

/** Money received: inflow, origin manual. */
export function newIncomeEntryRow(input: NewIncomeEntryInput): LedgerEntryRow {
  if (!input.categoryId) throw new MobileRowError("categoryId is required");
  return entryRow(input, MoneyDirection.inflow, LedgerOrigin.manual, input.categoryId, null, input.id ?? newUuidV4());
}

export interface NewSpendingEntryInput extends EntryInput {
  categoryId: string;
}

/** Logged spending: outflow, origin manual (BR §11). */
export function newSpendingEntryRow(input: NewSpendingEntryInput): LedgerEntryRow {
  if (!input.categoryId) throw new MobileRowError("categoryId is required");
  return entryRow(input, MoneyDirection.outflow, LedgerOrigin.manual, input.categoryId, null, input.id ?? newUuidV4());
}

export interface NewTransferInput extends Common {
  fromAccountId: string;
  toAccountId: string;
  amountMinor: number;
  occurredAt: number;
  note?: string | null;
  /** Transfer id `T`; legs become `T_out` and `T_in`. */
  id?: string;
}

export interface TransferRows {
  transfer: TransferRow;
  outLeg: LedgerEntryRow;
  inLeg: LedgerEntryRow;
}

/**
 * Mobile-style transfer (BR 3.6): a `transfers` row plus two ledger legs (origin transfer, no category).
 * Insert order matters: transfer first (legs have an FK to it).
 */
export function newTransferRows(input: NewTransferInput): TransferRows {
  if (input.fromAccountId === input.toAccountId) throw new MobileRowError("source and destination accounts must differ");
  const now = assertNowMs(input.nowMs);
  const id = input.id ?? newUuidV4();
  const note = input.note?.trim() ? input.note.trim() : MOBILE_DEFAULTS.transferNote;
  const transfer = transferRowSchema.parse({
    id,
    user_id: input.userId,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    note,
    ...base(now),
  });
  const leg = { userId: input.userId, nowMs: now, amountMinor: input.amountMinor, occurredAt: input.occurredAt, note };
  return {
    transfer,
    outLeg: entryRow({ ...leg, accountId: input.fromAccountId }, MoneyDirection.outflow, LedgerOrigin.transfer, null, id, transferOutId(id)),
    inLeg: entryRow({ ...leg, accountId: input.toAccountId }, MoneyDirection.inflow, LedgerOrigin.transfer, null, id, transferInId(id)),
  };
}

/**
 * Soft delete: sets deletedAt (and updatedAt) and leaves everything else alone. Never hard-delete.
 * syncStatus stays `synced`: the row is already server-side, and mobile's pull overwrites by updatedAt.
 */
export function softDelete<R extends { deletedAt: number | null; updatedAt: number }>(row: R, nowMs: number): R {
  return { ...row, deletedAt: assertNowMs(nowMs), updatedAt: nowMs };
}
