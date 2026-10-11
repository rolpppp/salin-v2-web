// TS <-> SQL parity: the same seeded random cases go through lib/money (the tested reference) and through the
// Postgres functions in supabase/migrations/*_engine_functions.sql. Results must match exactly.
// Needs a local database with the migrations applied. NOT part of `npm test`; run `npm run test:parity`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bpShare, confirmIncomes, effectivePlanBp, splitByPlan, splitOwn, transferPlan } from "../../lib/money";
import { rng } from "../../lib/money/testkit";
import type { ConfirmIncome, PercentLine, SentCheck, TransferAllocation } from "../../lib/money";
import { DATES, chance, int, pick, randomAmount, randomBps, shuffle } from "./gen";
import type { Rand } from "./gen";
import { USER, acctId, asAdmin, asUser, bucketId, connect, insertBuckets, insertPlan, insertRule, noonManilaMs, rolledBack, seedUser } from "./db";
import type { Db } from "./db";

const SEED = 20261011;
const N_PLAN = 200;
const N_OWN = 100;
const N_TRANSFER = 100;
const N_CONFIRM = 100;

let db: Db;
beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db?.end();
});

const caseRng = (kind: number, i: number): Rand => rng(SEED + kind * 100_003 + i * 7_919);
const ctx = (kind: string, i: number): string => `${kind} case ${i} (seed ${SEED})`;
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

// ------------------------------------------------------------------------------------ split_by_plan

describe("parity: split_by_plan", () => {
  it(`${N_PLAN} random plans, amounts, dates, redirects`, async () => {
    let redirected = 0;
    let tiny = 0;
    let negative = 0;
    for (let i = 0; i < N_PLAN; i++) {
      const r = caseRng(1, i);
      const n = int(r, 2, 9);
      const emIdx = int(r, 0, n - 1);
      const rentIdx = chance(r, 0.7) ? pick(r, range(n).filter((x) => x !== emIdx)) : null;
      let inPlan = shuffle(r, range(n)).slice(0, int(r, 1, n)).sort((a, b) => a - b);
      let bps = randomBps(r, inPlan.length);
      let amount = randomAmount(r);
      const date: string = pick(r, DATES);
      if (chance(r, 0.4)) {
        // hunt for a negative remainder (P-1): tiny amounts and small Emergency shares, deeper than the target can absorb
        for (let tries = 0; tries < 200; tries++) {
          const sub = shuffle(r, range(n)).slice(0, int(r, 2, n)).sort((a, b) => a - b);
          const b = randomBps(r, sub.length);
          const a = int(r, 1, 6);
          const shares = b.map((x) => bpShare(a, x));
          const rem = a - shares.reduce((t, x) => t + x, 0);
          const emShare = sub.includes(emIdx) ? (shares[sub.indexOf(emIdx)] as number) : 0;
          if (rem < 0 && (-rem > emShare || tries > 150)) {
            inPlan = sub;
            bps = b;
            amount = a;
            break;
          }
        }
      }
      const lines: PercentLine[] = inPlan.map((idx, k) => ({ bucketId: bucketId(idx), bp: bps[k] as number }));
      const emByRule = chance(r, 0.5);
      const explicitTo = chance(r, 0.5);
      const rentRule = rentIdx === null ? null : { rentBucketId: bucketId(rentIdx), startDate: "2027-01-01" };
      const opts = { onDate: date, buckets: range(n).map(bucketId), emergencyBucketId: bucketId(emIdx), rentRedirect: rentRule };

      const expected = splitByPlan(amount, lines, opts);
      const expectedBp = effectivePlanBp(lines, opts);

      const actual = await rolledBack(db, async () => {
        await seedUser(db, 2);
        await insertBuckets(db, range(n).map((k) => ({ i: k, hue: !emByRule && k === emIdx ? "emergency" : undefined, keptIn: acctId(0) })));
        await insertPlan(db, "A", inPlan.map((idx, k) => ({ i: idx, bp: bps[k] as number })));
        if (emByRule) await insertRule(db, "switch_on_goal", { bucketId: bucketId(emIdx), targetMinor: 5000000 });
        if (rentIdx !== null) {
          await insertRule(db, "redirect_until_date", { fromBucketId: bucketId(rentIdx), ...(explicitTo ? { toBucketId: bucketId(emIdx) } : {}), untilDate: "2027-01-01" });
        }
        await asUser(db);
        const res = await db.query<{ bucket_id: string; amount: string; percent_bp: number }>("select bucket_id, amount, percent_bp from split_by_plan($1, 'A', $2::date)", [amount, date]);
        await asAdmin(db);
        return res.rows.map((x) => ({ bucketId: x.bucket_id, amount: Number(x.amount), bp: x.percent_bp }));
      });

      expect(actual, ctx("split_by_plan", i)).toEqual(expected.map((l, k) => ({ bucketId: l.bucketId, amount: l.amount, bp: expectedBp[k] })));
      if (opts.onDate < "2027-01-01" && rentIdx !== null) redirected++;
      if (amount <= 20) tiny++;
      if (expectedBp.reduce((t, x) => t + bpShare(amount, x), 0) > amount) negative++;
    }
    expect(redirected).toBeGreaterThanOrEqual(30);
    expect(tiny).toBeGreaterThanOrEqual(30);
    expect(negative).toBeGreaterThanOrEqual(15);
  });
});

// ------------------------------------------------------------------------------------ split_own

describe("parity: split_own", () => {
  it(`${N_OWN} random own splits, including ones that do not total 100%`, async () => {
    for (let i = 0; i < N_OWN; i++) {
      const r = caseRng(2, i);
      const n = int(r, 2, 7);
      const bps = randomBps(r, n);
      if (chance(r, 0.15)) {
        const k = pick(r, range(n).filter((x) => (bps[x] as number) > 0));
        bps[k] = (bps[k] as number) - int(r, 1, bps[k] as number);
      }
      const lines: PercentLine[] = bps.map((bp, k) => ({ bucketId: bucketId(k), bp }));
      const amount = randomAmount(r);
      const expected = splitOwn(amount, lines);

      const run = (): Promise<{ bucketId: string; amount: number }[]> =>
        rolledBack(db, async () => {
          await seedUser(db, 1);
          await insertBuckets(db, range(n).map((k) => ({ i: k, keptIn: acctId(0) })));
          const src = await db.query<{ id: string }>("insert into public.income_sources (user_id, name, kind, rule) values ($1, 'S', 'other', 'own') returning id", [USER]);
          const sourceId = (src.rows[0] as { id: string }).id;
          await db.query(
            `insert into public.income_source_split_lines (user_id, "sourceId", "bucketId", "percentBp") select $1, $2::uuid, r.b::uuid, r.bp from jsonb_to_recordset($3::jsonb) as r(b text, bp int)`,
            [USER, sourceId, JSON.stringify(lines.map((l) => ({ b: l.bucketId, bp: l.bp })))],
          );
          await asUser(db);
          const res = await db.query<{ bucket_id: string; amount: string }>("select bucket_id, amount from split_own($1, $2::uuid)", [amount, sourceId]);
          return res.rows.map((x) => ({ bucketId: x.bucket_id, amount: Number(x.amount) }));
        });

      if (expected.kind === "no_job") {
        await expect(run(), ctx("split_own", i)).rejects.toThrow(/adds to/);
      } else {
        expect(await run(), ctx("split_own", i)).toEqual(expected.lines);
      }
    }
  });
});

// ------------------------------------------------------------------------------------ transfer_plan

interface NormRow {
  kind: "keep" | "transfer";
  from: string;
  to: string;
  amount: number;
  netted: number;
  sent: number;
  done: boolean;
  status: string;
  sendMore: number;
  labels: string[];
}

function normalizeTs(plan: ReturnType<typeof transferPlan>): NormRow[] {
  const keeps: NormRow[] = plan.keeps.map((k) => ({
    kind: "keep",
    from: k.accountId,
    to: k.accountId,
    amount: k.amount,
    netted: k.netted,
    sent: 0,
    done: true,
    status: "keep",
    sendMore: 0,
    labels: k.labels,
  }));
  const transfers: NormRow[] = plan.transfers.map((t) => ({
    kind: "transfer",
    from: t.fromAccountId,
    to: t.toAccountId,
    amount: t.amount,
    netted: t.netted,
    sent: t.sent,
    done: t.done,
    status: t.status,
    sendMore: t.sendMore,
    labels: t.labels,
  }));
  return [...keeps, ...transfers];
}

describe("parity: transfer_plan", () => {
  it(`${N_TRANSFER} random checklists with netting and sent checks`, async () => {
    let netted = 0;
    let withSent = 0;
    let changedBySent = 0;
    for (let i = 0; i < N_TRANSFER; i++) {
      const r = caseRng(3, i);
      const nAcct = int(r, 2, 4);
      const nBucket = 6;
      const nAlloc = int(r, 1, 14);
      const allocs: { from: string; to: string; amount: number; bucket: number }[] = [];
      for (let k = 0; k < nAlloc; k++) {
        const from = int(r, 0, nAcct - 1);
        const to = chance(r, 0.2) ? from : int(r, 0, nAcct - 1);
        const amount = chance(r, 0.4) ? pick(r, [100, 250, 350, 1000, 0]) : randomAmount(r);
        allocs.push({ from: acctId(from), to: acctId(to), amount, bucket: int(r, 0, nBucket - 1) });
      }
      const tsAllocs: TransferAllocation[] = allocs.map((a) => ({ fromAccountId: a.from, destAccountId: a.to, amount: a.amount, label: bucketId(a.bucket) }));

      // sent checks: some equal to what the plan asks, some to the un-netted sum, some arbitrary; one row per pair
      const bare = transferPlan(tsAllocs, []);
      const sentByPair = new Map<string, SentCheck>();
      if (chance(r, 0.6)) {
        for (let k = int(r, 1, 3); k > 0; k--) {
          const a = int(r, 0, nAcct - 1);
          let b = int(r, 0, nAcct - 1);
          if (a === b) b = (a + 1) % nAcct;
          const key = `${a}>${b}`;
          const planned = bare.transfers.find((t) => t.fromAccountId === acctId(a) && t.toAccountId === acctId(b));
          const raw = tsAllocs.filter((x) => x.fromAccountId === acctId(a) && x.destAccountId === acctId(b)).reduce((t, x) => t + x.amount, 0);
          const sentMinor = pick(r, [planned?.amount ?? 0, raw, int(r, 0, Math.max(1, raw)), Math.floor(raw / 2), raw + 5, 0]);
          sentByPair.set(key, { fromAccountId: acctId(a), toAccountId: acctId(b), sentMinor });
        }
      }
      const sent = [...sentByPair.values()];
      const expected = normalizeTs(transferPlan(tsAllocs, sent));

      const actual = await rolledBack(db, async () => {
        await seedUser(db, nAcct);
        await insertBuckets(db, range(nBucket).map((k) => ({ i: k, keptIn: null })));
        const cyc = await db.query<{ id: string }>("insert into public.transfer_cycles (user_id) values ($1) returning id", [USER]);
        const cycle = (cyc.rows[0] as { id: string }).id;
        await db.query(
          `insert into public.ledger_entries (id, user_id, "accountId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus")
           select 'e-' || r.k, $1, r.f, r.amt, 0, 0, 1000, 1, 1, 2 from jsonb_to_recordset($2::jsonb) as r(k int, f text, amt bigint)`,
          [USER, JSON.stringify(allocs.map((a, k) => ({ k, f: a.from, amt: a.amount })))],
        );
        await db.query(
          `insert into public.allocations (user_id, "ledgerEntryId", "bucketId", "amountMinor", "destAccountId", "transferCycleId")
           select $1, 'e-' || r.k, r.b::uuid, r.amt, r.d, $3::uuid from jsonb_to_recordset($2::jsonb) as r(k int, b text, amt bigint, d text) order by r.k`,
          [USER, JSON.stringify(allocs.map((a, k) => ({ k, b: bucketId(a.bucket), amt: a.amount, d: a.to }))), cycle],
        );
        if (sent.length > 0) {
          await db.query(
            `insert into public.transfer_checks (user_id, "fromAccountId", "toAccountId", "sentMinor", "periodKey")
             select $1, r.f, r.t, r.s, $3 from jsonb_to_recordset($2::jsonb) as r(f text, t text, s bigint)`,
            [USER, JSON.stringify(sent.map((s) => ({ f: s.fromAccountId, t: s.toAccountId, s: s.sentMinor }))), cycle],
          );
        }
        await asUser(db);
        const res = await db.query<{
          kind: "keep" | "transfer";
          from_account_id: string;
          to_account_id: string;
          amount: string;
          netted: string;
          sent: string;
          done: boolean;
          status: string;
          send_more: string;
          bucket_ids: string[];
          cycle_id: string;
        }>("select kind, from_account_id, to_account_id, amount, netted, sent, done, status, send_more, bucket_ids::text[] as bucket_ids, cycle_id from transfer_plan()");
        await asAdmin(db);
        return res.rows.map<NormRow>((x) => ({
          kind: x.kind,
          from: x.from_account_id,
          to: x.to_account_id,
          amount: Number(x.amount),
          netted: Number(x.netted),
          sent: Number(x.sent),
          done: x.done,
          status: x.status,
          sendMore: Number(x.send_more),
          labels: x.bucket_ids,
        }));
      });

      expect(actual, ctx("transfer_plan", i)).toEqual(expected);
      if (expected.some((x) => x.netted > 0)) netted++;
      if (expected.some((x) => x.kind === "transfer" && x.sent > 0)) withSent++;
      if (sent.length > 0 && bare.transfers.length > 0 && JSON.stringify(normalizeTs(bare)) !== JSON.stringify(expected)) changedBySent++;
    }
    expect(netted).toBeGreaterThanOrEqual(15);
    expect(withSent).toBeGreaterThanOrEqual(15);
    expect(changedBySent).toBeGreaterThanOrEqual(5);
  });
});

// ------------------------------------------------------------------------------------ confirm_incomes

describe("parity: confirm_incomes", () => {
  it(`${N_CONFIRM} random batches (jobs, plan switch, rent redirect, refusals)`, async () => {
    let refusedCases = 0;
    let comparedCases = 0;
    let switched = 0;
    for (let i = 0; i < N_CONFIRM; i++) {
      const r = caseRng(4, i);
      const n = int(r, 3, 7);
      const nAcct = 3;
      const emIdx = int(r, 0, n - 1);
      const rentIdx = chance(r, 0.7) ? pick(r, range(n).filter((x) => x !== emIdx)) : null;
      const keptIn = range(n).map(() => acctId(int(r, 0, nAcct - 1)));
      const randomPlan = (): { i: number; bp: number }[] => {
        const subset = shuffle(r, range(n)).slice(0, int(r, 1, n)).sort((a, b) => a - b);
        const bps = randomBps(r, subset.length);
        return subset.map((idx, k) => ({ i: idx, bp: bps[k] as number }));
      };
      const planA = randomPlan();
      const planB = randomPlan();
      const target = pick(r, [0, 100, 5000, 100000, 1_000_000, 3_000_000]);
      const toLines = (p: { i: number; bp: number }[]): PercentLine[] => p.map((l) => ({ bucketId: bucketId(l.i), bp: l.bp }));

      interface Inc {
        id: string;
        date: string;
        amount: number;
        landed: string;
        rule: "plan" | "own" | "whole" | "ask";
        whole: number | null;
        own: { i: number; bp: number }[];
        job: "plan" | "own" | "whole" | "one" | null;
        one: number | null;
      }
      const incomes: Inc[] = range(int(r, 1, 4)).map((k) => {
        const ownBps = randomBps(r, n);
        if (chance(r, 0.15)) {
          const j = pick(r, range(n).filter((x) => (ownBps[x] as number) > 0));
          ownBps[j] = (ownBps[j] as number) - int(r, 1, ownBps[j] as number);
        }
        return {
          id: `inc-${String(k).padStart(2, "0")}`,
          date: pick(r, DATES),
          amount: randomAmount(r),
          landed: acctId(int(r, 0, nAcct - 1)),
          rule: pick(r, ["plan", "plan", "own", "whole", "ask"] as const),
          whole: chance(r, 0.9) ? int(r, 0, n - 1) : null,
          own: ownBps.map((bp, j) => ({ i: j, bp })),
          job: chance(r, 0.5) ? null : pick(r, ["plan", "own", "whole", "one"] as const),
          one: chance(r, 0.5) ? null : pick(r, range(n).filter((x) => x !== rentIdx)),
        };
      });

      const tsIncomes: ConfirmIncome[] = incomes.map((x) => ({
        id: x.id,
        date: x.date,
        amount: x.amount,
        choice: { job: x.job, oneBucketId: x.one === null ? null : bucketId(x.one) },
        source: { rule: x.rule, wholeBucketId: x.whole === null ? null : bucketId(x.whole), splitLines: toLines(x.own) },
      }));
      const expected = confirmIncomes(tsIncomes, {
        planA: toLines(planA),
        planB: toLines(planB),
        buckets: range(n).map(bucketId),
        emergencyBucketId: bucketId(emIdx),
        rentRedirect: rentIdx === null ? null : { rentBucketId: bucketId(rentIdx), startDate: "2027-01-01" },
        emergencyAllocatedSoFar: 0,
        switchTarget: target,
        switchOn: true,
      });
      const refused = expected.some((e) => !e.confirmed);

      const run = (): Promise<{ entry: string; bucket: string; amount: number; planKey: string | null; dest: string }[]> =>
        rolledBack(db, async () => {
          await seedUser(db, nAcct);
          await insertBuckets(db, range(n).map((k) => ({ i: k, keptIn: keptIn[k] as string })));
          await insertPlan(db, "A", planA);
          await insertPlan(db, "B", planB);
          await insertRule(db, "switch_on_goal", { fromPlan: "A", toPlan: "B", bucketId: bucketId(emIdx), targetMinor: target });
          if (rentIdx !== null) await insertRule(db, "redirect_until_date", { fromBucketId: bucketId(rentIdx), untilDate: "2027-01-01" });
          for (const x of incomes) {
            const src = await db.query<{ id: string }>(
              `insert into public.income_sources (user_id, name, kind, rule, "wholeBucketId") values ($1, $2, 'other', $3, $4) returning id`,
              [USER, `S ${x.id}`, x.rule, x.whole === null ? null : bucketId(x.whole)],
            );
            const sourceId = (src.rows[0] as { id: string }).id;
            await db.query(
              `insert into public.income_source_split_lines (user_id, "sourceId", "bucketId", "percentBp") select $1, $2::uuid, r.b::uuid, r.bp from jsonb_to_recordset($3::jsonb) as r(b text, bp int)`,
              [USER, sourceId, JSON.stringify(x.own.map((l) => ({ b: bucketId(l.i), bp: l.bp })))],
            );
            await db.query(
              `insert into public.ledger_entries (id, user_id, "accountId", "amountMinor", direction, origin, "occurredAt", "createdAt", "updatedAt", "syncStatus")
               values ($1, $2, $3, $4, 0, 0, $5, 1, 1, 2)`,
              [x.id, USER, x.landed, x.amount, noonManilaMs(x.date)],
            );
            await db.query(`insert into public.income_meta (user_id, "ledgerEntryId", "sourceId", job, "oneBucketId") values ($1, $2, $3, $4, $5)`, [
              USER,
              x.id,
              sourceId,
              x.job,
              x.one === null ? null : bucketId(x.one),
            ]);
          }
          await asUser(db);
          const res = await db.query<{ ledgerEntryId: string; bucketId: string; amountMinor: string; planKey: string | null; destAccountId: string }>(
            `select "ledgerEntryId", "bucketId", "amountMinor", "planKey", "destAccountId" from confirm_incomes($1::text[])`,
            [incomes.map((x) => x.id)],
          );
          return res.rows.map((x) => ({ entry: x.ledgerEntryId, bucket: x.bucketId, amount: Number(x.amountMinor), planKey: x.planKey, dest: x.destAccountId }));
        });

      if (refused) {
        refusedCases++;
        await expect(run(), ctx("confirm_incomes (refused)", i)).rejects.toMatchObject({ code: "P0001" });
        continue;
      }
      const flat = expected.flatMap((e) =>
        e.confirmed
          ? e.lines
              .filter((l) => l.amount > 0)
              .map((l) => ({
                entry: e.id,
                bucket: l.bucketId,
                amount: l.amount,
                planKey: e.job === "plan" ? (e.planKey ?? null) : null,
                dest: keptIn[range(n).findIndex((k) => bucketId(k) === l.bucketId)] as string,
              }))
          : [],
      );
      expect(await run(), ctx("confirm_incomes", i)).toEqual(flat);
      comparedCases++;
      if (flat.some((x) => x.planKey === "B")) switched++;
    }
    // the generator must keep exercising both branches, or this test proves nothing
    expect(refusedCases).toBeGreaterThanOrEqual(10);
    expect(comparedCases).toBeGreaterThanOrEqual(30);
    expect(switched).toBeGreaterThanOrEqual(5);
  });
});
