-- One RLS check per table: user B cannot select, insert, update or delete user A's rows;
-- user A can do exactly what the policies/grants allow.
-- Synced tables are tested against the REAL live policies (FOR ALL using auth.uid() = user_id),
-- so A can delete there; the "web never hard-deletes" rule is an app rule, not asserted here.
begin;

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- One valid INSERT statement per table, for a given user. Fixed ids so FKs line up.
create function pg_temp.row_sql(t text, uid uuid) returns text language sql as $f$
  select format(case t
    when 'accounts' then $q$insert into public.accounts (id,user_id,name,"accountType",
        "openingBalanceMinor",currency,icon,"displayOrder","isArchived","createdAt","updatedAt","syncStatus")
        values ('acc-%1$s-1',%2$L,'Cash',0,0,'PHP','i',0,false,1,1,2),('acc-%1$s-2',%2$L,'Bank',1,0,'PHP','i',1,false,1,1,2)$q$
    when 'categories' then $q$insert into public.categories (id,user_id,name,icon,color,"categoryType","isSystem","displayOrder","createdAt","updatedAt","syncStatus")
        values ('cat-%1$s-1',%2$L,'Salary','i','c',0,false,0,1,1,2)$q$
    when 'ledger_entries' then $q$insert into public.ledger_entries (id,user_id,"accountId","categoryId","amountMinor",direction,origin,"occurredAt","createdAt","updatedAt","syncStatus")
        values ('led-%1$s-1',%2$L,'acc-%1$s-1','cat-%1$s-1',100,0,0,1000,1,1,2)$q$
    when 'transfers' then $q$insert into public.transfers (id,user_id,"fromAccountId","toAccountId","createdAt","updatedAt","syncStatus")
        values ('tr-%1$s-1',%2$L,'acc-%1$s-1','acc-%1$s-2',1,1,2)$q$
    when 'budgets' then $q$insert into public.budgets (id,user_id,name,period,"startDate","endDate","rolloverEnabled","createdAt","updatedAt","syncStatus")
        values ('bud-%1$s-1',%2$L,'B',1,1,2,false,1,1,2)$q$
    when 'budget_categories' then $q$insert into public.budget_categories (id,user_id,"budgetId","categoryId","limitMinor","createdAt","updatedAt")
        values ('bc-%1$s-1',%2$L,'bud-%1$s-1','cat-%1$s-1',5,1,1)$q$
    when 'recurring_rules' then $q$insert into public.recurring_rules (id,user_id,title,"accountId",
        "amountMinor",direction,frequency,interval,"startDate","autoGenerate","createdAt","updatedAt","syncStatus")
        values ('rr-%1$s-1',%2$L,'Rent','acc-%1$s-1',5,1,2,1,1,false,1,1,2)$q$
    when 'recurring_instances' then $q$insert into public.recurring_instances (id,user_id,"recurringRuleId","scheduledDate",status,"createdAt","updatedAt","syncStatus")
        values ('ri-%1$s-1',%2$L,'rr-%1$s-1',1,0,1,1,2)$q$
    when 'contacts' then $q$insert into public.contacts (id,user_id,name,"createdAt","updatedAt","syncStatus")
        values ('ct-%1$s-1',%2$L,'Sam',1,1,2)$q$
    when 'debts' then $q$insert into public.debts (id,user_id,"contactId","principalMinor",status,"createdAt","updatedAt","syncStatus")
        values ('de-%1$s-1',%2$L,'ct-%1$s-1',5,0,1,1,2)$q$
    when 'splits' then $q$insert into public.splits (id,user_id,title,"totalMinor",status,"createdAt","updatedAt","syncStatus")
        values ('sp-%1$s-1',%2$L,'Dinner',5,0,1,1,2)$q$
    when 'split_participants' then $q$insert into public.split_participants (id,user_id,"splitId","contactId","shareMinor","createdAt","updatedAt")
        values ('spp-%1$s-1',%2$L,'sp-%1$s-1','ct-%1$s-1',5,1,1)$q$
    when 'media' then $q$insert into public.media (id,user_id,"ledgerEntryId",path,"mimeType","sizeBytes","createdAt")
        values ('me-%1$s-1',%2$L,'led-%1$s-1','p','image/png',1,1)$q$
    when 'backups' then $q$insert into public.backups (user_id,name,data,"updatedAt") values (%2$L,'b1','blob',1)$q$
    when 'user_profiles' then $q$insert into public.user_profiles (user_id,"firstName") values (%2$L,'Ana')$q$
    when 'buckets' then $q$insert into public.buckets (id,user_id,name,"groupKey","keptInAccountId") values
        ('%3$s1-0000-0000-0000-000000000001',%2$L,'Living','spend','acc-%1$s-1'),
        ('%3$s1-0000-0000-0000-000000000002',%2$L,'Fun','spend',null)$q$
    when 'allocation_plans' then $q$insert into public.allocation_plans (id,user_id,key,name) values ('%3$s2-0000-0000-0000-000000000001',%2$L,'A','Plan A')$q$
    when 'allocation_plan_lines' then $q$insert into public.allocation_plan_lines (id,user_id,"planId","bucketId","percentBp")
        values ('%3$s3-0000-0000-0000-000000000001',%2$L,'%3$s2-0000-0000-0000-000000000001','%3$s1-0000-0000-0000-000000000001',10000)$q$
    when 'allocation_rules' then $q$insert into public.allocation_rules (id,user_id,kind,params) values ('%3$s4-0000-0000-0000-000000000001',%2$L,'switch_on_goal','{}')$q$
    when 'income_sources' then $q$insert into public.income_sources (id,user_id,name,kind,rule,"landsInAccountId","categoryId")
        values ('%3$s5-0000-0000-0000-000000000001',%2$L,'Work','salary','plan','acc-%1$s-1','cat-%1$s-1')$q$
    when 'income_source_split_lines' then $q$insert into public.income_source_split_lines (id,user_id,"sourceId","bucketId","percentBp")
        values ('%3$s6-0000-0000-0000-000000000001',%2$L,'%3$s5-0000-0000-0000-000000000001','%3$s1-0000-0000-0000-000000000001',5000)$q$
    when 'income_meta' then $q$insert into public.income_meta (id,user_id,"ledgerEntryId","sourceId",job)
        values ('%3$s7-0000-0000-0000-000000000001',%2$L,'led-%1$s-1','%3$s5-0000-0000-0000-000000000001','plan')$q$
    when 'allocations' then $q$insert into public.allocations (id,user_id,"ledgerEntryId","bucketId","amountMinor","destAccountId","planKey","percentBp")
        values ('%3$s8-0000-0000-0000-000000000001',%2$L,'led-%1$s-1','%3$s1-0000-0000-0000-000000000001',100,'acc-%1$s-1','A',10000)$q$
    when 'transfer_checks' then $q$insert into public.transfer_checks (id,user_id,"fromAccountId","toAccountId","sentMinor","transferId","periodKey")
        values ('%3$s9-0000-0000-0000-000000000001',%2$L,'acc-%1$s-1','acc-%1$s-2',100,'tr-%1$s-1','2026-W41')$q$
    when 'category_buckets' then $q$insert into public.category_buckets (id,user_id,"categoryId","bucketId")
        values ('%3$sa-0000-0000-0000-000000000001',%2$L,'cat-%1$s-1','%3$s1-0000-0000-0000-000000000001')$q$
    when 'entry_buckets' then $q$insert into public.entry_buckets (id,user_id,"ledgerEntryId","bucketId")
        values ('%3$sb-0000-0000-0000-000000000001',%2$L,'led-%1$s-1','%3$s1-0000-0000-0000-000000000001')$q$
    when 'bucket_covers' then $q$insert into public.bucket_covers (id,user_id,"fromBucketId","toBucketId","amountMinor")
        values ('%3$sc-0000-0000-0000-000000000001',%2$L,'%3$s1-0000-0000-0000-000000000001','%3$s1-0000-0000-0000-000000000002',50)$q$
    when 'goals' then $q$insert into public.goals (id,user_id,name,"targetMinor") values ('%3$sd-0000-0000-0000-000000000001',%2$L,'Emergency',5000000)$q$
    when 'week_reviews' then $q$insert into public.week_reviews (id,user_id,"weekStart") values ('%3$se-0000-0000-0000-000000000001',%2$L,'2026-10-05')$q$
    when 'events' then $q$insert into public.events (id,user_id,name) values ('%3$sf-0000-0000-0000-000000000001',%2$L,'seen')$q$
  end, case when uid = 'aaaaaaaa-0000-0000-0000-000000000001' then 'a' else 'b' end, uid, case when uid = 'aaaaaaaa-0000-0000-0000-000000000001' then 'aaaaaaa' else 'bbbbbbb' end)
$f$;

-- 'fk' = delete blocked by a RESTRICT FK between web tables (history kept), still owner-scoped.
-- Runs sql, returns the affected row count as text, or 'denied' (RLS / privilege), then ROLLS BACK
-- the statement via a sentinel exception so probes never change state.
create function pg_temp.probe(sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  begin
    execute sql;
    get diagnostics n = row_count;
    raise exception using errcode = 'P0777', message = n::text;
  exception
    when sqlstate 'P0777' then return sqlerrm;
    when insufficient_privilege then return 'denied';
    when foreign_key_violation then return 'fk';
  end;
end $f$;

create function pg_temp.visible(t text) returns bigint language plpgsql as $f$
declare n bigint; begin execute format('select count(*) from public.%I', t) into n; return n; end $f$;

-- parents first (FK order)
create temp table tbls (ord int, t text, upd text, del text);
insert into tbls values
 (1,'accounts','2','2'),(2,'categories','1','1'),(3,'ledger_entries','1','1'),(4,'transfers','1','1'),
 (5,'budgets','1','1'),(6,'budget_categories','1','1'),(7,'recurring_rules','1','1'),(8,'recurring_instances','1','1'),
 (9,'contacts','1','1'),(10,'debts','1','1'),(11,'splits','1','1'),(12,'split_participants','1','1'),
 (13,'media','1','1'),(14,'backups','1','1'),
 (20,'user_profiles','1','denied'),
 (21,'buckets','2','fk'),(22,'allocation_plans','1','1'),(23,'allocation_plan_lines','1','1'),(24,'allocation_rules','1','1'),
 (25,'income_sources','1','fk'),(26,'income_source_split_lines','1','1'),(27,'income_meta','1','1'),
 (28,'allocations','denied','denied'),(29,'transfer_checks','1','1'),(30,'category_buckets','1','1'),
 (31,'entry_buckets','1','1'),(32,'bucket_covers','1','1'),(33,'goals','1','1'),
 (34,'week_reviews','1','denied'),(35,'events','denied','denied');
grant all on tbls to authenticated;

select plan(30 * 8);

-- A inserts own rows through RLS (also proves the insert policy admits the owner)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(pg_temp.row_sql(t, 'aaaaaaaa-0000-0000-0000-000000000001'), t || ': owner A can insert') from tbls order by ord;

select is(pg_temp.visible(t), case t when 'accounts' then 2 when 'buckets' then 2 else 1 end::bigint, t || ': owner A sees own rows') from tbls order by ord;
select is(pg_temp.probe(format('update public.%I set user_id = user_id', t)), upd, t || ': owner A update result') from tbls order by ord;
select is(pg_temp.probe(format('delete from public.%I', t)), del, t || ': owner A delete result') from tbls order by ord;

-- B: sees nothing, cannot update/delete, cannot insert as A, cannot insert for self-claimed A id
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(pg_temp.probe(pg_temp.row_sql(t, 'aaaaaaaa-0000-0000-0000-000000000001')), 'denied', t || ': B cannot insert rows as A') from tbls order by ord;
select is(pg_temp.visible(t), 0::bigint, t || ': B cannot select A rows') from tbls order by ord;
select ok(pg_temp.probe(format('update public.%I set user_id = user_id', t)) in ('0','denied'), t || ': B cannot update A rows') from tbls order by ord;
select ok(pg_temp.probe(format('delete from public.%I', t)) in ('0','denied'), t || ': B cannot delete A rows') from tbls order by ord;

reset role;
select * from finish();
rollback;
