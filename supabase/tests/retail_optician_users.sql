-- The optician's own user only adds jobs and reads its own optician. Rollback-only.
begin;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('9a000000-0000-0000-0000-000000000001', 'ou-owner@example.test', '{"display_name":"OU Owner"}', now()),
  ('9a000000-0000-0000-0000-000000000002', 'ou-seller@example.test', '{"display_name":"OU Seller"}', now()),
  ('9a000000-0000-0000-0000-000000000003', 'ou-user@example.test', '{"display_name":"OU User"}', now()),
  ('9a000000-0000-0000-0000-000000000004', 'ou-other@example.test', '{"display_name":"OU Other"}', now()),
  ('9a000000-0000-0000-0000-000000000005', 'ou-special@example.test', '{"display_name":"OU Special"}', now());

insert into public.organizations (id, name, order_prefix, timezone, usd_to_cup_rate) overriding system value values (9100000001, 'Optician Users Test', 'OUQA', 'America/Havana', 400);
insert into public.branches (id, organization_id, name, code) overriding system value values (9100000001, 9100000001, 'Main', 'MAIN');
insert into public.organization_memberships (organization_id, user_id, branch_id, role, status, can_manage_commercial_orders) values
  (9100000001, '9a000000-0000-0000-0000-000000000001', null, 'owner', 'active', false),
  (9100000001, '9a000000-0000-0000-0000-000000000002', 9100000001, 'seller', 'active', false),
  (9100000001, '9a000000-0000-0000-0000-000000000005', 9100000001, 'seller', 'active', true);
insert into public.subscriptions (organization_id, status, starts_on, expires_on) values (9100000001, 'active', current_date - 1, current_date + 30);
insert into public.organization_modules (organization_id, module_key, changed_by) values
  (9100000001, 'optical_sales', '9a000000-0000-0000-0000-000000000001'),
  (9100000001, 'cashbox', '9a000000-0000-0000-0000-000000000001'),
  (9100000001, 'production', '9a000000-0000-0000-0000-000000000001');
insert into public.customers (id, organization_id, branch_id, full_name, created_by) overriding system value values
  (9100000001, 9100000001, 9100000001, 'Retail Customer', '9a000000-0000-0000-0000-000000000002');
insert into public.catalog_items (id, organization_id, category, code, name, sale_price, currency, is_active, sales_channel) overriding system value values
  (9100000001, 9100000001, 'vision_type', 'ou_retail', 'Solo detalle', 100, 'USD', true, 'retail'),
  (9100000002, 9100000001, 'vision_type', 'ou_whole', 'Mayorista', 40, 'USD', true, 'wholesale');
insert into public.commercial_accounts (id, organization_id, name, created_by) overriding system value values
  (9100000001, 9100000001, 'Óptica Uno', '9a000000-0000-0000-0000-000000000001'),
  (9100000002, 9100000001, 'Óptica Dos', '9a000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', '9a000000-0000-0000-0000-000000000001', true);
insert into public.commercial_account_prices (account_id, organization_id, catalog_item_id, sale_price, currency) values
  (9100000001, 9100000001, 9100000002, 30, 'USD');

select public.add_organization_member('9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000003', 9100000001, 9100000001, 'account_user', 'active', 9100000001);
select public.add_organization_member('9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000004', 9100000001, 9100000001, 'account_user', 'active', 9100000002);

create temporary table ou_ids (key text primary key, id bigint) on commit drop;
grant all on ou_ids to authenticated;
insert into ou_ids select 'membership', id from public.organization_memberships where user_id = '9a000000-0000-0000-0000-000000000003';
insert into ou_ids select 'other_membership', id from public.organization_memberships where user_id = '9a000000-0000-0000-0000-000000000004';

do $$
begin
  begin
    perform public.add_organization_member('9a000000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-000000000004', 9100000001, 9100000001, 'account_user', 'active', null);
    raise exception 'An optician user needs an optician';
  exception when check_violation then null;
  end;
end;
$$;

set local role authenticated;

-- A retail order of the seller the optician user must never see.
select set_config('request.jwt.claim.sub', '9a000000-0000-0000-0000-000000000002', true);
do $$
declare
  retail_order bigint := (public.accept_quotation((public.save_multi_line_quotation(null, 9100000001, 9100000001, 9100000001, jsonb_build_array(
    jsonb_build_object('patientCustomerId', 9100000001, 'itemIds', jsonb_build_array(9100000001))), 400, null, null)->>'quotationId')::bigint)->>'orderId')::bigint;
begin
  insert into ou_ids values ('retail_order', retail_order);
end;
$$;

-- The optician user adds jobs.
select set_config('request.jwt.claim.sub', '9a000000-0000-0000-0000-000000000003', true);
do $$
declare
  membership bigint := (select id from ou_ids where key = 'membership');
  portal jsonb := public.get_my_account_portal();
  revision jsonb;
  first_job jsonb;
  retry jsonb;
  second_job jsonb;
  sale_order bigint;
begin
  if jsonb_array_length(portal) <> 1 or portal->0->>'accountName' <> 'Óptica Uno' then raise exception 'Wrong portal: %', portal; end if;
  if jsonb_array_length(portal->0->'prices') <> 1 or (portal->0->'prices'->0->>'price')::numeric <> 30 or portal->0->'prices'->0 ? 'catalogPrice' then
    raise exception 'Only own wholesale prices, without base price: %', portal->0->'prices';
  end if;

  revision := public.create_my_account_prescription(membership, jsonb_build_object('revision_prescription_date', current_date, 'revision_right_sphere', -1.5, 'revision_notes', ''));
  first_job := public.add_my_account_job(membership, jsonb_build_object('prescriptionRevisionId', (revision->>'revisionId')::bigint, 'itemIds', jsonb_build_array(9100000002)), '9a000000-0000-0000-0000-0000000000a1');
  retry := public.add_my_account_job(membership, jsonb_build_object('prescriptionRevisionId', (revision->>'revisionId')::bigint, 'itemIds', jsonb_build_array(9100000002)), '9a000000-0000-0000-0000-0000000000a1');
  second_job := public.add_my_account_job(membership, jsonb_build_object('itemIds', jsonb_build_array(9100000002)), null);
  if first_job->>'lineId' <> retry->>'lineId' then raise exception 'Adding must be retry-safe'; end if;
  if (second_job->>'lineNumber')::int <> 2 then raise exception 'The second job joins the open order: %', second_job; end if;

  portal := public.get_my_account_portal();
  if jsonb_array_length(portal->0->'orders') <> 1 or jsonb_array_length(portal->0->'orders'->0->'lines') <> 2 then raise exception 'Expected one order with two jobs: %', portal; end if;
  if (portal->0->'orders'->0->>'cupEquivalent')::numeric <> 24000 or (portal->0->'orders'->0->>'paidCup')::numeric <> 0 then raise exception 'The balance must be visible: %', portal; end if;
  sale_order := (portal->0->'orders'->0->>'id')::bigint;
  insert into ou_ids values ('order', sale_order);

  -- Cannot change prices, use a retail product or another optician's membership.
  begin
    perform public.add_my_account_job(membership, jsonb_build_object('itemIds', jsonb_build_array(9100000002), 'lineAdjustments', jsonb_build_object('9100000002', jsonb_build_object('amount', 1, 'reason', 'Me lo rebajo'))), null);
    raise exception 'The user must not change prices';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.add_my_account_job(membership, jsonb_build_object('itemIds', jsonb_build_array(9100000001)), null);
    raise exception 'A retail product must be refused';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.add_my_account_job((select id from ou_ids where key = 'other_membership'), jsonb_build_object('itemIds', jsonb_build_array(9100000002)), null);
    raise exception 'Another membership must be refused';
  exception when insufficient_privilege then null;
  end;

  -- Nothing else: tables hidden, staff actions refused. The RPC flag lasts the
  -- transaction: clear it as a new request would.
  perform set_config('lensspace.commercial_rpc', '', true);
  if (select count(*) from public.orders) <> 0 or (select count(*) from public.payments) <> 0
    or (select count(*) from public.customers) <> 0 or (select count(*) from public.prescriptions) <> 0
    or (select count(*) from public.catalog_items) <> 0 or (select count(*) from public.commercial_accounts) <> 0
    or (select count(*) from public.commercial_account_prices) <> 0 or (select count(*) from public.seller_cashboxes) <> 0
    or (select count(*) from public.production_jobs) <> 0 then
    raise exception 'The optician user must not read staff tables';
  end if;
  if jsonb_array_length(public.list_commercial_orders()) <> 0 or jsonb_array_length(public.list_accessible_orders()) <> 0 then
    raise exception 'The optician user must not list staff orders';
  end if;
  begin perform public.calculate_catalog_price(9100000001, array[9100000001::bigint], null, 400); raise exception 'Direct pricing must be refused'; exception when insufficient_privilege then null; end;
  begin perform public.get_commercial_order(sale_order); raise exception 'Staff reader must be refused'; exception when no_data_found then null; end;
  begin perform public.get_commercial_price_list(sale_order); raise exception 'Staff price list must be refused'; exception when no_data_found then null; end;
  begin perform public.ensure_commercial_order_patient(sale_order); raise exception 'Staff patient must be refused'; exception when insufficient_privilege then null; end;
  begin perform public.deliver_commercial_order_lines(sale_order, null); raise exception 'Delivery must be refused'; exception when insufficient_privilege then null; end;
  begin perform public.close_commercial_order(sale_order); raise exception 'Close must be refused'; exception when insufficient_privilege then null; end;
  begin perform public.remove_commercial_order_line((select (portal->0->'orders'->0->'lines'->0->>'id')::bigint), 'Quitar trabajo'); raise exception 'Removal must be refused'; exception when insufficient_privilege then null; end;
  begin perform public.register_cash_payment(sale_order, 1, 'USD', 400, null, null); raise exception 'Payment must be refused'; exception when insufficient_privilege then null; end;
  begin perform public.mark_order_delivered((select id from ou_ids where key = 'retail_order')); raise exception 'Retail delivery must be refused'; exception when no_data_found then null; end;
end;
$$;

-- The user of another optician does not see these jobs.
select set_config('request.jwt.claim.sub', '9a000000-0000-0000-0000-000000000004', true);
do $$
begin
  if jsonb_array_length(public.get_my_account_portal()->0->'orders') <> 0 then raise exception 'Other optician must see no orders'; end if;
end;
$$;

-- The seller with the special permission works every optician.
select set_config('request.jwt.claim.sub', '9a000000-0000-0000-0000-000000000005', true);
do $$
declare
  sale_order bigint := (select id from ou_ids where key = 'order');
  other_order bigint := (public.open_commercial_order(9100000001, 9100000001, 9100000002, 400, null)->>'orderId')::bigint;
begin
  if jsonb_array_length(public.list_commercial_orders()) <> 2 then raise exception 'The special seller sees every optician'; end if;
  perform public.add_commercial_order_line(sale_order, jsonb_build_object('patientCustomerId', (public.ensure_commercial_order_patient(sale_order)->>'id')::bigint, 'itemIds', jsonb_build_array(9100000002)), null);
  perform public.add_commercial_order_line(other_order, jsonb_build_object('patientCustomerId', (public.ensure_commercial_order_patient(other_order)->>'id')::bigint, 'itemIds', jsonb_build_array(9100000002)), null);
  perform public.close_commercial_order(sale_order);
  perform public.deliver_commercial_order_lines(sale_order, null);
  perform public.register_cash_payment(sale_order, 10, 'USD', 400, null, null);
  if (select commercial_status from public.orders where id = sale_order) <> 'delivered' then raise exception 'The special seller delivers'; end if;
end;
$$;

-- The next job after closing opens a new order; the debt keeps showing.
select set_config('request.jwt.claim.sub', '9a000000-0000-0000-0000-000000000003', true);
do $$
declare
  portal jsonb;
begin
  perform public.add_my_account_job((select id from ou_ids where key = 'membership'), jsonb_build_object('itemIds', jsonb_build_array(9100000002)), null);
  portal := public.get_my_account_portal();
  if jsonb_array_length(portal->0->'orders') <> 2 then raise exception 'A closed order must not take new jobs: %', portal; end if;
  if (select (o->>'paidCup')::numeric from jsonb_array_elements(portal->0->'orders') o where o->>'id' = (select id::text from ou_ids where key = 'order')) <> 4000 then
    raise exception 'Paid amount must be reflected: %', portal;
  end if;
end;
$$;

rollback;
