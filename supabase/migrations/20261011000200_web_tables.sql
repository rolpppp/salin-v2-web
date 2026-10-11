-- =============================================================================
-- Web tables (DATA_MODEL section 2) + RLS + indexes + server-time updatedAt.
-- Excluded on purpose: fx_rates, balance_snapshots (Phase 2).
--
-- Conventions: uuid PK, user_id (default auth.uid()) -> auth.users, camelCase
-- quoted columns, ms-epoch bigint timestamps, bigint money, text enums + CHECK.
--
-- Foreign keys: web -> web are real FKs (RESTRICT where history must be kept,
-- CASCADE for owned child rows). Web -> mobile-synced tables (accounts,
-- categories, ledger_entries, transfers) are real FKs too (the live schema has
-- them), but ONLY with ON DELETE CASCADE or SET NULL, never RESTRICT/NO ACTION:
-- mobile can hard-delete and upsert in batches, and a web row must never block
-- that. Each choice is justified inline. Web rows are only written after the
-- referenced mobile row exists server-side.
--
-- Plan lines per plan summing to 10000 (and own split lines) is NOT a table
-- constraint: it is checked in the save functions (later migration). Own splits
-- may legitimately total != 10000 (BR 2.1.4).
--
-- RLS: select/insert/update with user_id = auth.uid(). Delete policy only on
-- web-only config/snapshot tables; none on allocations, week_reviews, events,
-- user_profiles (see per-table comments).
-- =============================================================================

create or replace function public.now_ms()
returns bigint language sql stable set search_path = ''
as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

-- Same body as in 20261011000100 (idempotent): the new tables must not depend on
-- the D-16-gated migration being applied.
create or replace function public.set_updated_at_ms()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new."updatedAt" := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  return new;
end;
$$;

-- user_profiles: one row per user, PK = user_id. No delete policy (lifecycle
-- follows the auth user via ON DELETE CASCADE).
create table public.user_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  "firstName" text check (char_length("firstName") <= 60),
  "homeCurrency" text not null default 'PHP',
  "weekStartsOn" integer not null default 1 check ("weekStartsOn" in (0, 1)),  -- mobile WeekStart: 0 sunday, 1 monday
  "reviewDay" integer not null default 0 check ("reviewDay" between 0 and 6),   -- 0 sunday .. 6 saturday
  "nextPaydayDate" date,
  "payFrequency" text check ("payFrequency" in ('monthly','twice','biweekly','weekly','varies')),
  "planMode" text not null default 'plan' check ("planMode" in ('plan','track')),
  priority text check (priority in ('safety','goal','grow','control')),
  "onboardingPath" text check ("onboardingPath" in ('web','app')),
  "onboardingDraft" jsonb not null default '{}'::jsonb,
  "onboardedAt" bigint,
  "paydayReminder" text not null default 'none' check ("paydayReminder" in ('email','none')),
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint
);

-- buckets: delete allowed. Web-only config table; hard delete is allowed (history lives in allocations/entry_buckets which restrict deletes of used buckets).
create table public.buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  "shortName" text,
  "groupKey" text not null check ("groupKey" in ('spend','save','set_aside')),
  hue text,
  note text,
  "keptInAccountId" text references public.accounts (id) on delete set null,  -- SET NULL: a mobile delete must not be blocked; bucket just loses its home
  planless boolean not null default false,
  "displayOrder" bigint not null default 0,
  "isArchived" boolean not null default false,
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint
);

-- allocation_plans: delete allowed. Web-only config; lines cascade.
create table public.allocation_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 20),
  name text not null,
  priority text check (priority in ('safety','goal','grow','control')),
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint
);

-- allocation_plan_lines: delete allowed. Web-only config; edited by replacing lines.
create table public.allocation_plan_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  "planId" uuid not null references public.allocation_plans (id) on delete cascade,
  "bucketId" uuid not null references public.buckets (id) on delete restrict,
  "percentBp" integer not null check ("percentBp" between 0 and 10000),
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint
);

-- allocation_rules: delete allowed. Web-only config.
create table public.allocation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('switch_on_goal','redirect_until_date')),
  params jsonb not null default '{}'::jsonb,
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint
);

-- income_sources: delete allowed. Web-only config; income_meta.sourceId restricts deleting a used source.
create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind text not null default 'other' check (kind in ('salary','scholarship','side_hustle','allowance','gift','refund','other')),
  rule text not null default 'ask' check (rule in ('plan','own','whole','ask')),
  "wholeBucketId" uuid references public.buckets (id) on delete restrict,
  "landsInAccountId" text references public.accounts (id) on delete set null,   -- SET NULL: never block a mobile delete
  "categoryId" text references public.categories (id) on delete set null,       -- income category; SET NULL, source then matches nothing
  "isArchived" boolean not null default false,
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint
);

-- income_source_split_lines: delete allowed. Web-only config; may total != 10000 (BR 2.1.4), so no sum constraint.
create table public.income_source_split_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  "sourceId" uuid not null references public.income_sources (id) on delete cascade,
  "bucketId" uuid not null references public.buckets (id) on delete restrict,
  "percentBp" integer not null check ("percentBp" between 0 and 10000),
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint
);

-- income_meta: delete allowed. Web-only; row can be recreated by income recognition. Deleting it before confirmation is harmless.
create table public.income_meta (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  "ledgerEntryId" text not null references public.ledger_entries (id) on delete cascade,  -- CASCADE: meta is meaningless without its income
  "sourceId" uuid references public.income_sources (id) on delete restrict,
  job text check (job in ('plan','own','whole','one')),
  "oneBucketId" uuid references public.buckets (id) on delete restrict,
  "sentMinor" bigint check ("sentMinor" > 0),
  "sentCurrency" text,
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint,
  unique (user_id, "ledgerEntryId")
);

-- allocations: delete NOT allowed. IMMUTABLE (AGENTS 3.4): history is never rewritten. No update and no delete policy, and UPDATE/DELETE privileges are revoked from authenticated. Undo (D-5, Phase 2) will be a SECURITY DEFINER function.
create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- SET NULL (not CASCADE): immutable history must survive a mobile hard delete of the income; amounts stay for reporting.
  "ledgerEntryId" text references public.ledger_entries (id) on delete set null,
  "bucketId" uuid not null references public.buckets (id) on delete restrict,
  "amountMinor" bigint not null check ("amountMinor" >= 0),
  "destAccountId" text references public.accounts (id) on delete set null,  -- snapshot of the bucket's account at confirm time; SET NULL never blocks a mobile delete
  "planKey" text,
  "percentBp" integer check ("percentBp" between 0 and 10000),
  "ruleTrace" jsonb not null default '{}'::jsonb,
  "confirmedAt" bigint not null default public.now_ms(),
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint
);

-- transfer_checks: delete allowed. Web-only checklist state; unticking soft-deletes the mobile transfer rows, this row can be removed.
create table public.transfer_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  "fromAccountId" text not null references public.accounts (id) on delete cascade,  -- CASCADE: mirrors mobile transfers.*AccountId
  "toAccountId" text not null references public.accounts (id) on delete cascade,
  "sentMinor" bigint not null check ("sentMinor" >= 0),
  "transferId" text references public.transfers (id) on delete set null,  -- SET NULL: check row survives a mobile transfer delete
  "periodKey" text not null,
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint,
  check ("fromAccountId" <> "toAccountId"),
  unique (user_id, "periodKey", "fromAccountId", "toAccountId")
);

-- category_buckets: delete allowed. Web-only mapping; removed when its category is removed (BR 6.3).
create table public.category_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  "categoryId" text not null references public.categories (id) on delete cascade,  -- CASCADE: mapping dies with its category
  "bucketId" uuid not null references public.buckets (id) on delete restrict,
  source text not null default 'auto' check (source in ('auto','user')),
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint,
  unique (user_id, "categoryId")
);

-- entry_buckets: delete allowed. Web-only snapshot; deleting is allowed so an entry can be re-bucketed (override flows). Past entries are never recomputed.
create table public.entry_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  "ledgerEntryId" text not null references public.ledger_entries (id) on delete cascade,  -- CASCADE: snapshot dies with its entry
  "bucketId" uuid not null references public.buckets (id) on delete restrict,
  source text not null default 'category' check (source in ('category','override')),
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint,
  unique (user_id, "ledgerEntryId")
);

-- bucket_covers: delete allowed. Web-only; a mistaken cover can be removed (it only nets bucket 'left').
create table public.bucket_covers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  "fromBucketId" uuid not null references public.buckets (id) on delete restrict,
  "toBucketId" uuid not null references public.buckets (id) on delete restrict,
  "amountMinor" bigint not null check ("amountMinor" > 0),
  "occurredAt" bigint not null default public.now_ms(),
  note text,
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint,
  check ("fromBucketId" <> "toBucketId")
);

-- goals: delete allowed. Web-only config.
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  "targetMinor" bigint not null check ("targetMinor" >= 0),
  currency text not null default 'PHP',
  "linkedBucketId" uuid references public.buckets (id) on delete restrict,
  "linkedShareBp" integer not null default 10000 check ("linkedShareBp" between 0 and 10000),
  "isPlanSwitch" boolean not null default false,
  "dueDate" date,
  "isArchived" boolean not null default false,
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint
);

-- week_reviews: delete NOT allowed. Closed weeks are history (store the week close with its check results, BR 8.2): no delete policy.
create table public.week_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  "weekStart" date not null,
  "closedAt" bigint not null default public.now_ms(),
  checks jsonb not null default '{}'::jsonb,
  "safeToSpendMinor" bigint not null default 0,
  observation text,
  "createdAt" bigint not null default public.now_ms(),
  "updatedAt" bigint not null default public.now_ms(),
  "deletedAt" bigint,
  unique (user_id, "weekStart")
);

create unique index allocation_plans_user_key_active_uq on public.allocation_plans (user_id, key) where "deletedAt" is null;
create unique index allocations_entry_bucket_active_uq on public.allocations (user_id, "ledgerEntryId", "bucketId") where "deletedAt" is null;

-- events: append-only analytics (we use a Supabase table, not PostHog).
-- No updatedAt (rows are never updated), no update/delete policy.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  props jsonb not null default '{}'::jsonb,
  "occurredAt" bigint not null default public.now_ms()
);

-- Indexes: user_id on every table, FK / lookup columns, ledger_entries(user_id, occurredAt).
create index buckets_user_idx on public.buckets (user_id);
create index buckets_keptinaccountid_idx on public.buckets ("keptInAccountId");
create index allocation_plans_user_idx on public.allocation_plans (user_id);
create index allocation_plan_lines_user_idx on public.allocation_plan_lines (user_id);
create index allocation_plan_lines_planid_idx on public.allocation_plan_lines ("planId");
create index allocation_plan_lines_bucketid_idx on public.allocation_plan_lines ("bucketId");
create index allocation_rules_user_idx on public.allocation_rules (user_id);
create index income_sources_user_idx on public.income_sources (user_id);
create index income_sources_wholebucketid_idx on public.income_sources ("wholeBucketId");
create index income_sources_landsinaccountid_idx on public.income_sources ("landsInAccountId");
create index income_sources_categoryid_idx on public.income_sources ("categoryId");
create index income_source_split_lines_user_idx on public.income_source_split_lines (user_id);
create index income_source_split_lines_sourceid_idx on public.income_source_split_lines ("sourceId");
create index income_source_split_lines_bucketid_idx on public.income_source_split_lines ("bucketId");
create index income_meta_user_idx on public.income_meta (user_id);
create index income_meta_sourceid_idx on public.income_meta ("sourceId");
create index income_meta_onebucketid_idx on public.income_meta ("oneBucketId");
create index allocations_user_idx on public.allocations (user_id);
create index allocations_ledgerentryid_idx on public.allocations ("ledgerEntryId");
create index allocations_bucketid_idx on public.allocations ("bucketId");
create index transfer_checks_user_idx on public.transfer_checks (user_id);
create index transfer_checks_transferid_idx on public.transfer_checks ("transferId");
create index category_buckets_user_idx on public.category_buckets (user_id);
create index category_buckets_bucketid_idx on public.category_buckets ("bucketId");
create index entry_buckets_user_idx on public.entry_buckets (user_id);
create index entry_buckets_bucketid_idx on public.entry_buckets ("bucketId");
create index bucket_covers_user_idx on public.bucket_covers (user_id);
create index bucket_covers_frombucketid_idx on public.bucket_covers ("fromBucketId");
create index bucket_covers_tobucketid_idx on public.bucket_covers ("toBucketId");
create index goals_user_idx on public.goals (user_id);
create index goals_linkedbucketid_idx on public.goals ("linkedBucketId");
create index week_reviews_user_idx on public.week_reviews (user_id);
create index allocations_destaccountid_idx on public.allocations ("destAccountId");
create index transfer_checks_fromaccountid_idx on public.transfer_checks ("fromAccountId");
create index transfer_checks_toaccountid_idx on public.transfer_checks ("toAccountId");
create index events_user_occurred_idx on public.events (user_id, "occurredAt");
create index ledger_entries_user_occurred_idx on public.ledger_entries (user_id, "occurredAt");

-- RLS + policies + triggers + grants

alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from anon, authenticated;
create policy "user_profiles_select_own" on public.user_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "user_profiles_insert_own" on public.user_profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_profiles_update_own" on public.user_profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.user_profiles to authenticated;
create trigger user_profiles_set_updated_at before insert or update on public.user_profiles
  for each row execute function public.set_updated_at_ms();

alter table public.buckets enable row level security;
revoke all on public.buckets from anon, authenticated;
create policy "buckets_select_own" on public.buckets for select to authenticated using (user_id = (select auth.uid()));
create policy "buckets_insert_own" on public.buckets for insert to authenticated with check (user_id = (select auth.uid()));
create policy "buckets_update_own" on public.buckets for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "buckets_delete_own" on public.buckets for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.buckets to authenticated;
create trigger buckets_set_updated_at before insert or update on public.buckets
  for each row execute function public.set_updated_at_ms();

alter table public.allocation_plans enable row level security;
revoke all on public.allocation_plans from anon, authenticated;
create policy "allocation_plans_select_own" on public.allocation_plans for select to authenticated using (user_id = (select auth.uid()));
create policy "allocation_plans_insert_own" on public.allocation_plans for insert to authenticated with check (user_id = (select auth.uid()));
create policy "allocation_plans_update_own" on public.allocation_plans for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "allocation_plans_delete_own" on public.allocation_plans for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.allocation_plans to authenticated;
create trigger allocation_plans_set_updated_at before insert or update on public.allocation_plans
  for each row execute function public.set_updated_at_ms();

alter table public.allocation_plan_lines enable row level security;
revoke all on public.allocation_plan_lines from anon, authenticated;
create policy "allocation_plan_lines_select_own" on public.allocation_plan_lines for select to authenticated using (user_id = (select auth.uid()));
create policy "allocation_plan_lines_insert_own" on public.allocation_plan_lines for insert to authenticated with check (user_id = (select auth.uid()));
create policy "allocation_plan_lines_update_own" on public.allocation_plan_lines for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "allocation_plan_lines_delete_own" on public.allocation_plan_lines for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.allocation_plan_lines to authenticated;
create trigger allocation_plan_lines_set_updated_at before insert or update on public.allocation_plan_lines
  for each row execute function public.set_updated_at_ms();

alter table public.allocation_rules enable row level security;
revoke all on public.allocation_rules from anon, authenticated;
create policy "allocation_rules_select_own" on public.allocation_rules for select to authenticated using (user_id = (select auth.uid()));
create policy "allocation_rules_insert_own" on public.allocation_rules for insert to authenticated with check (user_id = (select auth.uid()));
create policy "allocation_rules_update_own" on public.allocation_rules for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "allocation_rules_delete_own" on public.allocation_rules for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.allocation_rules to authenticated;
create trigger allocation_rules_set_updated_at before insert or update on public.allocation_rules
  for each row execute function public.set_updated_at_ms();

alter table public.income_sources enable row level security;
revoke all on public.income_sources from anon, authenticated;
create policy "income_sources_select_own" on public.income_sources for select to authenticated using (user_id = (select auth.uid()));
create policy "income_sources_insert_own" on public.income_sources for insert to authenticated with check (user_id = (select auth.uid()));
create policy "income_sources_update_own" on public.income_sources for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "income_sources_delete_own" on public.income_sources for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.income_sources to authenticated;
create trigger income_sources_set_updated_at before insert or update on public.income_sources
  for each row execute function public.set_updated_at_ms();

alter table public.income_source_split_lines enable row level security;
revoke all on public.income_source_split_lines from anon, authenticated;
create policy "income_source_split_lines_select_own" on public.income_source_split_lines for select to authenticated using (user_id = (select auth.uid()));
create policy "income_source_split_lines_insert_own" on public.income_source_split_lines for insert to authenticated with check (user_id = (select auth.uid()));
create policy "income_source_split_lines_update_own" on public.income_source_split_lines for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "income_source_split_lines_delete_own" on public.income_source_split_lines for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.income_source_split_lines to authenticated;
create trigger income_source_split_lines_set_updated_at before insert or update on public.income_source_split_lines
  for each row execute function public.set_updated_at_ms();

alter table public.income_meta enable row level security;
revoke all on public.income_meta from anon, authenticated;
create policy "income_meta_select_own" on public.income_meta for select to authenticated using (user_id = (select auth.uid()));
create policy "income_meta_insert_own" on public.income_meta for insert to authenticated with check (user_id = (select auth.uid()));
create policy "income_meta_update_own" on public.income_meta for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "income_meta_delete_own" on public.income_meta for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.income_meta to authenticated;
create trigger income_meta_set_updated_at before insert or update on public.income_meta
  for each row execute function public.set_updated_at_ms();

alter table public.allocations enable row level security;
revoke all on public.allocations from anon, authenticated;
create policy "allocations_select_own" on public.allocations for select to authenticated using (user_id = (select auth.uid()));
create policy "allocations_insert_own" on public.allocations for insert to authenticated with check (user_id = (select auth.uid()));
grant select, insert on public.allocations to authenticated;
create trigger allocations_set_updated_at before insert or update on public.allocations
  for each row execute function public.set_updated_at_ms();

alter table public.transfer_checks enable row level security;
revoke all on public.transfer_checks from anon, authenticated;
create policy "transfer_checks_select_own" on public.transfer_checks for select to authenticated using (user_id = (select auth.uid()));
create policy "transfer_checks_insert_own" on public.transfer_checks for insert to authenticated with check (user_id = (select auth.uid()));
create policy "transfer_checks_update_own" on public.transfer_checks for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "transfer_checks_delete_own" on public.transfer_checks for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.transfer_checks to authenticated;
create trigger transfer_checks_set_updated_at before insert or update on public.transfer_checks
  for each row execute function public.set_updated_at_ms();

alter table public.category_buckets enable row level security;
revoke all on public.category_buckets from anon, authenticated;
create policy "category_buckets_select_own" on public.category_buckets for select to authenticated using (user_id = (select auth.uid()));
create policy "category_buckets_insert_own" on public.category_buckets for insert to authenticated with check (user_id = (select auth.uid()));
create policy "category_buckets_update_own" on public.category_buckets for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "category_buckets_delete_own" on public.category_buckets for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.category_buckets to authenticated;
create trigger category_buckets_set_updated_at before insert or update on public.category_buckets
  for each row execute function public.set_updated_at_ms();

alter table public.entry_buckets enable row level security;
revoke all on public.entry_buckets from anon, authenticated;
create policy "entry_buckets_select_own" on public.entry_buckets for select to authenticated using (user_id = (select auth.uid()));
create policy "entry_buckets_insert_own" on public.entry_buckets for insert to authenticated with check (user_id = (select auth.uid()));
create policy "entry_buckets_update_own" on public.entry_buckets for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "entry_buckets_delete_own" on public.entry_buckets for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.entry_buckets to authenticated;
create trigger entry_buckets_set_updated_at before insert or update on public.entry_buckets
  for each row execute function public.set_updated_at_ms();

alter table public.bucket_covers enable row level security;
revoke all on public.bucket_covers from anon, authenticated;
create policy "bucket_covers_select_own" on public.bucket_covers for select to authenticated using (user_id = (select auth.uid()));
create policy "bucket_covers_insert_own" on public.bucket_covers for insert to authenticated with check (user_id = (select auth.uid()));
create policy "bucket_covers_update_own" on public.bucket_covers for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "bucket_covers_delete_own" on public.bucket_covers for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.bucket_covers to authenticated;
create trigger bucket_covers_set_updated_at before insert or update on public.bucket_covers
  for each row execute function public.set_updated_at_ms();

alter table public.goals enable row level security;
revoke all on public.goals from anon, authenticated;
create policy "goals_select_own" on public.goals for select to authenticated using (user_id = (select auth.uid()));
create policy "goals_insert_own" on public.goals for insert to authenticated with check (user_id = (select auth.uid()));
create policy "goals_update_own" on public.goals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "goals_delete_own" on public.goals for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.goals to authenticated;
create trigger goals_set_updated_at before insert or update on public.goals
  for each row execute function public.set_updated_at_ms();

alter table public.week_reviews enable row level security;
revoke all on public.week_reviews from anon, authenticated;
create policy "week_reviews_select_own" on public.week_reviews for select to authenticated using (user_id = (select auth.uid()));
create policy "week_reviews_insert_own" on public.week_reviews for insert to authenticated with check (user_id = (select auth.uid()));
create policy "week_reviews_update_own" on public.week_reviews for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.week_reviews to authenticated;
create trigger week_reviews_set_updated_at before insert or update on public.week_reviews
  for each row execute function public.set_updated_at_ms();

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
create policy "events_select_own" on public.events for select to authenticated using (user_id = (select auth.uid()));
create policy "events_insert_own" on public.events for insert to authenticated with check (user_id = (select auth.uid()));
grant select, insert on public.events to authenticated;
