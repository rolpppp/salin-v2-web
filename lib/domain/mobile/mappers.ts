/** Row (as stored) -> domain model. Enums decoded to names, timestamps kept as ms numbers plus helpers. */
import { AccountType, CategoryType, LedgerOrigin, MoneyDirection, SyncStatus, enumName } from "../enums";
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

export const msToDate = (ms: number): Date => new Date(ms);
export const dateToMs = (d: Date): number => d.getTime();
export const isDeleted = (row: { deletedAt: number | null }): boolean => row.deletedAt !== null;

function name<E extends Record<string, number>>(e: E, v: number): keyof E {
  const n = enumName(e, v);
  if (n === undefined) throw new Error(`unknown enum index ${v}`);
  return n;
}

export interface Account {
  id: string;
  userId: string;
  name: string;
  type: keyof typeof AccountType;
  openingBalanceMinor: number;
  currency: string;
  icon: string;
  color: string | null;
  displayOrder: number;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  syncStatus: keyof typeof SyncStatus;
}

export function accountFromRow(raw: unknown): Account {
  const r: AccountRow = accountRowSchema.parse(raw);
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    type: name(AccountType, r.accountType),
    openingBalanceMinor: r.openingBalanceMinor,
    currency: r.currency,
    icon: r.icon,
    color: r.color,
    displayOrder: r.displayOrder,
    isArchived: r.isArchived,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    syncStatus: name(SyncStatus, r.syncStatus),
  };
}

export interface Category {
  id: string;
  userId: string;
  name: string;
  icon: string;
  color: string;
  type: keyof typeof CategoryType;
  isSystem: boolean;
  displayOrder: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  syncStatus: keyof typeof SyncStatus;
}

export function categoryFromRow(raw: unknown): Category {
  const r: CategoryRow = categoryRowSchema.parse(raw);
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    type: name(CategoryType, r.categoryType),
    isSystem: r.isSystem,
    displayOrder: r.displayOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    syncStatus: name(SyncStatus, r.syncStatus),
  };
}

export interface LedgerEntry {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string | null;
  recurringInstanceId: string | null;
  debtId: string | null;
  splitId: string | null;
  transferId: string | null;
  amountMinor: number;
  direction: keyof typeof MoneyDirection;
  origin: keyof typeof LedgerOrigin;
  occurredAt: number;
  note: string | null;
  metadataJson: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  syncStatus: keyof typeof SyncStatus;
}

export function ledgerEntryFromRow(raw: unknown): LedgerEntry {
  const r: LedgerEntryRow = ledgerEntryRowSchema.parse(raw);
  return {
    id: r.id,
    userId: r.user_id,
    accountId: r.accountId,
    categoryId: r.categoryId,
    recurringInstanceId: r.recurringInstanceId,
    debtId: r.debtId,
    splitId: r.splitId,
    transferId: r.transferId,
    amountMinor: r.amountMinor,
    direction: name(MoneyDirection, r.direction),
    origin: name(LedgerOrigin, r.origin),
    occurredAt: r.occurredAt,
    note: r.note,
    metadataJson: r.metadataJson,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    syncStatus: name(SyncStatus, r.syncStatus),
  };
}

export interface Transfer {
  id: string;
  userId: string;
  fromAccountId: string;
  toAccountId: string;
  note: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  syncStatus: keyof typeof SyncStatus;
}

export function transferFromRow(raw: unknown): Transfer {
  const r: TransferRow = transferRowSchema.parse(raw);
  return {
    id: r.id,
    userId: r.user_id,
    fromAccountId: r.fromAccountId,
    toAccountId: r.toAccountId,
    note: r.note,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    syncStatus: name(SyncStatus, r.syncStatus),
  };
}
