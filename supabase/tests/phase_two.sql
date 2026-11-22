-- Run after the Phase 1 and Phase 2 migrations. This query rolls back all fixtures.
begin;
select set_config('phase2.owner', gen_random_uuid()::text, true);
select set_config('phase2.outsider', gen_random_uuid()::text, true);
insert into auth.users(id) values (current_setting('phase2.owner')::uuid), (current_setting('phase2.outsider')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('phase2.owner'), true);

do $$
declare
  shop uuid := public.create_shop('Temporary Phase 2 SQL test', 'Main');
  branch uuid;
  product uuid;
  second_product uuid;
  doc uuid;
  req uuid := gen_random_uuid();
  command jsonb;
  line jsonb;
begin
  perform set_config('phase2.shop', shop::text, true);
  select id into strict branch from public.branches where shop_id=shop;
  insert into public.products(shop_id,name,item_code,sale_price_mmk) values (shop,'Tea','TEST',2500) returning id into product;
  insert into public.products(shop_id,name,item_code,sale_price_mmk) values (shop,'Other','OTHER',2500) returning id into second_product;
  line := jsonb_build_object('product_id',product,'quantity',5,'unit_mmk',0);
  command := jsonb_build_object('action','post','kind','opening','branch_id',branch,'lines',jsonb_build_array(line));
  doc := public.stock_command(shop,req,command);
  if public.stock_command(shop,req,command) <> doc then raise exception 'Opening retry changed document'; end if;
  if (select on_hand from public.stock_balances where product_id=product) is distinct from 5::bigint then
    raise exception 'Opening retry duplicated stock';
  end if;
  begin
    perform public.stock_command(shop,gen_random_uuid(),command);
    raise exception 'Second opening stock accepted';
  exception when raise_exception then
    if sqlerrm not like 'Opening stock must%' then raise; end if;
  end;

  line := line || '{"quantity":2,"unit_mmk":1000}';
  command := jsonb_build_object('action','post','kind','purchase','branch_id',branch,'lines',jsonb_build_array(line),
    'counterparty','Supplier A','amount_mmk',1000,'method','bank');
  doc := public.stock_command(shop,gen_random_uuid(),command);
  if (select on_hand from public.stock_balances where product_id=product) is distinct from 7::bigint
    or (select paid_mmk from public.stock_documents where id=doc) is distinct from 1000::bigint then raise exception 'Purchase mismatch'; end if;

  line := line || '{"quantity":6,"unit_mmk":2500}';
  command := jsonb_build_object('action','draft','kind','sale','branch_id',branch,'lines',jsonb_build_array(line),'counterparty','Customer A');
  doc := public.stock_command(shop,gen_random_uuid(),command);
  if (select on_hand from public.stock_balances where product_id=product) is distinct from 7::bigint then raise exception 'Draft moved stock'; end if;
  command := command || jsonb_build_object('document_id',doc,'version',1);
  perform public.stock_command(shop,gen_random_uuid(),command);
  begin
    perform public.stock_command(shop,gen_random_uuid(),command);
    raise exception 'Stale draft update accepted';
  exception when sqlstate 'P4090' then null;
  end;

  req := gen_random_uuid();
  command := command || '{"action":"post","amount_mmk":5000,"method":"cash","version":2}';
  perform public.stock_command(shop,req,command);
  if public.stock_command(shop,req,command) <> doc
    or (select on_hand from public.stock_balances where product_id=product) is distinct from 1::bigint
    or (select count(*) from public.stock_movements where document_id=doc) <> 1
    or (select count(*) from public.stock_payments where document_id=doc) <> 1
    then raise exception 'Sale retry duplicated a side effect'; end if;

  begin
    perform public.stock_command(shop,gen_random_uuid(),
      (command - 'document_id' - 'version') || jsonb_build_object('lines',jsonb_build_array(
        line || '{"quantity":1}', jsonb_build_object('product_id',second_product,'quantity',1,'unit_mmk',2500))));
    raise exception 'Oversell accepted';
  exception when raise_exception then
    if sqlerrm not like 'Insufficient stock%' then raise; end if;
  end;
  if (select on_hand from public.stock_balances where product_id=product) is distinct from 1::bigint
    or (select count(*) from public.stock_documents where shop_id=shop) <> 3
    or (select count(*) from public.stock_movements where shop_id=shop) <> 3
    then raise exception 'Failed multi-line sale left partial data'; end if;

  req := gen_random_uuid();
  command := jsonb_build_object('action','payment','document_id',doc,'version',3,'amount_mmk',10000,'method','bank');
  perform public.stock_command(shop,req,command);
  if public.stock_command(shop,req,command) <> doc
    or (select paid_mmk from public.stock_documents where id=doc) is distinct from 15000::bigint
    or (select count(*) from public.stock_payments where document_id=doc) <> 2
    then raise exception 'Payment retry duplicated a side effect'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('phase2.outsider'), true);
do $$
declare tenant uuid := current_setting('phase2.shop')::uuid;
begin
  if exists (select from public.stock_balances where shop_id=tenant)
    or exists (select from public.stock_documents where shop_id=tenant)
    or exists (select from public.stock_movements where shop_id=tenant)
    or exists (select from public.stock_payments where shop_id=tenant)
  then raise exception 'Cross-shop data was visible'; end if;
  begin
    perform public.stock_command(tenant,gen_random_uuid(),'{"action":"post"}');
    raise exception 'Cross-shop write was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;
select 'Phase 2 SQL checks passed' as result;
