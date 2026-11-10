-- Wholesale has its own products, separate from retail: each catalog item belongs to one
-- sales channel and never crosses to the other. An optician buys from the wholesale catalog
-- at its base price unless commercial_account_prices says otherwise. A row only exists for
-- a difference: another price, or a product not offered to that optician.

alter table public.catalog_items
  add column sales_channel text not null default 'retail',
  add constraint catalog_items_sales_channel_check check (sales_channel in ('retail', 'wholesale')),
  add constraint catalog_items_wholesale_owned_check check (sales_channel = 'retail' or organization_id is not null);

-- Insert only: an item cannot change channel, past orders point to it.
grant insert (sales_channel) on public.catalog_items to authenticated;

alter table public.commercial_account_prices
  alter column sale_price drop not null,
  alter column currency drop not null,
  add column is_offered boolean not null default true,
  add constraint commercial_account_prices_content_check check ((sale_price is not null and currency is not null) or not is_offered);

-- Prices of an optician: shared by staff and, later, by the optician's own user.

create function private.account_price_list(target_organization_id bigint, target_account_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id,
    'organizationId', item.organization_id,
    'category', item.category,
    'name', item.name,
    'price', coalesce(fixed.sale_price, round(item.sale_price * (1 - account.discount_percent / 100), 2)),
    'currency', coalesce(fixed.currency, item.currency),
    'catalogPrice', item.sale_price,
    'catalogCurrency', item.currency,
    'priceSource', case when fixed.sale_price is not null then 'account_fixed' when account.discount_percent > 0 then 'account_discount' else 'catalog' end
  ) order by item.category, item.name), '[]'::jsonb)
  from public.commercial_accounts account
  join public.catalog_items item
    on item.organization_id = account.organization_id and item.sales_channel = 'wholesale' and item.is_active
  left join public.commercial_account_prices fixed
    on fixed.account_id = account.id and fixed.catalog_item_id = item.id
  where account.id = target_account_id
    and account.organization_id = target_organization_id
    and coalesce(fixed.is_offered, true);
$$;

revoke all on function private.account_price_list(bigint, bigint) from public, anon, authenticated;

create or replace function public.get_commercial_price_list(target_order_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sale_order public.orders%rowtype;
begin
  select * into sale_order from public.orders where id = target_order_id and order_kind = 'commercial';
  if not found or not private.can_see_commercial_order(sale_order.organization_id, sale_order.branch_id, sale_order.primary_seller_id) then
    raise exception using errcode = 'P0002', message = 'Pedido comercial no encontrado.';
  end if;
  return private.account_price_list(sale_order.organization_id, sale_order.commercial_account_id);
end;
$$;

-- The server refuses a product of the other channel or one not offered to the optician.
do $migration$
declare
  definition text := pg_get_functiondef('public.calculate_sale_price(bigint,bigint[],bigint,numeric,jsonb,bigint)'::regprocedure);
  anchor text := E'  pricing := public.calculate_catalog_price(\n';
begin
  if position(anchor in definition) = 0 then
    raise exception 'calculate_sale_price changed: anchor not found';
  end if;
  execute replace(definition, anchor, $guard$  if exists (
    select 1 from public.catalog_items item
    where item.id = any(selected_item_ids)
      and item.sales_channel <> case when target_account_id is null then 'retail' else 'wholesale' end
  ) or (target_account_id is not null and exists (
    select 1 from public.commercial_account_prices price
    where price.account_id = target_account_id and price.catalog_item_id = any(selected_item_ids) and not price.is_offered
  )) then
    raise exception using errcode = '22023', message = 'Uno o más artículos no están disponibles para esta venta.';
  end if;

$guard$ || anchor);
end;
$migration$;

-- One save for the whole price table of an optician: retry-safe on Cuban links.
create function public.save_commercial_account_prices(target_account_id bigint, entries jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.commercial_accounts%rowtype;
begin
  select * into account from public.commercial_accounts where id = target_account_id and archived_at is null for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'La óptica minorista no está disponible.';
  end if;
  if not private.can_manage_commercial_accounts(account.organization_id) then
    raise exception using errcode = '42501', message = 'Solo el dueño puede cambiar estos precios.';
  end if;
  if entries is null or jsonb_typeof(entries) <> 'array' then
    raise exception using errcode = '22023', message = 'Los precios no tienen un formato válido.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(entries) as entry(item_id bigint, price numeric, currency text, offered boolean)
    left join public.catalog_items item
      on item.id = entry.item_id and item.organization_id = account.organization_id and item.sales_channel = 'wholesale'
    where item.id is null
      or entry.offered is null
      or (entry.price is not null and (entry.price < 0 or entry.currency is null or entry.currency not in ('CUP', 'USD')))
  ) then
    raise exception using errcode = '22023', message = 'Revisa los precios: hay un producto o un importe no válido.';
  end if;

  delete from public.commercial_account_prices where account_id = account.id;
  insert into public.commercial_account_prices (account_id, organization_id, catalog_item_id, sale_price, currency, is_offered)
  select account.id, account.organization_id, entry.item_id, entry.price, case when entry.price is null then null else entry.currency end, entry.offered
  from jsonb_to_recordset(entries) as entry(item_id bigint, price numeric, currency text, offered boolean)
  where entry.price is not null or not entry.offered;
end;
$$;

revoke all on function public.save_commercial_account_prices(bigint, jsonb) from public, anon;
grant execute on function public.save_commercial_account_prices(bigint, jsonb) to authenticated;
