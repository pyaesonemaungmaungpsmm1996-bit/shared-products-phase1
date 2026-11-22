begin;

create table public.stock_balances (
  shop_id uuid not null references public.shops(id),
  branch_id uuid not null references public.branches(id),
  product_id uuid not null references public.products(id),
  on_hand bigint not null check (on_hand between 0 and 999999999999),
  primary key (shop_id, branch_id, product_id)
);

create table public.stock_documents (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  branch_id uuid not null references public.branches(id),
  kind text not null check (kind in ('opening','purchase','sale')),
  status text not null check (status in ('draft','posted')),
  version integer not null default 1,
  counterparty text not null check (char_length(counterparty) <= 120),
  lines jsonb not null,
  total_mmk bigint not null check (total_mmk between 0 and 9999999999999),
  paid_mmk bigint not null default 0 check (paid_mmk between 0 and total_mmk),
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  posted_at timestamptz
);
create index stock_documents_branch on public.stock_documents (shop_id, branch_id, updated_at desc, id);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id),
  branch_id uuid not null references public.branches(id),
  product_id uuid not null references public.products(id),
  document_id uuid not null references public.stock_documents(id),
  quantity_delta bigint not null check (quantity_delta <> 0),
  occurred_at timestamptz not null default now(),
  unique (document_id, product_id)
);
create index stock_movements_branch_history on public.stock_movements (shop_id, branch_id, occurred_at desc, id);
create index stock_movements_product_history on public.stock_movements (shop_id, branch_id, product_id);

create table public.stock_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  branch_id uuid not null references public.branches(id),
  document_id uuid not null references public.stock_documents(id),
  amount_mmk bigint not null check (amount_mmk > 0),
  method text not null check (method in ('cash','bank')),
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now()
);
create index stock_payments_document on public.stock_payments(document_id, recorded_at, id);

create table public.stock_requests (
  shop_id uuid not null references public.shops(id),
  request_id uuid not null,
  actor uuid not null references auth.users(id),
  payload jsonb not null,
  document_id uuid not null references public.stock_documents(id),
  primary key (shop_id, request_id)
);

do $$
declare table_name text;
begin
  foreach table_name in array array['stock_balances','stock_documents','stock_movements','stock_payments','stock_requests'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    if table_name <> 'stock_requests' then
      execute format('grant select on public.%I to authenticated', table_name);
      execute format('create policy tenant_read on public.%I for select to authenticated using (shop_id in (select shop_id from public.shop_members))', table_name);
    end if;
  end loop;
end;
$$;

drop policy tenant_read on public.stock_documents;
create policy stock_document_role_read on public.stock_documents for select to authenticated
  using (exists (
    select 1 from public.shop_members as member
    where member.shop_id = stock_documents.shop_id
      and (member.role in ('owner','manager','accountant')
        or (member.role = 'cashier' and stock_documents.kind = 'sale')
        or (member.role = 'stock_staff' and stock_documents.kind in ('opening','purchase')))
  ));
drop policy tenant_read on public.stock_payments;
create policy stock_payment_role_read on public.stock_payments for select to authenticated
  using (exists (
    select 1 from public.stock_documents as document
    join public.shop_members as member on member.shop_id = document.shop_id
    where document.id = stock_payments.document_id
      and member.role in ('owner','manager','accountant','cashier')
  ));

-- A shop row lock serializes stock posting and idempotency checks within the same shop.
-- Every operation runs inside the transaction started by its RPC request.
create function public.stock_command(p_shop uuid, p_request uuid, p_command jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.shop_role;
  previous public.stock_requests%rowtype;
  doc public.stock_documents%rowtype;
  action text := p_command->>'action';
  doc_kind text := p_command->>'kind';
  doc_id uuid := (p_command->>'document_id')::uuid;
  branch uuid := (p_command->>'branch_id')::uuid;
  expected_version integer := (p_command->>'version')::integer;
  amount bigint := coalesce((p_command->>'amount_mmk')::bigint, 0);
  tender text := p_command->>'method';
  party text := btrim(coalesce(p_command->>'counterparty',''));
  items jsonb := p_command->'lines';
  item record;
  total numeric := 0;
  delta bigint;
begin
  if actor_id is null or p_shop is null or p_request is null or action is null
    or action not in ('draft','post','payment') then raise exception 'Invalid stock request'; end if;

  select role into actor_role from public.shop_members
    where shop_id = p_shop and user_id = actor_id;
  if actor_role is null then raise exception 'Shop access denied' using errcode = '42501'; end if;

  perform 1 from public.shops where id = p_shop for update;
  select * into previous from public.stock_requests where shop_id = p_shop and request_id = p_request;
  if found then
    if previous.actor <> actor_id or previous.payload <> p_command then
      raise exception 'Request ID already used for another operation';
    end if;
    return previous.document_id;
  end if;

  if doc_id is not null then
    select * into doc from public.stock_documents where id = doc_id and shop_id = p_shop;
    if not found then raise exception 'Document unavailable'; end if;
    if expected_version is distinct from doc.version then
      raise exception 'Document changed. Reload and try again' using errcode = 'P4090';
    end if;
    if action = 'payment' then
      doc_kind := doc.kind;
      branch := doc.branch_id;
    elsif doc.status <> 'draft' or doc.kind is distinct from doc_kind or doc.branch_id is distinct from branch then
      raise exception 'Only an existing draft of the same type and branch can be edited';
    end if;
  elsif action = 'payment' then
    raise exception 'Payment requires a posted document';
  end if;

  if doc_kind is null or doc_kind not in ('opening','purchase','sale')
    or not exists (select 1 from public.branches where id = branch and shop_id = p_shop) then
    raise exception 'Invalid document type or branch';
  end if;

  if not (actor_role in ('owner','manager')
    or (actor_role = 'cashier' and doc_kind = 'sale')
    or (actor_role = 'stock_staff' and doc_kind in ('opening','purchase') and action <> 'payment' and amount = 0)
    or (actor_role = 'accountant' and action = 'payment' and doc_kind in ('sale','purchase'))) then
    raise exception 'Role cannot perform this operation' using errcode = '42501';
  end if;

  if amount < 0 or (amount > 0 and (tender is null or tender not in ('cash','bank'))) then
    raise exception 'Invalid payment';
  end if;

  if action = 'payment' then
    if doc.status <> 'posted' or doc.kind = 'opening' or amount = 0 or amount > doc.total_mmk - doc.paid_mmk then
      raise exception 'Payment exceeds the outstanding balance or the document is unavailable for payment';
    end if;
    update public.stock_documents set paid_mmk = paid_mmk + amount, version = version + 1,
      updated_at = clock_timestamp() where id = doc.id;
  else
    if char_length(party) > 120 or jsonb_typeof(items) is distinct from 'array' then
      raise exception 'Invalid document details';
    end if;
    if jsonb_array_length(items) not between 1 and 100 then
      raise exception 'Enter between 1 and 100 product lines';
    end if;
    if exists (
      select 1 from jsonb_to_recordset(items) as line(product_id uuid, quantity bigint, unit_mmk bigint)
      left join public.products as product on product.id = line.product_id and product.shop_id = p_shop
      where product.id is null or line.quantity is null or line.quantity not between 1 and 999999999
        or line.unit_mmk is null or line.unit_mmk not between 0 and 999999999999
        or (doc_kind = 'opening' and line.unit_mmk <> 0)
    ) then raise exception 'Invalid product, quantity or unit amount'; end if;
    if exists (
      select 1 from jsonb_to_recordset(items) as line(product_id uuid)
      group by product_id having count(*) > 1
    ) then raise exception 'Only one line per product is allowed'; end if;
    select sum(line.quantity::numeric * line.unit_mmk) into total
      from jsonb_to_recordset(items) as line(quantity bigint, unit_mmk bigint);
    if total > 9999999999999 or amount > total or (action = 'draft' and amount <> 0) then
      raise exception 'Invalid document total or initial payment';
    end if;
    if action = 'post' and total > amount and party = '' then
      raise exception 'Customer or supplier name is required for an outstanding amount';
    end if;

    if doc_id is null then
      insert into public.stock_documents(shop_id,branch_id,kind,status,counterparty,lines,total_mmk,paid_mmk,created_by,posted_at)
      values (p_shop,branch,doc_kind,case when action = 'post' then 'posted' else 'draft' end,
        party,items,total,amount,actor_id,case when action = 'post' then clock_timestamp() end)
      returning * into doc;
    else
      update public.stock_documents set status = case when action = 'post' then 'posted' else 'draft' end,
        counterparty = party, lines = items, total_mmk = total, paid_mmk = amount,
        version = version + 1, updated_at = clock_timestamp(),
        posted_at = case when action = 'post' then clock_timestamp() end
      where id = doc_id returning * into doc;
    end if;

    if action = 'post' then
      for item in select * from jsonb_to_recordset(items) as line(product_id uuid, quantity bigint) order by product_id loop
        if doc_kind = 'opening' and exists (
          select 1 from public.stock_movements where shop_id = p_shop and branch_id = branch and product_id = item.product_id
        ) then raise exception 'Opening stock must be the first movement for this branch and product'; end if;
        delta := case when doc_kind = 'sale' then -item.quantity else item.quantity end;
        if delta < 0 then
          update public.stock_balances set on_hand = on_hand + delta
            where shop_id = p_shop and branch_id = branch and product_id = item.product_id and on_hand >= -delta;
          if not found then raise exception 'Insufficient stock for product %', item.product_id; end if;
        else
          insert into public.stock_balances(shop_id,branch_id,product_id,on_hand)
          values (p_shop,branch,item.product_id,delta)
          on conflict (shop_id,branch_id,product_id) do update
            set on_hand = public.stock_balances.on_hand + excluded.on_hand;
        end if;
        insert into public.stock_movements(shop_id,branch_id,product_id,document_id,quantity_delta)
        values (p_shop,branch,item.product_id,doc.id,delta);
      end loop;
    end if;
  end if;

  if amount > 0 then
    insert into public.stock_payments(shop_id,branch_id,document_id,amount_mmk,method,recorded_by)
    values (p_shop,branch,doc.id,amount,tender,actor_id);
  end if;
  insert into public.stock_requests(shop_id,request_id,actor,payload,document_id)
  values (p_shop,p_request,actor_id,p_command,doc.id);
  return doc.id;
end;
$$;

revoke all on function public.stock_command(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.stock_command(uuid,uuid,jsonb) to authenticated;
alter publication supabase_realtime add table public.stock_balances, public.stock_documents,
  public.stock_movements, public.stock_payments;

commit;
