// Tiny helpers for the TS <-> SQL parity test. Talks to a LOCAL database only (see scripts/db-local.sh).
import pg from "pg";

export type Db = InstanceType<typeof pg.Client>;

export const USER = "aaaaaaaa-0000-0000-0000-000000000001";

export const bucketId = (i: number): string => `b0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
export const acctId = (i: number): string => `acc-${i + 1}`;

export async function connect(): Promise<Db> {
  const url = process.env.PARITY_DATABASE_URL;
  if (!url) throw new Error("PARITY_DATABASE_URL is not set. Run `npm run test:parity` (it asks scripts/db-local.sh for the URL).");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) throw new Error(`Refusing to run parity tests against non-local host ${host}`);
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await client.query("select public.split_by_plan(0, 'A', current_date) limit 0");
  } catch (e) {
    await client.end().catch(() => undefined);
    throw new Error(`Cannot use the local database (${url}). Run \`SALIN_DB=... npm run db:reset\` first. ${String(e)}`);
  }
  return client;
}

/** Runs `fn` inside a transaction that is always rolled back, so every case starts from an empty database. */
export async function rolledBack<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    return await fn();
  } finally {
    await db.query("rollback");
  }
}

export async function asUser(db: Db): Promise<void> {
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: USER, role: "authenticated" })]);
}

export async function asAdmin(db: Db): Promise<void> {
  await db.query("reset role");
}

export async function seedUser(db: Db, accounts: number): Promise<void> {
  await db.query("insert into auth.users (id, instance_id, aud, role) values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')", [USER]);
  const rows = Array.from({ length: accounts }, (_, i) => ({ id: acctId(i), name: `Account ${i + 1}`, o: i }));
  await db.query(
    `insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus")
     select r.id, $1, r.name, 1, 0, 'PHP', 'i', r.o, false, 1, 1, 2 from jsonb_to_recordset($2::jsonb) as r(id text, name text, o int)`,
    [USER, JSON.stringify(rows)],
  );
}

export interface BucketSpec {
  /** Index; the bucket's id and display order come from it. */
  i: number;
  hue?: string;
  keptIn: string | null;
}

export async function insertBuckets(db: Db, specs: readonly BucketSpec[]): Promise<void> {
  const rows = specs.map((s) => ({ id: bucketId(s.i), name: `Bucket ${s.i + 1}`, o: s.i, hue: s.hue ?? null, kept: s.keptIn }));
  await db.query(
    `insert into public.buckets (id, user_id, name, "groupKey", hue, "keptInAccountId", "displayOrder")
     select r.id::uuid, $1, r.name, 'spend', r.hue, r.kept, r.o from jsonb_to_recordset($2::jsonb) as r(id text, name text, o int, hue text, kept text)`,
    [USER, JSON.stringify(rows)],
  );
}

export async function insertPlan(db: Db, key: string, lines: readonly { i: number; bp: number }[]): Promise<void> {
  const { rows } = await db.query<{ id: string }>("insert into public.allocation_plans (user_id, key, name) values ($1, $2, $2) returning id", [USER, key]);
  const planId = (rows[0] as { id: string }).id;
  await db.query(
    `insert into public.allocation_plan_lines (user_id, "planId", "bucketId", "percentBp")
     select $1, $2::uuid, r.b::uuid, r.bp from jsonb_to_recordset($3::jsonb) as r(b text, bp int)`,
    [USER, planId, JSON.stringify(lines.map((l) => ({ b: bucketId(l.i), bp: l.bp })))],
  );
}

export async function insertRule(db: Db, kind: "switch_on_goal" | "redirect_until_date" | "active_plan", params: Record<string, unknown>): Promise<void> {
  await db.query("insert into public.allocation_rules (user_id, kind, params) values ($1, $2, $3::jsonb)", [USER, kind, JSON.stringify(params)]);
}

/** Noon in Manila on an ISO date, in epoch ms (the engine reads an income's date in Asia/Manila). */
export function noonManilaMs(isoDate: string): number {
  return Date.parse(`${isoDate}T12:00:00+08:00`);
}
