/**
 * Zod schemas for rows of the mobile-synced tables as stored in Postgres / returned by PostgREST
 * (`select *`). Keys are camelCase except `user_id`; timestamps are ms-epoch integers; enums are the
 * Dart enum indexes (see ../enums.ts). Schemas are strict: an unknown column means the live schema
 * drifted and the mobile `fromJson` contract must be re-checked.
 */
import { z } from "zod";
import { AccountType, CategoryType, LedgerOrigin, MoneyDirection, SyncStatus } from "../enums";

const safeInt = z.number().int().safe();
const ms = safeInt.min(0);
const nullableMs = ms.nullable();

function enumInt<E extends Record<string, number>>(e: E, what: string) {
  const values = new Set<number>(Object.values(e));
  return safeInt.refine((n) => values.has(n), { error: `${what}: unknown enum index` });
}

export const accountTypeSchema = enumInt(AccountType, "accountType");
export const categoryTypeSchema = enumInt(CategoryType, "categoryType");
export const directionSchema = enumInt(MoneyDirection, "direction");
export const originSchema = enumInt(LedgerOrigin, "origin");
export const syncStatusSchema = enumInt(SyncStatus, "syncStatus");

const idText = z.string().min(1);

export const accountRowSchema = z.strictObject({
  id: idText,
  user_id: z.uuid(),
  name: z.string(),
  accountType: accountTypeSchema,
  openingBalanceMinor: safeInt,
  currency: z.string().min(1),
  icon: z.string(),
  color: z.string().nullable(),
  displayOrder: safeInt,
  isArchived: z.boolean(),
  createdAt: ms,
  updatedAt: ms,
  deletedAt: nullableMs,
  syncStatus: syncStatusSchema,
});

export const categoryRowSchema = z.strictObject({
  id: idText,
  user_id: z.uuid(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  categoryType: categoryTypeSchema,
  isSystem: z.boolean(),
  displayOrder: safeInt,
  createdAt: ms,
  updatedAt: ms,
  deletedAt: nullableMs,
  syncStatus: syncStatusSchema,
});

export const ledgerEntryRowSchema = z.strictObject({
  id: idText,
  user_id: z.uuid(),
  accountId: idText,
  categoryId: z.string().nullable(),
  recurringInstanceId: z.string().nullable(),
  debtId: z.string().nullable(),
  splitId: z.string().nullable(),
  transferId: z.string().nullable(),
  amountMinor: safeInt.min(0),
  direction: directionSchema,
  origin: originSchema,
  occurredAt: ms,
  note: z.string().nullable(),
  metadataJson: z.string().nullable(),
  createdAt: ms,
  updatedAt: ms,
  deletedAt: nullableMs,
  syncStatus: syncStatusSchema,
});

export const transferRowSchema = z.strictObject({
  id: idText,
  user_id: z.uuid(),
  fromAccountId: idText,
  toAccountId: idText,
  note: z.string().nullable(),
  createdAt: ms,
  updatedAt: ms,
  deletedAt: nullableMs,
  syncStatus: syncStatusSchema,
});

export type AccountRow = z.infer<typeof accountRowSchema>;
export type CategoryRow = z.infer<typeof categoryRowSchema>;
export type LedgerEntryRow = z.infer<typeof ledgerEntryRowSchema>;
export type TransferRow = z.infer<typeof transferRowSchema>;

/** Table name -> schema, for the tables the web writes. */
export const MOBILE_ROW_SCHEMAS = {
  accounts: accountRowSchema,
  categories: categoryRowSchema,
  ledger_entries: ledgerEntryRowSchema,
  transfers: transferRowSchema,
} as const;
export type MobileTable = keyof typeof MOBILE_ROW_SCHEMAS;
