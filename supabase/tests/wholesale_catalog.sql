-- Wholesale and retail products never mix; each optician has its own prices. Rollback-only.
begin;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('99000000-0000-0000-0000-000000000001', 'wc-owner@example.test', '{"display_name":"WC Owner"}', now()),
  ('99000000-0000-0000-0000-000000000002', 'wc-seller@example.test', '{"display_name":"WC Seller"}', now());

insert into public.organizations (id, name, order_prefix, timezone) overriding system value values (990000001, 'Wholesale Catalog Test', 'WCQA', 'America/Havana');
insert into public.branches (id, organization_id, name, code) overriding system value values (990000001, 990000001, 'Main', 'MAIN');
insert into public.organization_memberships (organization_id, user_id, branch_id, role, status) values
  (990000001, '99000000-0000-0000-0000-000000000001', null, 'owner', 'active'),
  (990000001, '99000000-0000-0000-0000-000000000002', 990000001, 'seller', 'active');
insert into public.subscriptions (organization_id, status, starts_on, expires_on) values (990000001, 'active', current_date - 1, current_date + 30);
insert into public.organization_modules (organization_id, module_key, changed_by) values (990000001, 'optical_sales', '99000000-0000-0000-0000-000000000001');
insert into public.customers (id, organization_id, branch_id, full_name, created_by) overriding system value values
  (990000001, 990000001, 990000001, 'Retail Customer', '99000000-0000-0000-0000-000000000002');
insert into public.catalog_items (id, organization_id, category, code, name, sale_price, currency, is_active, sales_channel) overriding system value values
  (990000001, 990000001, 'vision_type', 'wc_retail', 'Solo detalle', 100, 'USD', true, 'retail'),
  (990000002, 990000001, 'vision_type', 'wc_whole_a', 'Mayorista A', 40, 'USD', true, 'wholesale'),
  (990000003, 990000001, 'frame', 'wc_whole_b', 'Mayorista B', 20, 'USD', true, 'wholesale'),
  (990000004, 990000001, 'treatment', 'wc_whole_c', 'Mayorista C', 10, 'USD', true, 'wholesale');
insert into public.commercial_accounts (id, organization_id, name, created_by) overriding system value values
  (990000001, 990000001, 'Óptica Uno', '99000000-0000-0000-0000-000000000001'),
  (990000002, 990000001, 'Óptica Dos', '99000000-0000-0000-0000-000000000001');

create temporary table wc_ids (key text primary key, id bigint) on commit drop;
grant all on wc_ids to authenticated;

set local role authenticated;

-- Óptica Uno: A at 30 USD, C not offered. Óptica Dos stays at base prices.
select set_config('request.jwt.claim.sub', '99000000-0000-0000-0000-000000000001', true);
select public.save_commercial_account_prices(990000001, '[
  {"item_id": 990000002, "price": 30, "currency": "USD", "offered": true},
  {"item_id": 990000003, "price": null, "currency": null, "offered": true},
  {"item_id": 990000004, "price": null, "currency": null, "offered": false}
]');
do $$
begin
  if (select count(*) from public.commercial_account_prices where account_id = 990000001) <> 2 then
    raise exception 'Only the differences are stored';
  end if;
  -- Saving twice is safe and a retail product is refused.
  perform public.save_commercial_account_prices(990000001, '[{"item_id": 990000002, "price": 30, "currency": "USD", "offered": true}, {"item_id": 990000004, "price": null, "currency": null, "offered": false}]');
  begin
    perform public.save_commercial_account_prices(990000001, '[{"item_id": 990000001, "price": 5, "currency": "USD", "offered": true}]');
    raise exception 'A retail product must be refused';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- The seller cannot change prices.
select set_config('request.jwt.claim.sub', '99000000-0000-0000-0000-000000000002', true);
do $$
declare
  order_one bigint := (public.open_commercial_order(990000001, 990000001, 990000001, 400, null)->>'orderId')::bigint;
  order_two bigint := (public.open_commercial_order(990000001, 990000001, 990000002, 400, null)->>'orderId')::bigint;
  list_one jsonb := public.get_commercial_price_list(order_one);
  list_two jsonb := public.get_commercial_price_list(order_two);
  patient_one bigint := (public.ensure_commercial_order_patient(order_one)->>'id')::bigint;
  line jsonb;
begin
  begin
    perform public.save_commercial_account_prices(990000001, '[]');
    raise exception 'A seller must not change prices';
  exception when insufficient_privilege then null;
  end;

  if jsonb_array_length(list_one) <> 2 then raise exception 'Uno sees A and B: %', list_one; end if;
  if jsonb_array_length(list_two) <> 3 then raise exception 'Dos sees the whole wholesale catalog: %', list_two; end if;
  if (select (e->>'price')::numeric from jsonb_array_elements(list_one) e where (e->>'id')::bigint = 990000002) <> 30 then raise exception 'Uno pays its price'; end if;
  if (select (e->>'price')::numeric from jsonb_array_elements(list_two) e where (e->>'id')::bigint = 990000002) <> 40 then raise exception 'Dos pays base'; end if;

  line := public.add_commercial_order_line(order_one, jsonb_build_object('patientCustomerId', patient_one, 'itemIds', jsonb_build_array(990000002, 990000003)), null);
  if (line->'pricing'->'totals'->>'USD')::numeric <> 50 then raise exception 'Uno total must be 30 + 20: %', line; end if;

  begin
    perform public.add_commercial_order_line(order_one, jsonb_build_object('patientCustomerId', patient_one, 'itemIds', jsonb_build_array(990000004)), null);
    raise exception 'A product not offered must be refused';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.add_commercial_order_line(order_one, jsonb_build_object('patientCustomerId', patient_one, 'itemIds', jsonb_build_array(990000001)), null);
    raise exception 'A retail product must be refused on a wholesale job';
  exception when invalid_parameter_value then null;
  end;

  -- A retail sale cannot use a wholesale product.
  begin
    perform public.save_multi_line_quotation(null, 990000001, 990000001, 990000001, jsonb_build_array(
      jsonb_build_object('patientCustomerId', 990000001, 'itemIds', jsonb_build_array(990000002))), 400, null, null);
    raise exception 'A wholesale product must be refused on a retail sale';
  exception when invalid_parameter_value then null;
  end;
  perform public.save_multi_line_quotation(null, 990000001, 990000001, 990000001, jsonb_build_array(
    jsonb_build_object('patientCustomerId', 990000001, 'itemIds', jsonb_build_array(990000001))), 400, null, null);
end;
$$;

rollback;
