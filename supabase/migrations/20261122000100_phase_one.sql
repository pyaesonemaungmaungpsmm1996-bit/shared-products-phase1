begin;

create type public.shop_role as enum ('owner', 'manager', 'cashier', 'stock_staff', 'accountant');

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  currency text not null default 'MMK' check (currency = 'MMK'),
  time_zone text not null default 'Asia/Yangon' check (time_zone = 'Asia/Yangon')
);

create table public.shop_members (
  shop_id uuid not null references public.shops(id),
  user_id uuid not null references auth.users(id),
  role public.shop_role not null,
  primary key (shop_id, user_id)
);
create index shop_members_user on public.shop_members(user_id);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  unique (shop_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  item_code text not null check (char_length(btrim(item_code)) between 1 and 64),
  sale_price_mmk bigint not null check (sale_price_mmk between 0 and 999999999999),
  updated_at timestamptz not null default now(),
  unique (shop_id, item_code)
);

alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.branches enable row level security;
alter table public.products enable row level security;

revoke all on public.shops, public.shop_members, public.branches, public.products from public, anon, authenticated;
grant select on public.shops, public.shop_members, public.branches, public.products to authenticated;
grant insert (shop_id, name) on public.branches to authenticated;
grant insert (shop_id, name, item_code, sale_price_mmk), update (sale_price_mmk)
  on public.products to authenticated;

create policy own_memberships on public.shop_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy shops_read on public.shops for select to authenticated
  using (id in (select shop_id from public.shop_members));
create policy branches_read on public.branches for select to authenticated
  using (shop_id in (select shop_id from public.shop_members));
create policy products_read on public.products for select to authenticated
  using (shop_id in (select shop_id from public.shop_members));

create policy branches_create on public.branches for insert to authenticated
  with check (shop_id in (select shop_id from public.shop_members where role in ('owner','manager')));
create policy products_create on public.products for insert to authenticated
  with check (shop_id in (select shop_id from public.shop_members where role in ('owner','manager')));
create policy prices_update on public.products for update to authenticated
  using (shop_id in (select shop_id from public.shop_members where role in ('owner','manager')))
  with check (shop_id in (select shop_id from public.shop_members where role in ('owner','manager')));

create function public.create_shop(shop_name text, branch_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  new_shop uuid;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  insert into public.shops(name) values (btrim(shop_name)) returning id into new_shop;
  insert into public.shop_members(shop_id, user_id, role) values (new_shop, caller, 'owner');
  insert into public.branches(shop_id, name) values (new_shop, btrim(branch_name));
  return new_shop;
end;
$$;
revoke all on function public.create_shop(text, text) from public, anon, authenticated;
grant execute on function public.create_shop(text, text) to authenticated;

create function public.update_product_timestamp()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
revoke all on function public.update_product_timestamp() from public, anon, authenticated;
create trigger products_timestamp before update on public.products
  for each row execute function public.update_product_timestamp();

alter publication supabase_realtime add table public.shops, public.shop_members, public.branches, public.products;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', false, 5242880,
  array['image/jpeg','image/png','image/webp']);
create policy phase_one_photo_read on storage.objects for select to authenticated
  using (bucket_id = 'product-photos' and (storage.foldername(name))[1] in
    (select shop_id::text from public.shop_members));
create policy phase_one_photo_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and (storage.foldername(name))[1] in
    (select shop_id::text from public.shop_members where role in ('owner','manager')));

commit;
