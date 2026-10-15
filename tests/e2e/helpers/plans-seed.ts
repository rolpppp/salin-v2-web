/**
 * Test-only seed for the Plans screens (Split plan + Income). Uses the LOCAL service-role key.
 * Everything is keyed to one user so parallel specs never collide.
 */
import { newAccountRow, newCategoryRow, newIncomeEntryRow } from "../../../lib/domain/mobile";
import { adminClient } from "./supabase";

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`plans seed ${label}: ${error.message}`);
};

export type PlansSeed = {
  userId: string;
  bucket: Record<"living" | "emergency" | "fun" | "tax" | "sinking" | "rent" | "dost", string>;
  accounts: { mari: string; gcash: string };
  allocationId: string;
};

/** Buckets, Plan A/B (50/30/20 and 60/20/20 across Living/Emergency/Fun), the Plan B switch, one confirmed payday, three sources. */
export async function seedPlans(userId: string): Promise<PlansSeed> {
  const db = adminClient();
  const now = Date.now();
  const account = (key: string, name: string, order: number) =>
    newAccountRow({ id: `${key}-${userId.slice(0, 8)}`, userId, nowMs: now, name, type: "bank", icon: "wallet", displayOrder: order });
  const mari = account("mari", "MariBank", 0);
  const gcash = account("gcash", "GCash", 1);
  must("accounts", (await db.from("accounts").insert([mari, gcash])).error);

  const keys = ["living", "emergency", "fun", "tax", "sinking", "rent", "dost"] as const;
  const b = Object.fromEntries(keys.map((k) => [k, crypto.randomUUID()])) as PlansSeed["bucket"];
  const bucket = (k: (typeof keys)[number], name: string, group: "spend" | "save" | "set_aside", order: number, acct: string, planless = false) => ({
    id: b[k], user_id: userId, name, shortName: name, groupKey: group, hue: k, note: `${name} note`, keptInAccountId: acct, planless, displayOrder: order,
  });
  must(
    "buckets",
    (
      await db.from("buckets").insert([
        bucket("living", "Living", "spend", 1, mari.id),
        bucket("emergency", "Emergency fund", "save", 2, mari.id),
        bucket("fun", "Fun", "spend", 3, gcash.id),
        bucket("tax", "Tax", "set_aside", 4, mari.id),
        bucket("sinking", "Sinking", "save", 5, mari.id),
        bucket("rent", "Rent", "set_aside", 6, mari.id),
        bucket("dost", "Scholarship", "set_aside", 7, mari.id, true),
      ])
    ).error,
  );

  const planA = crypto.randomUUID();
  const planB = crypto.randomUUID();
  must("plans", (await db.from("allocation_plans").insert([{ id: planA, user_id: userId, key: "A", name: "Plan A" }, { id: planB, user_id: userId, key: "B", name: "Plan B" }])).error);
  const line = (planId: string, bucketId: string, percentBp: number) => ({ user_id: userId, planId, bucketId, percentBp });
  must(
    "plan lines",
    (
      await db.from("allocation_plan_lines").insert([
        line(planA, b.living, 5000), line(planA, b.emergency, 3000), line(planA, b.fun, 2000),
        line(planB, b.living, 6000), line(planB, b.emergency, 2000), line(planB, b.fun, 2000),
      ])
    ).error,
  );
  must(
    "rules",
    (
      await db.from("allocation_rules").insert([
        { user_id: userId, kind: "switch_on_goal", params: { fromPlan: "A", toPlan: "B", bucketId: b.emergency, targetMinor: 5_000_000 } },
        { user_id: userId, kind: "redirect_until_date", params: { fromBucketId: b.rent, toBucketId: b.emergency, untilDate: "2027-01-01" } },
      ])
    ).error,
  );
  must("goal", (await db.from("goals").insert({ user_id: userId, name: "Emergency fund", targetMinor: 5_000_000, linkedBucketId: b.emergency, isPlanSwitch: true })).error);

  // One confirmed payday: an immutable snapshot the edits must never touch.
  const cycle = crypto.randomUUID();
  must("cycle", (await db.from("transfer_cycles").insert({ id: cycle, user_id: userId })).error);
  const allocationId = crypto.randomUUID();
  must(
    "allocation",
    (
      await db.from("allocations").insert([
        { id: allocationId, user_id: userId, bucketId: b.living, amountMinor: 50_000, destAccountId: mari.id, planKey: "A", percentBp: 5000, transferCycleId: cycle },
        { id: crypto.randomUUID(), user_id: userId, bucketId: b.emergency, amountMinor: 30_000, destAccountId: mari.id, planKey: "A", percentBp: 3000, transferCycleId: cycle },
        { id: crypto.randomUUID(), user_id: userId, bucketId: b.fun, amountMinor: 20_000, destAccountId: gcash.id, planKey: "A", percentBp: 2000, transferCycleId: cycle },
      ])
    ).error,
  );

  // Sources: Work (has income, split by plan), Freelance (own split 10/40/50), Gifts (ask).
  const work = crypto.randomUUID();
  const freelance = crypto.randomUUID();
  const gifts = crypto.randomUUID();
  must(
    "sources",
    (
      await db.from("income_sources").insert([
        { id: work, user_id: userId, name: "Work", kind: "salary", rule: "plan", landsInAccountId: mari.id },
        { id: freelance, user_id: userId, name: "Freelance", kind: "side_hustle", rule: "own", landsInAccountId: gcash.id },
        { id: gifts, user_id: userId, name: "Gifts", kind: "gift", rule: "ask", landsInAccountId: mari.id },
      ])
    ).error,
  );
  const sl = (bucketId: string, percentBp: number) => ({ user_id: userId, sourceId: freelance, bucketId, percentBp });
  must("split", (await db.from("income_source_split_lines").insert([sl(b.tax, 1000), sl(b.sinking, 4000), sl(b.fun, 5000)])).error);
  const entryId = `inc-${userId.slice(0, 8)}`;
  const salaryCat = newCategoryRow({ userId, nowMs: now, name: "Salary", type: "income" });
  must("income category", (await db.from("categories").insert(salaryCat)).error);
  const income = newIncomeEntryRow({ id: entryId, userId, nowMs: now, accountId: mari.id, amountMinor: 100_000, occurredAt: now, categoryId: salaryCat.id });
  must("income", (await db.from("ledger_entries").insert(income)).error);
  // Upsert: for an onboarded user the income-recognition trigger has already written this row.
  must("meta", (await db.from("income_meta").upsert({ user_id: userId, ledgerEntryId: entryId, sourceId: work, job: null }, { onConflict: "user_id,ledgerEntryId" })).error);

  return { userId, bucket: b, accounts: { mari: mari.id, gcash: gcash.id }, allocationId };
}

/** The allocations as stored, for "past paydays never change" checks. */
export async function allocationsFor(userId: string) {
  const { data, error } = await adminClient().from("allocations").select("id, bucketId, amountMinor, destAccountId, planKey, percentBp").eq("user_id", userId).order("id");
  if (error) throw new Error(error.message);
  return data;
}

export async function planPercents(userId: string, key: "A" | "B") {
  const db = adminClient();
  const { data: plan, error } = await db.from("allocation_plans").select("id").eq("user_id", userId).eq("key", key).single();
  if (error) throw new Error(error.message);
  const { data, error: e2 } = await db.from("allocation_plan_lines").select("bucketId, percentBp").eq("planId", plan.id).is("deletedAt", null);
  if (e2) throw new Error(e2.message);
  return Object.fromEntries(data.map((l) => [l.bucketId, l.percentBp]));
}
