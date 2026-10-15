import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../../lib/database.types";
import { formatPeso } from "../../lib/money";
import { adminClient, createTestUser, type TestUser } from "./helpers/supabase";

/**
 * Sort the money you already have (ticket 34), the owner's case: ₱7,500 came in while just tracking and was sent to
 * Maya, the bank and Cash, all as Spending. Then a plan keeps Fun in Maya and Emergency + Investments in the bank.
 * Run with NEXT_PUBLIC_ONBOARDING_ENABLED=false like the other Today specs.
 */
test.use({ storageState: { cookies: [], origins: [] } });

async function seed(user: TestUser) {
  const db = adminClient();
  const now = Date.now();
  const k = (s: string) => `${s}-${user.id.slice(0, 8)}`;
  const mobile = { user_id: user.id, createdAt: now, updatedAt: now, syncStatus: 2, deletedAt: null };
  const must = (label: string, error: { message: string } | null) => {
    if (error) throw new Error(`seed ${label}: ${error.message}`);
  };
  must("profile", (await db.from("user_profiles").upsert({ user_id: user.id, firstName: "Sol", homeCurrency: "PHP", weekStartsOn: 1, planMode: "plan", onboardedAt: now })).error);
  const acct = (key: string, name: string, type: number, order: number) => ({ ...mobile, id: k(key), name, accountType: type, openingBalanceMinor: 0, currency: "PHP", icon: "wallet", color: null, displayOrder: order, isArchived: false });
  must("accounts", (await db.from("accounts").insert([acct("gc", "GCash", 3, 1), acct("maya", "Maya", 3, 2), acct("bank", "MariBank", 1, 3), acct("cash", "Cash", 0, 4)])).error);
  const { data: buckets, error } = await db
    .from("buckets")
    .insert([
      { user_id: user.id, name: "Living", groupKey: "spend", hue: "living", keptInAccountId: k("gc"), displayOrder: 1 },
      { user_id: user.id, name: "Fun money", groupKey: "spend", hue: "fun", keptInAccountId: k("maya"), displayOrder: 2 },
      { user_id: user.id, name: "Emergency fund", groupKey: "save", hue: "emergency", keptInAccountId: k("bank"), displayOrder: 3 },
      { user_id: user.id, name: "Investments", groupKey: "save", hue: "invest", keptInAccountId: k("bank"), displayOrder: 4 },
    ])
    .select("id, name");
  must("buckets", error);
  const b = Object.fromEntries((buckets ?? []).map((x) => [x.name, x.id]));
  const { data: src } = await db.from("income_sources").insert({ user_id: user.id, name: "Allowance", kind: "allowance", rule: "ask", landsInAccountId: k("gc") }).select("id").single();

  // receive_money runs as the user (auth.uid()), exactly like "Your money" in onboarding.
  const anon = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  must("sign in", (await anon.auth.signInWithPassword({ email: user.email, password: user.password })).error);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  must(
    "receive_money",
    (
      await anon.rpc("receive_money", {
        p_amount: 750_000,
        p_received_in: k("gc"),
        p_source_id: src!.id,
        p_name: "Allowance",
        p_on: today,
        p_lines: [
          { bucketId: b["Living"], destAccountId: k("maya"), amountMinor: 120_000 },
          { bucketId: b["Living"], destAccountId: k("bank"), amountMinor: 500_000 },
          { bucketId: b["Living"], destAccountId: k("cash"), amountMinor: 130_000 },
        ],
      })
    ).error,
  );
}

async function signIn(page: Page, user: TestUser) {
  await page.goto("/sign-in?next=%2Ftoday");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/today");
}

test("sorts money from before the plan into the buckets kept where it already is; accounts don't change", async ({ page }, info) => {
  const user = await createTestUser(`sort-${info.project.name}`);
  await seed(user);
  await signIn(page, user);

  const card = page.getByTestId("sort-money");
  await expect(card).toContainText(`${formatPeso(620_000)} came in before your plan, so it still counts as Living`);
  const maya = card.getByTestId("sort-group-Maya");
  const bank = card.getByTestId("sort-group-MariBank");
  await expect(maya).toContainText(formatPeso(120_000));
  await expect(maya.getByLabel("Fun money")).toHaveValue("1,200");
  await expect(bank.getByLabel("Emergency fund")).toHaveValue("5,000");
  await expect(bank.getByTestId("sort-stays")).toHaveText(`${formatPeso(0)} stays in Living`);
  await expect(card).not.toContainText("Cash"); // no bucket is kept in Cash, so nothing to sort there

  // Too much is caught before anything is sent.
  await bank.getByLabel("Investments").fill("1,000");
  await expect(bank.getByTestId("sort-stays")).toHaveText(`${formatPeso(100_000)} more than is in MariBank`);
  await page.getByTestId("sort-submit").click();
  await expect(card.getByRole("alert")).toHaveText(`That's more than the ${formatPeso(500_000)} in MariBank.`);

  await bank.getByLabel("Emergency fund").fill("4,000");
  await page.getByTestId("sort-submit").click();
  await expect(card).toHaveCount(0);

  await expect(page.getByTestId("slot-living").getByTestId("slot-amount")).toHaveText(formatPeso(130_000));
  await expect(page.getByTestId("slot-fun").getByTestId("slot-amount")).toHaveText(formatPeso(120_000));
  await expect(page.getByTestId("slot-emergency").getByTestId("slot-amount")).toHaveText(formatPeso(400_000));
  await expect(page.getByTestId("slot-invest").getByTestId("slot-amount")).toHaveText(formatPeso(100_000));

  await page.reload();
  await expect(page.getByTestId("shelf")).toBeVisible();
  await expect(page.getByTestId("sort-money")).toHaveCount(0);

  // Nothing moved between accounts: Maya and the bank should hold what they did before.
  await page.goto("/plans/accounts");
  const row = (name: string) => page.getByRole("listitem").filter({ has: page.getByRole("textbox", { name: `Account name for ${name}` }) });
  await expect(row("Maya")).toContainText(formatPeso(120_000));
  await expect(row("MariBank")).toContainText(formatPeso(500_000));
  await expect(row("Cash")).toContainText(formatPeso(130_000));
});

test("Not now hides the card for these amounts, also after a reload", async ({ page }, info) => {
  const user = await createTestUser(`sort-later-${info.project.name}`);
  await seed(user);
  await signIn(page, user);
  await page.getByTestId("sort-money").getByRole("button", { name: "Not now" }).click();
  await expect(page.getByTestId("sort-money")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("shelf")).toBeVisible();
  await expect(page.getByTestId("sort-money")).toHaveCount(0);
});
