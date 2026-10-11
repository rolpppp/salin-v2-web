import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { AccountType, LedgerOrigin, MoneyDirection, enumName } from "@/lib/domain/enums";

type Client = SupabaseClient<Database>;

export type AccountTypeName = keyof typeof AccountType;
/** Labels for the mobile `AccountType` enum (stored integers never change; labels are display only). */
export const ACCOUNT_TYPE_LABELS: Record<AccountTypeName, string> = {
  cash: "Cash",
  bank: "Bank",
  savings: "Savings",
  eWallet: "E-wallet",
  creditCard: "Credit card",
  debitCard: "Debit card",
  investment: "Investment",
};
export const ACCOUNT_TYPE_NAMES = Object.keys(AccountType) as AccountTypeName[];
export const ACCOUNT_CURRENCIES = ["PHP", "AUD", "USD"] as const;

export type AccountUse = { id: string; name: string; hue: string | null };

export type AccountView = {
  id: string;
  name: string;
  type: AccountTypeName;
  currency: string;
  /** PHP accounts: what the buckets say should be here (BR 5.1). Other currencies: null. */
  shouldHoldMinor: number | null;
  /** Non-PHP accounts: received minus transferred out (BR 5.2). PHP accounts: null. */
  retainedMinor: number | null;
  /** The small line under the amount. */
  caption: string;
  buckets: AccountUse[];
  sources: AccountUse[];
  /** First reason it can't be archived, or null when Archive is available (BR 5.3). */
  inUseReason: string | null;
};

export type AccountsData = { active: AccountView[]; archived: { id: string; name: string; currency: string }[] };

/** BR 5.1 wording for the line under "should hold". */
export function holdCaption(bucketKeptHere: boolean, shouldHoldMinor: number): string {
  if (bucketKeptHere) return "should be here, by your buckets";
  if (shouldHoldMinor > 0) return "from earlier paydays, no bucket is kept here now";
  return "no buckets kept here";
}

/** BR 5.2: received (inflows that are not transfers) minus transferred out (outflow transfer legs). Integer centavos. */
export function retained(entries: ReadonlyArray<{ direction: number; origin: number; amountMinor: number }>): number {
  let total = 0;
  for (const e of entries) {
    if (e.direction === MoneyDirection.inflow && e.origin !== LedgerOrigin.transfer) total += e.amountMinor;
    else if (e.direction === MoneyDirection.outflow && e.origin === LedgerOrigin.transfer) total -= e.amountMinor;
  }
  return total;
}

const PAGE = 1000;

export async function getAccountsData(client: Client): Promise<AccountsData> {
  const [accountsRes, bucketsRes, sourcesRes, holdRes, useRes] = await Promise.all([
    client
      .from("accounts")
      .select("id, name, accountType, currency, isArchived, displayOrder")
      .is("deletedAt", null)
      .order("displayOrder")
      .order("id"),
    client.from("buckets").select("id, name, hue, keptInAccountId, displayOrder").is("deletedAt", null).eq("isArchived", false).order("displayOrder").order("id"),
    client.from("income_sources").select("id, name, landsInAccountId, createdAt").is("deletedAt", null).eq("isArchived", false).order("createdAt").order("id"),
    client.rpc("account_should_hold"),
    client.rpc("accounts_in_use"),
  ]);
  for (const r of [accountsRes, bucketsRes, sourcesRes, holdRes, useRes]) if (r.error) throw new Error(r.error.message);

  const accounts = accountsRes.data ?? [];
  const holds = new Map((holdRes.data ?? []).map((h) => [h.account_id, h]));
  const reasons = new Map((useRes.data ?? []).map((u) => [u.account_id, u.reason]));

  // Non-PHP accounts show what they retained: page through their entries (rare and small).
  const foreign = accounts.filter((a) => !a.isArchived && a.currency !== "PHP").map((a) => a.id);
  const retainedBy = new Map<string, number>();
  if (foreign.length > 0) {
    const rows: Array<{ accountId: string; direction: number; origin: number; amountMinor: number }> = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from("ledger_entries")
        .select("accountId, direction, origin, amountMinor")
        .in("accountId", foreign)
        .is("deletedAt", null)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      if ((data ?? []).length < PAGE) break;
    }
    for (const id of foreign) retainedBy.set(id, retained(rows.filter((r) => r.accountId === id)));
  }

  const active: AccountView[] = accounts
    .filter((a) => !a.isArchived)
    .map((a) => {
      const type = (enumName(AccountType, a.accountType) ?? "bank") as AccountTypeName;
      const hold = holds.get(a.id);
      const isPhp = a.currency === "PHP";
      const should = isPhp ? (hold?.should_hold ?? 0) : null;
      return {
        id: a.id,
        name: a.name,
        type,
        currency: a.currency,
        shouldHoldMinor: should,
        retainedMinor: isPhp ? null : (retainedBy.get(a.id) ?? 0),
        caption: isPhp ? holdCaption(hold?.bucket_kept_here ?? false, should ?? 0) : `kept in ${a.currency} after transfers`,
        buckets: (bucketsRes.data ?? []).filter((b) => b.keptInAccountId === a.id).map((b) => ({ id: b.id, name: b.name, hue: b.hue })),
        sources: (sourcesRes.data ?? []).filter((s) => s.landsInAccountId === a.id).map((s) => ({ id: s.id, name: s.name, hue: null })),
        inUseReason: reasons.get(a.id) ?? null,
      };
    });
  const archived = accounts.filter((a) => a.isArchived).map((a) => ({ id: a.id, name: a.name, currency: a.currency }));
  return { active, archived };
}
