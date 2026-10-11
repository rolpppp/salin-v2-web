/**
 * Writes JSON fixtures of every builder's output to tests/mobile-compat/fixtures/<table>/*.json,
 * shaped as PostgREST returns rows to mobile's pull (`select *`, includes `user_id`).
 * Only files prefixed `gen-` are managed (deleted and rewritten); DB-exported fixtures with any other
 * name are left alone. Run: `npx tsx tests/mobile-compat/generate-fixtures.ts`.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MOBILE_ROW_SCHEMAS,
  accountArchivedPatch,
  accountRenamePatch,
  accountRetypePatch,
  categoryRenamePatch,
  accountRowSchema,
  categoryRowSchema,
  newAccountRow,
  newCategoryRow,
  newIncomeEntryRow,
  newSpendingEntryRow,
  newTransferRows,
  softDelete,
  type MobileTable,
} from "../../lib/domain/mobile";

const root = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const userId = "6f1c2a52-8d0e-4c43-9a57-0b6f6d6f1e01";
const t0 = 1_791_700_000_000; // 2026-10-11
const MAX = 1_000_000_000;
const NAME = "Pag-IBIG MP2 ₱ ñ";

const fixtures: Record<MobileTable, Record<string, object>> = {
  accounts: {},
  categories: {},
  ledger_entries: {},
  transfers: {},
};

const acct = (nowMs: number, id: string, name: string, type: Parameters<typeof newAccountRow>[0]["type"], extra = {}) =>
  newAccountRow({ userId, nowMs, id, name, type, ...extra });

fixtures.accounts["gen-cash-default"] = acct(t0, "1791700000001", "Cash", "cash");
fixtures.accounts["gen-ewallet-opening"] = acct(t0 + 1, "1791700000002", "GCash", "eWallet", { openingBalanceMinor: 12_345 });
fixtures.accounts["gen-non-ascii-max"] = acct(t0 + 2, "1791700000003", NAME, "savings", { openingBalanceMinor: MAX, color: "#3F7D58", icon: "bank" });
fixtures.accounts["gen-name-60"] = acct(t0 + 3, "1791700000004", "ñ".repeat(60), "investment");
fixtures.accounts["gen-soft-deleted"] = softDelete(acct(t0 + 4, "1791700000005", "Old card", "creditCard"), t0 + 9_000);

// Plans -> Accounts / Categories (ticket 13): another currency, and rows edited by a patch.
const audBase = acct(t0 + 5, "1791700000006", "AUD savings", "savings", { currency: "AUD" });
fixtures.accounts["gen-aud-account"] = audBase;
fixtures.accounts["gen-usd-account"] = acct(t0 + 6, "1791700000007", "USD wallet", "eWallet", { currency: "USD" });
fixtures.accounts["gen-renamed-retyped"] = accountRowSchema.parse({
  ...fixtures.accounts["gen-cash-default"],
  id: "1791700000008", // distinct id: the sync test loads every fixture into one database
  ...accountRenamePatch("  Wallet ₱ ", t0 + 7_000),
  ...accountRetypePatch("eWallet", t0 + 7_000),
});
fixtures.accounts["gen-archived"] = accountRowSchema.parse({ ...audBase, id: "1791700000009", ...accountArchivedPatch(true, t0 + 8_000) });
fixtures.accounts["gen-restored"] = accountRowSchema.parse({ ...audBase, id: "1791700000010", ...accountArchivedPatch(false, t0 + 8_500) });

const cat = (nowMs: number, id: string, name: string, type: "income" | "expense", extra = {}) =>
  newCategoryRow({ userId, nowMs, id, name, type, ...extra });

fixtures.categories["gen-income-default"] = cat(t0, "1791700000101", "Salary (AU)", "income");
fixtures.categories["gen-expense-custom"] = cat(t0 + 1, "1791700000102", "Kape ☕ & pan", "expense", { color: "#A83232", icon: "food" });
fixtures.categories["gen-renamed"] = categoryRowSchema.parse({
  ...fixtures.categories["gen-expense-custom"],
  id: "1791700000104",
  ...categoryRenamePatch("Kape at pan", t0 + 7_000),
});
fixtures.categories["gen-soft-deleted"] = softDelete(cat(t0 + 2, "1791700000103", NAME, "expense"), t0 + 9_000);

const entry = { userId, accountId: "1791700000001", categoryId: "1791700000101", occurredAt: t0 - 86_400_000 };
fixtures.ledger_entries["gen-income"] = newIncomeEntryRow({ ...entry, nowMs: t0, id: "0b0f9f0e-6f3b-4a1c-8f3e-2f2f0b3c9a01", amountMinor: 1_732_900 });
fixtures.ledger_entries["gen-income-max-note"] = newIncomeEntryRow({
  ...entry, nowMs: t0, id: "0b0f9f0e-6f3b-4a1c-8f3e-2f2f0b3c9a02", amountMinor: MAX, note: `${NAME}\nline 2 "quoted"`,
});
fixtures.ledger_entries["gen-spending-min"] = newSpendingEntryRow({
  ...entry, nowMs: t0, id: "0b0f9f0e-6f3b-4a1c-8f3e-2f2f0b3c9a03", categoryId: "1791700000102", amountMinor: 1,
});
fixtures.ledger_entries["gen-spending-soft-deleted"] = softDelete(
  newSpendingEntryRow({ ...entry, nowMs: t0, id: "0b0f9f0e-6f3b-4a1c-8f3e-2f2f0b3c9a04", categoryId: "1791700000102", amountMinor: 25_000, note: "Jollibee" }),
  t0 + 9_000,
);

// Log spending on the web (ticket 19): outflow, origin manual, an expense category, a typed note, a backdated day (noon Manila).
fixtures.ledger_entries["gen-spending-web-log"] = newSpendingEntryRow({
  ...entry, nowMs: t0, id: "0b0f9f0e-6f3b-4a1c-8f3e-2f2f0b3c9a05", categoryId: "1791700000102", amountMinor: 18_000, note: "Lunch with team", occurredAt: Date.UTC(2026, 9, 10, 4, 0, 0),
});
fixtures.ledger_entries["gen-spending-web-log-max"] = newSpendingEntryRow({
  ...entry, nowMs: t0, id: "0b0f9f0e-6f3b-4a1c-8f3e-2f2f0b3c9a06", categoryId: "1791700000102", amountMinor: 1_000_000_000, occurredAt: t0,
});

const tr = newTransferRows({
  userId, nowMs: t0, id: "1791700000201", fromAccountId: "1791700000001", toAccountId: "1791700000002", amountMinor: 554_528, occurredAt: t0,
});
fixtures.transfers["gen-transfer"] = tr.transfer;
fixtures.ledger_entries["gen-transfer-out"] = tr.outLeg;
fixtures.ledger_entries["gen-transfer-in"] = tr.inLeg;
const trNote = newTransferRows({
  userId, nowMs: t0 + 1, id: "1791700000202", fromAccountId: "1791700000002", toAccountId: "1791700000003", amountMinor: MAX, occurredAt: t0, note: NAME,
});
const trUuid = newTransferRows({
  userId, nowMs: t0 + 2, id: "9d6c1f0e-3a54-4b7e-8c21-5e0a7b4d2f10", fromAccountId: "1791700000001", toAccountId: "1791700000002", amountMinor: 100, occurredAt: t0,
});
fixtures.transfers["gen-transfer-uuid"] = trUuid.transfer;
fixtures.ledger_entries["gen-transfer-uuid-out"] = trUuid.outLeg;
fixtures.ledger_entries["gen-transfer-uuid-in"] = trUuid.inLeg;
fixtures.transfers["gen-transfer-max-note"] = softDelete(trNote.transfer, t0 + 9_000);
fixtures.ledger_entries["gen-transfer-max-note-out"] = softDelete(trNote.outLeg, t0 + 9_000);
fixtures.ledger_entries["gen-transfer-max-note-in"] = softDelete(trNote.inLeg, t0 + 9_000);

for (const table of Object.keys(fixtures) as MobileTable[]) {
  const dir = join(root, table);
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f.startsWith("gen-") && f.endsWith(".json")) rmSync(join(dir, f));
  for (const [name, row] of Object.entries(fixtures[table])) {
    MOBILE_ROW_SCHEMAS[table].parse(row); // fail loudly if a fixture is not a valid stored row
    writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(row, null, 2)}\n`);
  }
}
console.log(`mobile-compat: wrote fixtures to ${root}`);
