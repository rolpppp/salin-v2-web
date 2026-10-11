/**
 * Log spending (SPEC §8, BR §11): pure logic shared by the sheet and the server action.
 * Money is integer centavos; nothing here touches a float.
 */
import { formatPeso, formatPesoWhole, moneyErrorMessage, parseMoney, safeToSpend, spendingImpact } from "@/lib/money";
import { isValidIsoDate } from "./money-in-model";

export const NOTE_MAX = 60;

export type BucketGroupKey = "spend" | "save" | "set_aside";

export type LogBucket = { id: string; name: string; groupKey: BucketGroupKey; hue: string | null; keptInAccountId: string | null; displayOrder: number };
export type LogCategory = { id: string; name: string; bucketId: string };
export type LogAccount = { id: string; name: string };

export type CategoryOptionGroup = { bucket: LogBucket; categories: LogCategory[] };

export type LogSpendingData = {
  todayIso: string;
  homeCurrency: string;
  groups: CategoryOptionGroup[];
  /** bucket id -> left (centavos), from `bucket_left`. */
  lefts: Record<string, number>;
  /** Σ left over the Spend buckets (BR §4.4). */
  safeMinor: number;
  /** Whole days until the next payday, or null when no payday is set. */
  daysUntilPayday: number | null;
  accounts: LogAccount[];
};

const GROUP_ORDER: Record<BucketGroupKey, number> = { spend: 0, save: 1, set_aside: 2 };

/** Shelf order: Spend, Save & grow, Set aside; inside a group by the bucket's display order. Buckets with no category are left out. */
export function groupCategories(buckets: readonly LogBucket[], categories: readonly LogCategory[]): CategoryOptionGroup[] {
  const ordered = [...buckets].sort((a, b) => GROUP_ORDER[a.groupKey] - GROUP_ORDER[b.groupKey] || a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));
  return ordered
    .map((bucket) => ({ bucket, categories: categories.filter((c) => c.bucketId === bucket.id).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.categories.length > 0);
}

/** Whole calendar days from `todayIso` to `paydayIso` (negative once it has passed); null if either is missing or invalid. */
export function daysUntil(paydayIso: string | null, todayIso: string): number | null {
  if (!paydayIso || !isValidIsoDate(paydayIso) || !isValidIsoDate(todayIso)) return null;
  const ms = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((ms(paydayIso) - ms(todayIso)) / 86_400_000);
}

/** Σ left over the Spend buckets given. */
export function spendSafe(buckets: readonly Pick<LogBucket, "id" | "groupKey">[], lefts: Readonly<Record<string, number>>): number {
  return safeToSpend(buckets.filter((b) => b.groupKey === "spend").map((b) => lefts[b.id] ?? 0));
}

/** SPEC §8: Paid from defaults to the account the category's bucket is kept in, when it is one you can pick. */
export function defaultPaidFrom(bucket: Pick<LogBucket, "keptInAccountId"> | undefined, accounts: readonly LogAccount[]): string {
  if (bucket?.keptInAccountId && accounts.some((a) => a.id === bucket.keptInAccountId)) return bucket.keptInAccountId;
  return accounts[0]?.id ?? "";
}

// ---------------------------------------------------------------- validation (BR §11.2)

export type LogSpendingInput = { amount: string; categoryId: string; note: string; accountId: string; date: string };
export type LogField = "amount" | "category" | "account" | "date";
export type LogSpendingErrors = Partial<Record<LogField, string>>;
export const LOG_FIELD_ORDER: readonly LogField[] = ["amount", "category", "date", "account"];

export type LogSpendingValidation =
  | { ok: true; value: { amountMinor: number; categoryId: string; note: string | null; accountId: string; date: string } }
  | { ok: false; errors: LogSpendingErrors; first: LogField };

/** Amount > 0 and ≤ ₱10,000,000.00, a category, a date that is today or earlier. */
export function validateLogSpending(input: LogSpendingInput, opts: { todayIso: string }): LogSpendingValidation {
  const errors: LogSpendingErrors = {};
  const amount = parseMoney(input.amount);
  if (!amount.ok) errors.amount = moneyErrorMessage("spent", amount.error);
  if (!input.categoryId) errors.category = "Pick a category, so it comes out of the right bucket.";
  if (!isValidIsoDate(input.date)) errors.date = "Pick the date you spent it.";
  else if (input.date > opts.todayIso) errors.date = "Pick today or an earlier date. Spending that hasn't happened yet can't be logged.";
  if (!input.accountId) errors.account = "Pick the account you paid from.";
  const first = LOG_FIELD_ORDER.find((f) => errors[f]);
  if (!amount.ok || first) return { ok: false, errors, first: first ?? "amount" };
  const note = input.note.replace(/[<>"`]/g, "").trim();
  return {
    ok: true,
    value: { amountMinor: amount.minor, categoryId: input.categoryId, note: note === "" ? null : note.slice(0, NOTE_MAX), accountId: input.accountId, date: input.date },
  };
}

// ---------------------------------------------------------------- impact line + flag

export type Impact = {
  bucketName: string;
  isSpendBucket: boolean;
  leftMinor: number;
  /** Set once an amount is typed. */
  leftAfter: number | null;
  /** New safe-to-spend per day after this entry (centavos); Spend buckets with a known payday only. */
  perDayAfter: number | null;
  days: number | null;
};

/** The same formulas as Today (BR §11.3): left − amount, and for Spend buckets floor((safe − amount) / days). */
export function computeImpact(args: {
  bucket: Pick<LogBucket, "name" | "groupKey">;
  leftMinor: number;
  safeMinor: number;
  daysUntilPayday: number | null;
  amountMinor: number | null;
}): Impact {
  const isSpend = args.bucket.groupKey === "spend";
  const days = args.daysUntilPayday === null ? null : Math.max(1, args.daysUntilPayday);
  const base = { bucketName: args.bucket.name, isSpendBucket: isSpend, leftMinor: args.leftMinor, days };
  if (args.amountMinor === null) return { ...base, leftAfter: null, perDayAfter: null };
  const r = spendingImpact({
    bucketLeft: args.leftMinor,
    amount: args.amountMinor,
    safe: args.safeMinor,
    daysUntilPayday: days ?? 1,
    isSpendBucket: isSpend && days !== null,
  });
  return { ...base, leftAfter: r.leftAfter, perDayAfter: r.perDayAfter };
}

/** "From Living: ₱9,500.00 left → ₱9,320.00" as text parts so the sheet can colour the result. */
export function impactParts(i: Impact): { lead: string; after: string | null; negative: boolean; perDay: string | null } {
  const lead = `From ${i.bucketName}: ${formatPeso(i.leftMinor)} left`;
  const after = i.leftAfter === null ? null : formatPeso(i.leftAfter);
  const perDay =
    i.perDayAfter === null || i.days === null ? null : `About ${formatPesoWhole(i.perDayAfter)} a day after this, for ${i.days} ${i.days === 1 ? "day" : "days"}`;
  return { lead, after, negative: (i.leftAfter ?? 0) < 0, perDay };
}

/** What the server returns after a write, recomputed from `bucket_left`. */
export type LoggedImpact = { bucketName: string; bucketLeftMinor: number; isSpendBucket: boolean; perDayMinor: number | null };

/** SPEC §1 Logged flag. */
export function flagText(args: { amountMinor: number; label: string; impact: LoggedImpact }): string {
  const { impact } = args;
  const safe = impact.isSpendBucket && impact.perDayMinor !== null ? ` Safe to spend: about ${formatPesoWhole(impact.perDayMinor)} a day.` : "";
  return `Logged ${formatPeso(args.amountMinor)} for ${args.label}. ${impact.bucketName} has ${formatPeso(impact.bucketLeftMinor)} left.${safe}`;
}
