-- LEN0011: offline sales uploaded through record_offline_sale. Transactional fixture:
-- everything is rolled back at the end (production inside this transaction is fine:
-- acceptance and payment only queue pg_net requests, discarded by the rollback).
begin;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('93000000-0000-0000-0000-000000000001', 'off-seller@example.test', '{"display_name":"Off Seller"}', now()),
  ('93000000-0000-0000-0000-000000000002', 'off-owner@example.test', '{"display_name":"Off Owner"}', now()),
  ('93000000-0000-0000-0000-000000000003', 'off-other@example.test', '{"display_name":"Other Org Seller"}', now());

insert into public.organizations (id, name, order_prefix, timezone) overriding system value values
  (930000001, 'Offline Test', 'OFFQA', 'America/Havana'),
  (930000002, 'Other Offline Org', 'OFFQB', 'America/Havana');
insert into public.branches (id, organization_id, name, code) overriding system value values
  (930000001, 930000001, 'Main', 'MAIN'),
  (930000002, 930000002, 'Other', 'OTHER');
insert into public.organization_memberships (organization_id, user_id, branch_id, role, status) values
  (930000001, '93000000-0000-0000-0000-000000000001', 930000001, 'seller', 'active'),
  (930000001, '93000000-0000-0000-0000-000000000002', null, 'owner', 'active'),
  (930000002, '93000000-0000-0000-0000-000000000003', 930000002, 'seller', 'active');
insert into public.subscriptions (organization_id, status, starts_on, expires_on) values
  (930000001, 'active', current_date - 30, current_date + 30),
  (930000002, 'active', current_date - 30, current_date + 30);
insert into public.organization_modules (organization_id, module_key, changed_by) values
  (930000001, 'optical_sales', '93000000-0000-0000-0000-000000000002'),
  (930000001, 'cashbox', '93000000-0000-0000-0000-000000000002'),
  (930000002, 'optical_sales', '93000000-0000-0000-0000-000000000002'),
  (930000002, 'cashbox', '93000000-0000-0000-0000-000000000002');

-- An existing customer whose phone a new offline customer will reuse.
insert into public.customers (id, organization_id, branch_id, full_name, created_by) overriding system value values
  (930000001, 930000001, 930000001, 'Existing Phone Owner', '93000000-0000-0000-0000-000000000001');
insert into public.customer_phones (organization_id, branch_id, customer_id, label, phone_number, is_primary, whatsapp_enabled) values
  (930000001, 930000001, 930000001, 'principal', '+53 5555 0001', true, true);

insert into public.catalog_items (id, organization_id, category, code, name, sale_price, currency, is_active) overriding system value values
  (930000001, 930000001, 'frame', 'off_frame', 'Armadura OFF', 3000, 'CUP', true),
  (930000002, 930000001, 'vision_type', 'off_single', 'Monofocal OFF', 50, 'USD', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000001', true);

-- 1. New holder, a new relative with a new prescription, payment in USD, sold yesterday.
--    CUP 3000 + USD 50 per pair, rate 400 → pair = 23000 CUP; two pairs = 46000 CUP.
do $$
declare
  result jsonb;
  repeat_result jsonb;
  sold timestamptz := now() - interval '1 day';
  sale jsonb;
  order_row public.orders%rowtype;
  payment_row public.payments%rowtype;
  counts integer[];
begin
  sale := jsonb_build_object(
    'organizationId', 930000001, 'branchId', 930000001, 'soldAt', sold, 'localNumber', 'SC-AB12-1',
    'deviceId', '93000000-0000-0000-0000-0000000000d1', 'usdToCupRate', 400, 'notes', 'venta sin señal',
    'holder', jsonb_build_object('new', jsonb_build_object('fullName', 'Titular Offline', 'messagingConsent', true,
      'phones', jsonb_build_array(jsonb_build_object('number', '+53 5555 9001')))),
    'pairs', jsonb_build_array(
      jsonb_build_object('patient', jsonb_build_object('holder', true), 'itemIds', jsonb_build_array(930000001, 930000002)),
      jsonb_build_object('patient', jsonb_build_object('new', jsonb_build_object('fullName', 'Hija Offline',
          'phones', jsonb_build_array(jsonb_build_object('number', '+53 5555 9001', 'whatsappEnabled', false)))),
        'prescription', jsonb_build_object('new', jsonb_build_object('prescriptionDate', current_date, 'prescriberName', 'Dra. Offline', 'rightSphere', -1.25, 'leftSphere', -1)),
        'itemIds', jsonb_build_array(930000001, 930000002))),
    'payment', jsonb_build_object('amount', 50, 'currency', 'USD', 'appliedRate', 400),
    'device', jsonb_build_object('totals', jsonb_build_object('CUP', 6000, 'USD', 100), 'cupEquivalent', 46000)
  );
  result := public.record_offline_sale('93000000-0000-0000-0000-0000000000a1', sale);
  if result->>'duplicate' <> 'false' or jsonb_array_length(result->'flags') <> 0 then
    raise exception 'Clean offline sale should have no flags: %', result;
  end if;

  select * into order_row from public.orders where id = (result->>'orderId')::bigint;
  if order_row.created_at <> sold or order_row.accepted_at <> sold or order_row.cup_equivalent <> 46000 then
    raise exception 'Order must keep the sale time and totals: % % %', order_row.created_at, order_row.accepted_at, order_row.cup_equivalent;
  end if;
  if (select count(*) from public.order_lines where order_id = order_row.id) <> 2 then
    raise exception 'Two pairs expected';
  end if;
  if not exists (select 1 from public.prescription_revisions revision join public.order_lines line on line.prescription_revision_id = revision.id
    where line.order_id = order_row.id and revision.prescriber_name = 'Dra. Offline' and revision.right_sphere = -1.25) then
    raise exception 'The new prescription must be on the second pair';
  end if;

  select * into payment_row from public.payments where order_id = order_row.id;
  if payment_row.received_at <> sold or payment_row.business_date <> (sold at time zone 'America/Havana')::date
    or payment_row.equivalent_cup <> 20000 then
    raise exception 'Payment must land on the sale day: % % %', payment_row.received_at, payment_row.business_date, payment_row.equivalent_cup;
  end if;
  if current_setting('lensspace.offline_sold_at', true) <> '' then
    raise exception 'The sale-time setting must be cleared after the payment';
  end if;

  -- 2. Repeating the upload returns the same order and creates nothing.
  select array[(select count(*) from public.orders where organization_id = 930000001)::integer,
    (select count(*) from public.customers where organization_id = 930000001)::integer,
    (select count(*) from public.payments where organization_id = 930000001)::integer] into counts;
  repeat_result := public.record_offline_sale('93000000-0000-0000-0000-0000000000a1', sale);
  if repeat_result->>'duplicate' <> 'true' or repeat_result->>'orderId' <> result->>'orderId' then
    raise exception 'A repeated upload must return the same order: %', repeat_result;
  end if;
  if counts <> array[(select count(*) from public.orders where organization_id = 930000001)::integer,
    (select count(*) from public.customers where organization_id = 930000001)::integer,
    (select count(*) from public.payments where organization_id = 930000001)::integer] then
    raise exception 'A repeated upload must not create rows';
  end if;
end;
$$;

-- 3. Device priced differently and collected more than the server balance: recorded, flagged.
--    Also a new customer with the phone of an existing one, and a device clock in the future.
do $$
declare
  result jsonb;
  flag_types text[];
begin
  result := public.record_offline_sale('93000000-0000-0000-0000-0000000000a2', jsonb_build_object(
    'organizationId', 930000001, 'branchId', 930000001, 'soldAt', now() + interval '2 hours', 'localNumber', 'SC-AB12-2',
    'deviceId', '93000000-0000-0000-0000-0000000000d1', 'usdToCupRate', 400,
    -- Typed without 53: must still match the existing «+53 5555 0001».
    'holder', jsonb_build_object('new', jsonb_build_object('fullName', 'Posible Repetido',
      'phones', jsonb_build_array(jsonb_build_object('number', '5555 0001')))),
    'pairs', jsonb_build_array(jsonb_build_object('itemIds', jsonb_build_array(930000001))),
    'payment', jsonb_build_object('amount', 3500, 'currency', 'CUP'),
    'device', jsonb_build_object('totals', jsonb_build_object('CUP', 3500), 'cupEquivalent', 3500)
  ));
  select array_agg(value->>'type' order by value->>'type') into flag_types from jsonb_array_elements(result->'flags');
  if flag_types <> array['clock_skew', 'overpaid', 'possible_duplicate_customer', 'price_mismatch'] then
    raise exception 'Expected four flags, got %', result->'flags';
  end if;
  if (select created_at from public.orders where id = (result->>'orderId')::bigint) > now() + interval '1 minute' then
    raise exception 'A future device clock must not date the order in the future';
  end if;
  if (select flags from public.offline_sales where id = '93000000-0000-0000-0000-0000000000a2') <> result->'flags' then
    raise exception 'Flags must be stored with the sale';
  end if;
end;
$$;

-- 4. Online payments are unchanged: overpaying a normal order is still refused.
do $$
declare
  quote jsonb;
  accepted jsonb;
begin
  quote := public.save_multi_line_quotation(null, 930000001, 930000001, 930000001, jsonb_build_array(
    jsonb_build_object('patientCustomerId', 930000001, 'itemIds', jsonb_build_array(930000001))), 400, null, '93000000-0000-0000-0000-0000000000b1');
  accepted := public.accept_quotation((quote->>'quotationId')::bigint);
  begin
    perform public.register_cash_payment((accepted->>'orderId')::bigint, 3001, 'CUP', 1, null, '93000000-0000-0000-0000-0000000000b2');
    raise exception 'An online overpayment must still be refused';
  exception when numeric_value_out_of_range then null;
  end;
  if exists (select 1 from public.payments where order_id = (accepted->>'orderId')::bigint and received_at < now() - interval '1 minute') then
    raise exception 'Online payments keep the server time';
  end if;
end;
$$;

-- 5. Incomplete payloads and other branches are refused (the device keeps the sale).
do $$
begin
  begin
    perform public.record_offline_sale('93000000-0000-0000-0000-0000000000a3', jsonb_build_object(
      'organizationId', 930000001, 'branchId', 930000001, 'soldAt', now(), 'pairs', '[]'::jsonb));
    raise exception 'A sale without pairs must be refused';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.record_offline_sale('93000000-0000-0000-0000-0000000000a4', jsonb_build_object(
      'organizationId', 930000002, 'branchId', 930000002, 'soldAt', now(), 'localNumber', 'SC-X', 'deviceId', '93000000-0000-0000-0000-0000000000d1',
      'usdToCupRate', 400, 'holder', jsonb_build_object('id', 930000001), 'pairs', jsonb_build_array(jsonb_build_object('itemIds', '[]'::jsonb))));
    raise exception 'A seller must not upload into another organization';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.offline_sales (id, organization_id, branch_id, order_id, seller_id, device_id, local_number, sold_at)
    select gen_random_uuid(), organization_id, branch_id, id, primary_seller_id, gen_random_uuid(), 'X', now()
    from public.orders where organization_id = 930000001 limit 1;
    raise exception 'Clients must not write offline_sales directly';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- 6. Isolation: the seller of another organization sees none of these offline sales.
select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000003', true);
do $$
begin
  if exists (select 1 from public.offline_sales where organization_id = 930000001) then
    raise exception 'Offline sales leaked to another organization';
  end if;
end;
$$;

-- The owner sees them.
select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000002', true);
do $$
begin
  if (select count(*) from public.offline_sales where organization_id = 930000001) <> 2 then
    raise exception 'The owner must see both offline sales';
  end if;
end;
$$;

rollback;
