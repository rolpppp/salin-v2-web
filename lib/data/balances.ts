import { formatAud, formatPeso } from "@/lib/money";
import { LedgerOrigin, MoneyDirection } from "@/lib/domain/enums";

export type AccountRow = {
  id: string;
  name: string;
  accountType: number;
  currency: string;
  openingBalanceMinor: number;
  displayOrder: number;
  isArchived: boolean;
  deletedAt: number | null;
};

export type EntryRow = {
  accountId: string;
  amountMinor: number;
  direction: number;
  origin: number;
  categoryId: string | null;
  occurredAt: number;
  deletedAt: number | null;
};

export type AccountBalance = {
  id: string;
  name: string;
  accountType: number;
  currency: string;
  balanceMinor: number;
};

/**
 * Balance = openingBalanceMinor + sum(inflow) - sum(outflow) over non-deleted entries (BR / DATA_MODEL §1).
 * Integer math only. Archived and deleted accounts are left out. Currencies are never converted.
 */
export function computeBalances(accounts: readonly AccountRow[], entries: readonly EntryRow[]): AccountBalance[] {
  const delta = new Map<string, number>();
  for (const e of entries) {
    if (e.deletedAt !== null) continue;
    const signed = e.direction === MoneyDirection.inflow ? e.amountMinor : -e.amountMinor;
    delta.set(e.accountId, (delta.get(e.accountId) ?? 0) + signed);
  }
  return accounts
    .filter((a) => a.deletedAt === null && !a.isArchived)
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
    .map((a) => ({
      id: a.id,
      name: a.name,
      accountType: a.accountType,
      currency: a.currency,
      balanceMinor: a.openingBalanceMinor + (delta.get(a.id) ?? 0),
    }));
}

export type CategorySpend = { categoryId: string | null; totalMinor: number };
export type CurrencySpend = { currency: string; totalMinor: number; byCategory: CategorySpend[] };

/**
 * Spending in `[startMs, endMs)`: outflows that are not transfer legs and not deleted, grouped by the
 * account's currency (never summed across currencies), then by category, largest first.
 */
export function computeWeekSpending(
  entries: readonly EntryRow[],
  currencyByAccount: ReadonlyMap<string, string>,
  range: { startMs: number; endMs: number },
  homeCurrency = "PHP",
): CurrencySpend[] {
  const groups = new Map<string, Map<string | null, number>>();
  for (const e of entries) {
    if (e.deletedAt !== null) continue;
    if (e.direction !== MoneyDirection.outflow) continue;
    if (e.origin === LedgerOrigin.transfer) continue;
    if (e.occurredAt < range.startMs || e.occurredAt >= range.endMs) continue;
    const currency = currencyByAccount.get(e.accountId);
    if (!currency) continue;
    const cats = groups.get(currency) ?? new Map<string | null, number>();
    cats.set(e.categoryId, (cats.get(e.categoryId) ?? 0) + e.amountMinor);
    groups.set(currency, cats);
  }
  const out: CurrencySpend[] = [];
  for (const [currency, cats] of groups) {
    const byCategory = [...cats].map(([categoryId, totalMinor]) => ({ categoryId, totalMinor }));
    byCategory.sort((a, b) => b.totalMinor - a.totalMinor);
    out.push({ currency, totalMinor: byCategory.reduce((s, c) => s + c.totalMinor, 0), byCategory });
  }
  out.sort((a, b) => Number(b.currency === homeCurrency) - Number(a.currency === homeCurrency) || a.currency.localeCompare(b.currency));
  return out;
}

/** PHP shows ₱, AUD shows A$, any other currency is labelled with its code. No conversion. */
export function formatMoney(minor: number, currency: string): string {
  const code = currency.toUpperCase();
  if (code === "PHP") return formatPeso(minor);
  if (code === "AUD") return formatAud(minor);
  return formatPeso(minor).replace("₱", `${code} `);
}
