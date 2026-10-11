-- Baseline: pg_dump of live salin-v2 public schema, 2026-10-11. Do not edit; mobile owns these tables.
-- Only local-fix additions are at the very end (search_path reset), listed in supabase/BASELINE_NOTES.md.



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "accountType" bigint NOT NULL,
    "openingBalanceMinor" bigint NOT NULL,
    "currency" "text" NOT NULL,
    "icon" "text" NOT NULL,
    "color" "text",
    "displayOrder" bigint NOT NULL,
    "isArchived" boolean NOT NULL,
    "createdAt" bigint NOT NULL,
    "updatedAt" bigint NOT NULL,
    "deletedAt" bigint,
    "syncStatus" bigint NOT NULL
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backups" (
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "data" "text" NOT NULL,
    "updatedAt" bigint NOT NULL
);


ALTER TABLE "public"."backups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budget_categories" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "budgetId" "text" NOT NULL,
    "categoryId" "text" NOT NULL,
    "limitMinor" bigint NOT NULL,
    "createdAt" bigint NOT NULL,
    "updatedAt" bigint NOT NULL
);


ALTER TABLE "public"."budget_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budgets" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "limitMinor" bigint,
    "period" bigint NOT NULL,
    "startDate" bigint NOT NULL,
    "endDate" bigint NOT NULL,
    "rolloverEnabled" boolean NOT NULL,
    "createdAt" bigint NOT NULL,
    "updatedAt" bigint NOT NULL,
    "deletedAt" bigint,
    "syncStatus" bigint NOT NULL
);


ALTER TABLE "public"."budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" NOT NULL,
    "color" "text" NOT NULL,
    "categoryType" bigint NOT NULL,
    "isSystem" boolean NOT NULL,
    "displayOrder" bigint NOT NULL,
    "createdAt" bigint NOT NULL,
    "updatedAt" bigint NOT NULL,
    "deletedAt" bigint,
    "syncStatus" bigint NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "avatarPath" "text",
    "notes" "text",
    "createdAt" bigint NOT NULL,
    "updatedAt" bigint NOT NULL,
    "deletedAt" bigint,
    "syncStatus" bigint NOT NULL
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."debts" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "contactId" "text" NOT NULL,
    "originLedgerEntryId" "text",
    "principalMinor" bigint NOT NULL,
    "dueDate" bigint,
    "status" bigint NOT NULL,
    "note" "text",
    "createdAt" bigint NOT NULL,
    "updatedAt" bigint NOT NULL,
    "deletedAt" bigint,
    "syncStatus" bigint NOT NULL
);


ALTER TABLE "public"."debts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ledger_entries" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "accountId" "text" NOT NULL,
    "categoryId" "text",
    "recurringInstanceId" "text",
    "debtId" "text",
    "splitId" "text",
    "transferId" "text",
    "amountMinor" bigint NOT NULL,
    "direction" bigint NOT NULL,
    "origin" bigint NOT NULL,
    "occurredAt" bigint NOT NULL,
    "note" "text",
    "metadataJson" "text",
    "createdAt" bigint NOT NULL,
    "updatedAt" bigint NOT NULL,
    "deletedAt" bigint,
    "syncStatus" bigint NOT NULL
);


ALTER TABLE "public"."ledger_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "ledgerEntryId" "text" NOT NULL,
    "path" "text" NOT NULL,
    "mimeType" "text" NOT NULL,
    "sizeBytes" bigint NOT NULL,
    "createdAt" bigint NOT NULL
);


ALTER TABLE "public"."media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_instances" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "recurringRuleId" "text" NOT NULL,
    "scheduledDate" bigint NOT NULL,
    "ledgerEntryId" "text",
    "status" bigint NOT NULL,
    "createdAt" bigint NOT NULL,
    "updatedAt" bigint NOT NULL,
    "syncStatus" bigint NOT NULL
);


ALTER TABLE "public"."recurring_instances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_rules" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "accountId" "text" NOT NULL,
    "categoryId" "text",
    "amountMinor" bigint NOT NULL,
    "direction" bigint NOT NULL,
    "frequency" bigint NOT NULL,
    "interval" bigint NOT NULL,
    "startDate" bigint NOT NULL,
    "endDate" bigint,
    "autoGenerate" boolean NOT NULL,
    "note" "text",
    "createdAt" bigint NOT NULL,
    "updatedAt" bigint NOT NULL,
    "deletedAt" bigint,
    "syncStatus" bigint NOT NULL
);


ALTER TABLE "public"."recurring_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."split_participants" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "splitId" "text" NOT NULL,
    "contactId" "text" NOT NULL,
    "shareMinor" bigint NOT NULL,
    "createdAt" bigint NOT NULL,
    "updatedAt" bigint NOT NULL
);


ALTER TABLE "public"."split_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."splits" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "originLedgerEntryId" "text",
    "totalMinor" bigint NOT NULL,
    "status" bigint NOT NULL,
    "note" "text",
    "createdAt" bigint NOT NULL,
    "updatedAt" bigint NOT NULL,
    "deletedAt" bigint,
    "syncStatus" bigint NOT NULL
);


ALTER TABLE "public"."splits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transfers" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "fromAccountId" "text" NOT NULL,
    "toAccountId" "text" NOT NULL,
    "note" "text",
    "createdAt" bigint NOT NULL,
    "updatedAt" bigint NOT NULL,
    "deletedAt" bigint,
    "syncStatus" bigint NOT NULL
);


ALTER TABLE "public"."transfers" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backups"
    ADD CONSTRAINT "backups_pkey" PRIMARY KEY ("user_id", "name");



ALTER TABLE ONLY "public"."budget_categories"
    ADD CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."debts"
    ADD CONSTRAINT "debts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_instances"
    ADD CONSTRAINT "recurring_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_rules"
    ADD CONSTRAINT "recurring_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."split_participants"
    ADD CONSTRAINT "split_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."splits"
    ADD CONSTRAINT "splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."backups"
    ADD CONSTRAINT "backups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_categories"
    ADD CONSTRAINT "budget_categories_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "public"."budgets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_categories"
    ADD CONSTRAINT "budget_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_categories"
    ADD CONSTRAINT "budget_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."debts"
    ADD CONSTRAINT "debts_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."debts"
    ADD CONSTRAINT "debts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_instances"
    ADD CONSTRAINT "fk_ledger_entry" FOREIGN KEY ("ledgerEntryId") REFERENCES "public"."ledger_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."debts"
    ADD CONSTRAINT "fk_origin_ledger_entry" FOREIGN KEY ("originLedgerEntryId") REFERENCES "public"."ledger_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."splits"
    ADD CONSTRAINT "fk_origin_ledger_entry" FOREIGN KEY ("originLedgerEntryId") REFERENCES "public"."ledger_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "public"."debts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_recurringInstanceId_fkey" FOREIGN KEY ("recurringInstanceId") REFERENCES "public"."recurring_instances"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_splitId_fkey" FOREIGN KEY ("splitId") REFERENCES "public"."splits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "public"."transfers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ledger_entries"
    ADD CONSTRAINT "ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "public"."ledger_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_instances"
    ADD CONSTRAINT "recurring_instances_recurringRuleId_fkey" FOREIGN KEY ("recurringRuleId") REFERENCES "public"."recurring_rules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_instances"
    ADD CONSTRAINT "recurring_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_rules"
    ADD CONSTRAINT "recurring_rules_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_rules"
    ADD CONSTRAINT "recurring_rules_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_rules"
    ADD CONSTRAINT "recurring_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."split_participants"
    ADD CONSTRAINT "split_participants_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."split_participants"
    ADD CONSTRAINT "split_participants_splitId_fkey" FOREIGN KEY ("splitId") REFERENCES "public"."splits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."split_participants"
    ADD CONSTRAINT "split_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."splits"
    ADD CONSTRAINT "splits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Scope accounts to user" ON "public"."accounts" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Scope backups to user" ON "public"."backups" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Scope budget_categories to user" ON "public"."budget_categories" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Scope budgets to user" ON "public"."budgets" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Scope categories to user" ON "public"."categories" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Scope contacts to user" ON "public"."contacts" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Scope debts to user" ON "public"."debts" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Scope ledger_entries to user" ON "public"."ledger_entries" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Scope media to user" ON "public"."media" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Scope recurring_instances to user" ON "public"."recurring_instances" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Scope recurring_rules to user" ON "public"."recurring_rules" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Scope split_participants to user" ON "public"."split_participants" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Scope splits to user" ON "public"."splits" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Scope transfers to user" ON "public"."transfers" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."budget_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."budgets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."debts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ledger_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurring_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurring_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."split_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."splits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transfers" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."backups" TO "anon";
GRANT ALL ON TABLE "public"."backups" TO "authenticated";
GRANT ALL ON TABLE "public"."backups" TO "service_role";



GRANT ALL ON TABLE "public"."budget_categories" TO "anon";
GRANT ALL ON TABLE "public"."budget_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_categories" TO "service_role";



GRANT ALL ON TABLE "public"."budgets" TO "anon";
GRANT ALL ON TABLE "public"."budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."budgets" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."debts" TO "anon";
GRANT ALL ON TABLE "public"."debts" TO "authenticated";
GRANT ALL ON TABLE "public"."debts" TO "service_role";



GRANT ALL ON TABLE "public"."ledger_entries" TO "anon";
GRANT ALL ON TABLE "public"."ledger_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."ledger_entries" TO "service_role";



GRANT ALL ON TABLE "public"."media" TO "anon";
GRANT ALL ON TABLE "public"."media" TO "authenticated";
GRANT ALL ON TABLE "public"."media" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_instances" TO "anon";
GRANT ALL ON TABLE "public"."recurring_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_instances" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_rules" TO "anon";
GRANT ALL ON TABLE "public"."recurring_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_rules" TO "service_role";



GRANT ALL ON TABLE "public"."split_participants" TO "anon";
GRANT ALL ON TABLE "public"."split_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."split_participants" TO "service_role";



GRANT ALL ON TABLE "public"."splits" TO "anon";
GRANT ALL ON TABLE "public"."splits" TO "authenticated";
GRANT ALL ON TABLE "public"."splits" TO "service_role";



GRANT ALL ON TABLE "public"."transfers" TO "anon";
GRANT ALL ON TABLE "public"."transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."transfers" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";









-- LOCAL FIX: the dump sets search_path to empty for the whole session; restore it so later migrations behave normally.
SELECT pg_catalog.set_config('search_path', '"$user", public, extensions', false);
