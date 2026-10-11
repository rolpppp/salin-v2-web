import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { MoneyDirection } from "@/lib/domain/enums";
import { readDraft, type OnboardingDraft } from "@/lib/onboarding/draft";
import { buildPhoneFacts, phoneBillsFrom, todayIsoIn, windowStartMs, type PhoneFacts, type RawAccount, type RawCategory, type RawEntry, type RawRecurringRule } from "@/lib/onboarding/facts";
import type { StepContext } from "@/lib/onboarding/step";

type Client = SupabaseClient<Database>;

const PAGE = 1000;

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

export interface PhoneLoad {
  facts: PhoneFacts | null;
  ctx: Pick<StepContext, "lastMonthSpendMinor" | "phoneBills">;
}

/**
 * Reads what the phone synced (RLS limits every query to the signed-in user) and shapes it for the app-path steps.
 * `facts` is null while nothing has synced. Throws on any read error so the caller can say so.
 */
export async function loadPhone(client: Client, opts: { nowMs: number; timeZone: string }): Promise<PhoneLoad> {
  const todayIso = todayIsoIn(opts.nowMs, opts.timeZone);
  const since = windowStartMs(todayIso, opts.timeZone);
  const [accounts, categories, entries, rules] = await Promise.all([
    pageAll<RawAccount>((from, to) => client.from("accounts").select("id, name, accountType, currency, isArchived").is("deletedAt", null).order("displayOrder").order("id").range(from, to)),
    pageAll<RawCategory>((from, to) => client.from("categories").select("id, name, categoryType").is("deletedAt", null).order("id").range(from, to)),
    pageAll<RawEntry>((from, to) =>
      client
        .from("ledger_entries")
        .select("id, accountId, categoryId, amountMinor, direction, origin, transferId, occurredAt")
        .is("deletedAt", null)
        .gte("occurredAt", since)
        .order("occurredAt")
        .order("id")
        .range(from, to),
    ),
    pageAll<RawRecurringRule>((from, to) =>
      client.from("recurring_rules").select("amountMinor, frequency, interval, startDate, endDate").is("deletedAt", null).eq("direction", MoneyDirection.outflow).order("id").range(from, to),
    ),
  ]);
  const built = buildPhoneFacts({ accounts, categories, entries, todayIso, timeZone: opts.timeZone });
  return {
    facts: built.facts,
    ctx: { lastMonthSpendMinor: built.facts ? built.lastMonthSpendMinor : null, phoneBills: built.facts ? phoneBillsFrom(rules, opts.nowMs, opts.timeZone) : null },
  };
}

export interface OnboardingLoad {
  /** `user_profiles.onboardedAt` is set. */
  onboarded: boolean;
  draft: OnboardingDraft;
  /** D-29: the account already has synced rows, so the "have you used the app?" question is skipped. */
  autoDetected: boolean;
  facts: PhoneFacts | null;
  ctx: StepContext;
}

/** Everything the onboarding shell needs on a full page load. */
export async function loadOnboarding(client: Client, opts: { userId: string; nowMs: number; timeZone: string }): Promise<OnboardingLoad> {
  const { data, error } = await client.from("user_profiles").select("onboardedAt, onboardingDraft, homeCurrency, deletedAt").eq("user_id", opts.userId).maybeSingle();
  if (error) throw new Error(error.message);
  const profile = data && data.deletedAt === null ? data : null;
  const draft = readDraft(profile?.onboardingDraft ?? null);

  // The web path writes nothing before Finish, so a draft already on it never needs the phone's rows.
  const wantsPhone = draft.path !== "web";
  const phone: PhoneLoad = wantsPhone ? await loadPhone(client, opts) : { facts: null, ctx: { lastMonthSpendMinor: null, phoneBills: null } };
  const autoDetected = draft.path === null && phone.facts !== null;
  const path: "web" | "app" = draft.path ?? (autoDetected ? "app" : "web");
  return {
    onboarded: profile?.onboardedAt != null,
    draft,
    autoDetected,
    facts: phone.facts,
    ctx: { path, todayIso: todayIsoIn(opts.nowMs, opts.timeZone), homeCurrency: profile?.homeCurrency ?? "PHP", ...phone.ctx },
  };
}
