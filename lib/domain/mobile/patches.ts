/**
 * Field patches for editing existing rows of the mobile-synced tables. Each returns only the columns that
 * change plus `updatedAt` (the DB trigger overwrites it with server time; the column is NOT NULL, so we send it).
 * Never touches `deletedAt` (soft delete is `softDelete`) or any other column.
 */
import { AccountType } from "../enums";
import { MobileRowError, validateName } from "./validate";
import type { AccountTypeName } from "./builders";

function stamp(nowMs: number): number {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new MobileRowError("nowMs must be a non-negative integer");
  return nowMs;
}

export function accountRenamePatch(name: string, nowMs: number) {
  return { name: validateName(name), updatedAt: stamp(nowMs) };
}

export function accountRetypePatch(type: AccountTypeName, nowMs: number) {
  return { accountType: AccountType[type], updatedAt: stamp(nowMs) };
}

/** What `archive_account` / `restore_account` write; used to fixture the exact shape mobile will pull. */
export function accountArchivedPatch(isArchived: boolean, nowMs: number) {
  return { isArchived, updatedAt: stamp(nowMs) };
}

export function categoryRenamePatch(name: string, nowMs: number) {
  return { name: validateName(name), updatedAt: stamp(nowMs) };
}
