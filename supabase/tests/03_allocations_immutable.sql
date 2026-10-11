-- allocations are immutable: neither update nor delete, even for the owner.
begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into public.buckets (id, user_id, name, "groupKey") values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Emergency', 'save');
insert into public.transfer_cycles (id, user_id) values ('44444444-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into public.allocations (id, user_id, "bucketId", "amountMinor", "transferCycleId") values
  ('33333333-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 100, '44444444-0000-0000-0000-000000000001');

select policies_are('public', 'allocations', array['allocations_select_own', 'allocations_insert_own'],
  'allocations has only select and insert policies (no update, no delete)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok($$insert into public.allocations (user_id, "bucketId", "amountMinor", "transferCycleId")
  values (auth.uid(), '11111111-0000-0000-0000-000000000001', 5, '44444444-0000-0000-0000-000000000001')$$, 'owner can insert (user_id defaults to auth.uid())');
select throws_ok($$update public.allocations set "amountMinor" = 1 where id = '33333333-0000-0000-0000-000000000001'$$,
  '42501', null, 'owner cannot update an allocation');
select throws_ok($$delete from public.allocations where id = '33333333-0000-0000-0000-000000000001'$$,
  '42501', null, 'owner cannot delete an allocation');
select throws_ok($$insert into public.allocations (user_id, "bucketId", "amountMinor", "transferCycleId")
  values (auth.uid(), '11111111-0000-0000-0000-000000000001', -5, '44444444-0000-0000-0000-000000000001')$$, '23514', null, 'negative amount rejected');
reset role;
select throws_ok($$insert into public.allocations (user_id, "bucketId", "amountMinor") values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 5)$$, '23514', null, 'new allocation without a transfer cycle is rejected');
select is((select "amountMinor" from public.allocations where id = '33333333-0000-0000-0000-000000000001'), 100::bigint, 'row unchanged');
select is((select count(*)::int from public.allocations), 2, 'both rows still present');

select * from finish();
rollback;
