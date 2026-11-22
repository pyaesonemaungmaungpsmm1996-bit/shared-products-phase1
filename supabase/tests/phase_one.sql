-- Run in Supabase SQL Editor as postgres. Fixture data is rolled back.
begin;
create temporary table phase1_fixture (role text, uid uuid, shop uuid);
insert into phase1_fixture(role, uid) select r, gen_random_uuid() from unnest(array['owner','manager','cashier','stock_staff','accountant','outsider']) as r;
insert into auth.users(id) select uid from phase1_fixture;
grant select on phase1_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select uid::text from phase1_fixture where role='owner'), true);
select set_config('phase1.shop', public.create_shop('Temporary RLS check', 'Main')::text, true);
insert into public.products(shop_id,name,item_code,sale_price_mmk) values (current_setting('phase1.shop')::uuid,'Tea','TEST',100);
reset role;
insert into public.shop_members(shop_id,user_id,role)
select current_setting('phase1.shop')::uuid,uid,role::public.shop_role from phase1_fixture where role in ('manager','cashier','stock_staff','accountant');
set local role authenticated;
do $$
declare
  tenant uuid := current_setting('phase1.shop')::uuid;
  actor record;
  can_write boolean;
  can_read boolean;
  previous_revision timestamptz;
  other_shop uuid;
begin
  for actor in select * from phase1_fixture loop
    perform set_config('request.jwt.claim.sub',actor.uid::text,true);
    can_write := actor.role in ('owner','manager');
    can_read := actor.role <> 'outsider';
    if not can_read then
      other_shop := public.create_shop('Temporary isolated tenant', 'Branch B');
      if not exists (select from public.shops where id=other_shop) then raise exception 'Outsider cannot see own shop'; end if;
    end if;
    if exists (select from public.shops where id=tenant) <> can_read
      or exists (select from public.branches where shop_id=tenant) <> can_read
      or exists (select from public.products where shop_id=tenant) <> can_read then
      raise exception 'Read mismatch for %', actor.role;
    end if;
    select updated_at into previous_revision from public.products where shop_id=tenant and item_code='TEST';
    update public.products set sale_price_mmk=sale_price_mmk+1 where shop_id=tenant and item_code='TEST';
    if found <> can_write then raise exception 'Update mismatch for %', actor.role; end if;
    if can_write then
      update public.products set sale_price_mmk=0 where shop_id=tenant and item_code='TEST' and updated_at=previous_revision;
      if found then raise exception 'Stale update accepted'; end if;
    end if;
    begin
      insert into public.products(shop_id,name,item_code,sale_price_mmk) values (tenant, 'Role product', actor.role, 100);
      if not can_write then raise exception 'Unexpected insert for %',actor.role; end if;
    exception when insufficient_privilege then
      if can_write then raise; end if;
    end;
    begin
      insert into public.branches(shop_id,name) values (tenant,actor.role);
      if not can_write then raise exception 'Unexpected branch insert for %',actor.role; end if;
    exception when insufficient_privilege then
      if can_write then raise; end if;
    end;
  end loop;
end $$;
reset role;
rollback;
select 'Phase 1 SQL checks passed' as result;
