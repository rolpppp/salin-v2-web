import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { LedgerOrigin, MoneyDirection } from "@/lib/domain/enums";
import type { JobKind, PercentLine, RentRedirect, SourceRule } from "@/lib/money";
import { zonedParts } from "@/lib/time";
import {
  doneHow,
  isoDateIn,
  sortQueue,
  type MiAccount,
  type MiBucket,
  type MiDone,
  type MiIncome,
  type MiSource,
  type MoneyInData,
  type PlanContext,
  type SourceKind,
} from "./money-in-model";

type Client = SupabaseClient<Database>;

const PAGE = 1000; // PostgREST's default max_rows
const MANILA = "Asia/Manila"; // SQL reads an income's calendar day in this zone (entry_local_date)
const SOURCE_KINDS: readonly string[] = ["salary", "scholarship", "side_hustle", "allowance", "gift", "refund", "other"];
const SOURCE_RULES: readonly string[] = ["plan", "own", "whole", "ask"];
const JOBS: readonly string[] = ["plan", "own", "whole", "one"];

async function pageAll<T>(run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const asObject = (j: Json): Record<string, Json | undefined> => (j && typeof j === "object" && !Array.isArray(j) ? j : {});
const asString = (j: Json | undefined): string | null => (typeof j === "string" && j !== "" ? j : null);
const asInt = (j: Json | undefined): number | null => (typeof j === "number" && Number.isSafeInteger(j) ? j : null);

export function engineDate(ms: number): string {
  const p = zonedParts(ms, MANILA);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * Everything Money in needs, in one pass. Reads mobile-shaped rows directly (camelCase, ms epoch, integer enums);
 * RLS limits every query to the signed-in user.
 *
 * Waiting income = an inflow (not a transfer, not deleted) with an `income_meta` row and no allocation
 * (DATA_MODEL §7). The set of confirmed entry ids is paged in full because PostgREST has no anti-join;
 * move that into an SQL function if a user ever has tens of thousands of paydays.
 */
export async function getMoneyInData(client: Client, opts: { nowMs: number; timeZone: string; homeCurrency: string }): Promise<MoneyInData> {
  const [bucketRows, accountRows, sourceRows, splitRows, planRows, planLineRows, ruleRows, cycleRes, confirmedIds, metaRows] = await Promise.all([
    pageAll<MiBucket>((from, to) =>
      client
        .from("buckets")
        .select("id, name, shortName, groupKey, hue, keptInAccountId, planless, displayOrder, isArchived")
        .is("deletedAt", null)
        .order("displayOrder")
        .order("id")
        .range(from, to),
    ),
    pageAll<MiAccount>((from, to) =>
      client.from("accounts").select("id, name, currency, isArchived").is("deletedAt", null).order("displayOrder").order("id").range(from, to),
    ),
    pageAll<{ id: string; name: string; kind: string; rule: string; wholeBucketId: string | null; landsInAccountId: string | null; categoryId: string | null; isArchived: boolean }>(
      (from, to) =>
        client
          .from("income_sources")
          .select("id, name, kind, rule, wholeBucketId, landsInAccountId, categoryId, isArchived")
          .is("deletedAt", null)
          .order("createdAt")
          .order("id")
          .range(from, to),
    ),
    pageAll<{ sourceId: string; bucketId: string; percentBp: number }>((from, to) =>
      client.from("income_source_split_lines").select("sourceId, bucketId, percentBp").is("deletedAt", null).order("id").range(from, to),
    ),
    pageAll<{ id: string; key: string }>((from, to) => client.from("allocation_plans").select("id, key").is("deletedAt", null).order("id").range(from, to)),
    pageAll<{ planId: string; bucketId: string; percentBp: number }>((from, to) =>
      client.from("allocation_plan_lines").select("planId, bucketId, percentBp").is("deletedAt", null).order("id").range(from, to),
    ),
    pageAll<{ kind: string; params: Json }>((from, to) =>
      client.from("allocation_rules").select("kind, params, createdAt, id").is("deletedAt", null).order("createdAt").order("id").range(from, to),
    ),
    client.from("transfer_cycles").select("id, closedAt").is("deletedAt", null).order("seq", { ascending: false }).limit(1).maybeSingle(),
    pageAll<{ ledgerEntryId: string | null }>((from, to) =>
      client.from("allocations").select("ledgerEntryId").is("deletedAt", null).order("seq").range(from, to),
    ),
    pageAll<{
      ledgerEntryId: string;
      sourceId: string | null;
      job: string | null;
      oneBucketId: string | null;
      sentMinor: number | null;
      sentCurrency: string | null;
      ledger_entries: { id: string; accountId: string; amountMinor: number; occurredAt: number } | null;
    }>((from, to) =>
      client
        .from("income_meta")
        .select("ledgerEntryId, sourceId, job, oneBucketId, sentMinor, sentCurrency, ledger_entries!inner(id, accountId, amountMinor, occurredAt, direction, origin, deletedAt)")
        .is("deletedAt", null)
        .is("ledger_entries.deletedAt", null)
        .eq("ledger_entries.direction", MoneyDirection.inflow)
        .neq("ledger_entries.origin", LedgerOrigin.transfer)
        .order("ledgerEntryId")
        .range(from, to),
    ),
  ]);
  fail(cycleRes.error);

  const buckets = bucketRows;
  const sources: MiSource[] = sourceRows.map((s) => ({
    id: s.id,
    name: s.name,
    kind: (SOURCE_KINDS.includes(s.kind) ? s.kind : "other") as SourceKind,
    rule: (SOURCE_RULES.includes(s.rule) ? s.rule : "ask") as SourceRule,
    wholeBucketId: s.wholeBucketId,
    landsInAccountId: s.landsInAccountId,
    categoryId: s.categoryId,
    isArchived: s.isArchived,
    splitLines: splitRows.filter((l) => l.sourceId === s.id).map((l): PercentLine => ({ bucketId: l.bucketId, bp: l.percentBp })),
  }));

  // ---- plan context (mirrors engine_emergency_bucket / engine_rent_bucket / active_plan)
  const rules = ruleRows.map((r) => ({ kind: r.kind, params: asObject(r.params) }));
  const switchRule = rules.find((r) => r.kind === "switch_on_goal");
  const redirectRule = rules.find((r) => r.kind === "redirect_until_date");
  const known = new Set(buckets.map((b) => b.id));
  const switchBucket = asString(switchRule?.params.bucketId);
  const emergencyBucketId = (switchBucket && known.has(switchBucket) ? switchBucket : null) ?? buckets.find((b) => b.hue === "emergency")?.id ?? null;
  const rentFrom = asString(redirectRule?.params.fromBucketId);
  const untilDate = asString(redirectRule?.params.untilDate);
  const rentBucketId = (rentFrom && known.has(rentFrom) ? rentFrom : null) ?? buckets.find((b) => b.hue === "rent")?.id ?? null;
  const rentRedirect: RentRedirect | null = redirectRule && untilDate && rentBucketId ? { rentBucketId, startDate: untilDate } : null;
  const switchTarget = asInt(switchRule?.params.targetMinor);
  const planLines = (key: string): PercentLine[] => {
    const plan = planRows.find((p) => p.key === key);
    return plan ? planLineRows.filter((l) => l.planId === plan.id).map((l): PercentLine => ({ bucketId: l.bucketId, bp: l.percentBp })) : [];
  };

  // ---- D-14 measure: the sum of all Emergency allocations ever (deleted incomes excluded, P-4)
  let emergencyAllocatedSoFar = 0;
  if (emergencyBucketId) {
    const rows = await pageAll<{ amountMinor: number; ledger_entries: { deletedAt: number | null } | null }>((from, to) =>
      client
        .from("allocations")
        .select("amountMinor, ledger_entries!inner(deletedAt)")
        .eq("bucketId", emergencyBucketId)
        .is("deletedAt", null)
        .is("ledger_entries.deletedAt", null)
        .order("seq")
        .range(from, to),
    );
    emergencyAllocatedSoFar = rows.reduce((t, r) => t + r.amountMinor, 0);
  }
  const plan: PlanContext = {
    planA: planLines("A"),
    planB: planLines("B"),
    emergencyBucketId,
    rentRedirect,
    emergencyAllocatedSoFar,
    switchTarget: switchTarget ?? 0,
    switchOn: switchRule !== undefined && switchTarget !== null,
  };

  // ---- the queue
  const confirmed = new Set(confirmedIds.map((r) => r.ledgerEntryId).filter((x): x is string => x !== null));
  const incomes: MiIncome[] = sortQueue(
    metaRows
      .filter((m) => m.ledger_entries && !confirmed.has(m.ledgerEntryId))
      .map((m): MiIncome => {
        const le = m.ledger_entries as NonNullable<typeof m.ledger_entries>;
        return {
          id: m.ledgerEntryId,
          sourceId: m.sourceId,
          amountMinor: le.amountMinor,
          occurredAt: le.occurredAt,
          dateIso: isoDateIn(le.occurredAt, opts.timeZone),
          engineDate: engineDate(le.occurredAt),
          accountId: le.accountId,
          metaJob: m.job && JOBS.includes(m.job) ? (m.job as JobKind) : null,
          oneBucketId: m.oneBucketId,
          sentMinor: m.sentMinor,
          sentCurrency: m.sentCurrency,
        };
      }),
  );

  // ---- done list: what the latest transfer cycle holds
  const cycle = cycleRes.data ? { id: cycleRes.data.id, closedAt: cycleRes.data.closedAt } : null;
  let done: MiDone[] = [];
  if (cycle) {
    const rows = await pageAll<{ ledgerEntryId: string | null; bucketId: string; amountMinor: number; ruleTrace: Json; seq: number; ledger_entries: { deletedAt: number | null } | null }>(
      (from, to) =>
        client
          .from("allocations")
          .select("ledgerEntryId, bucketId, amountMinor, ruleTrace, seq, ledger_entries!inner(deletedAt)")
          .eq("transferCycleId", cycle.id)
          .is("deletedAt", null)
          .is("ledger_entries.deletedAt", null)
          .order("seq")
          .range(from, to),
    );
    const byEntry = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.ledgerEntryId) continue;
      byEntry.set(r.ledgerEntryId, [...(byEntry.get(r.ledgerEntryId) ?? []), r]);
    }
    done = [...byEntry].map(([entryId, lines]) => {
      const trace = asObject(lines[0].ruleTrace);
      const names = lines.map((l) => buckets.find((b) => b.id === l.bucketId)?.name ?? "a bucket");
      return {
        entryId,
        name: asString(trace.sourceName) ?? "Income",
        how: doneHow(trace, names),
        amountMinor: lines.reduce((t, l) => t + l.amountMinor, 0),
      };
    });
  }

  return {
    homeCurrency: opts.homeCurrency,
    todayIso: isoDateIn(opts.nowMs, opts.timeZone),
    timeZone: opts.timeZone,
    buckets,
    accounts: accountRows,
    sources,
    incomes,
    done,
    cycle,
    plan,
  };
}
