-- Server-time updatedAt: the trigger ignores whatever the client sends.
begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- web table
insert into public.goals (id, user_id, name, "targetMinor", "updatedAt")
  values ('44444444-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'G', 100, 5);
select cmp_ok((select "updatedAt" from public.goals), '>', 1700000000000::bigint, 'web insert: client updatedAt=5 replaced by server time');
update public.goals set name = 'G2', "updatedAt" = 7;
select cmp_ok((select "updatedAt" from public.goals), '>', 1700000000000::bigint, 'web update: client updatedAt=7 replaced by server time');
select cmp_ok((select "updatedAt" from public.goals), '<=', (extract(epoch from clock_timestamp()) * 1000)::bigint, 'server time is not in the future');

-- synced table (trigger from the D-16 migration)
insert into public.accounts (id, user_id, name, "accountType", "openingBalanceMinor", currency, icon, "displayOrder", "isArchived", "createdAt", "updatedAt", "syncStatus")
  values ('acc-1', 'aaaaaaaa-0000-0000-0000-000000000001', 'Cash', 0, 0, 'PHP', 'i', 0, false, 1, 123, 2);
select cmp_ok((select "updatedAt" from public.accounts), '>', 1700000000000::bigint, 'synced insert: phone-clock updatedAt replaced by server time');
update public.accounts set "updatedAt" = 99;
select cmp_ok((select "updatedAt" from public.accounts), '>', 1700000000000::bigint, 'synced update: phone-clock updatedAt replaced by server time');

select has_trigger('public'::name, 'accounts'::name, 'accounts_set_updated_at'::name);
select has_trigger('public'::name, 'allocations'::name, 'allocations_set_updated_at'::name);
select has_trigger('public'::name, 'user_profiles'::name, 'user_profiles_set_updated_at'::name);

select * from finish();
rollback;
