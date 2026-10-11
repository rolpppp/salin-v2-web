/**
 * Id generation matching the mobile app (verified in salin-v2):
 * Mobile uses ms-epoch strings for accounts/categories/transfers and uuid v4 for ledger entries. The id PK is global
 * across users, so the web uses uuid v4 for EVERY row it creates (PM decision). Transfer legs stay
 * `'${transferId}_out'` / `'${transferId}_in'`. Ids are free-form `text`, so reading must accept any text id.
 */

/** UUID v4 (lowercase, like the Dart `uuid` package). */
export function newUuidV4(): string {
  return globalThis.crypto.randomUUID();
}

export const transferOutId = (transferId: string): string => `${transferId}_out`;
export const transferInId = (transferId: string): string => `${transferId}_in`;
