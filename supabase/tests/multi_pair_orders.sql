-- LEN0006: quotations and orders with several pairs. Transactional fixture: everything is
-- rolled back at the end. Run after migrations (disposable database, or production inside
-- this transaction: acceptance only queues a pg_net request, discarded by the rollback).
begin;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('92000000-0000-0000-0000-000000000001', 'mp-seller@example.test', '{"display_name":"MP Seller"}', now()),
  ('92000000-0000-0000-0000-000000000002', 'mp-owner@example.test', '{"display_name":"MP Owner"}', now());

insert into public.organizations (id, name, order_prefix, timezone) overriding system value values (920000001, 'Multi Pair Test', 'MPTQA', 'America/Havana');
insert into public.branches (id, organization_id, name, code) overriding system value values
  (920000001, 920000001, 'Main', 'MAIN'),
  (920000002, 920000001, 'Other', 'OTHER');
insert into public.organization_memberships (organization_id, user_id, branch_id, role, status) values
  (920000001, '92000000-0000-0000-0000-000000000001', 920000001, 'seller', 'active'),
  (920000001, '92000000-0000-0000-0000-000000000002', null, 'owner', 'active');
insert into public.subscriptions (organization_id, status, starts_on, expires_on) values (920000001, 'active', current_date - 1, current_date + 30);
insert into public.organization_modules (organization_id, module_key, changed_by) values
  (920000001, 'optical_sales', '92000000-0000-0000-0000-000000000002');

-- Holder, two relatives in the branch and a customer of another branch.
insert into public.customers (id, organization_id, branch_id, full_name, created_by) overriding system value values
  (920000001, 920000001, 920000001, 'Holder', '92000000-0000-0000-0000-000000000001'),
  (920000002, 920000001, 920000001, 'Relative One', '92000000-0000-0000-0000-000000000001'),
  (920000003, 920000001, 920000001, 'Relative Two', '92000000-0000-0000-0000-000000000001'),
  (920000004, 920000001, 920000002, 'Other Branch', '92000000-0000-0000-0000-000000000002');

-- Relative One has a strong prescription that triggers the surcharge.
insert into public.prescriptions (id, organization_id, branch_id, customer_id, created_by) overriding system value values
  (920000001, 920000001, 920000001, 920000002, '92000000-0000-0000-0000-000000000001'),
  (920000002, 920000001, 920000001, 920000003, '92000000-0000-0000-0000-000000000001');
insert into public.prescription_revisions (id, organization_id, branch_id, prescription_id, revision_number, prescription_date, right_sphere, left_sphere, created_by) overriding system value values
  (920000001, 920000001, 920000001, 920000001, 1, current_date, -7, -6.5, '92000000-0000-0000-0000-000000000001'),
  (920000002, 920000001, 920000001, 920000002, 1, current_date, -1, -1, '92000000-0000-0000-0000-000000000001');

insert into public.catalog_items (id, organization_id, category, code, name, sale_price, currency, is_active) overriding system value values
  (920000001, 920000001, 'frame', 'mp_frame', 'Armadura MP', 3000, 'CUP', true),
  (920000002, 920000001, 'vision_type', 'mp_single', 'Monofocal MP', 50, 'USD', true);
insert into public.graduation_rules (organization_id, code, name, minimum_absolute_sphere, surcharge_amount, surcharge_currency, message, is_active) values
  (920000001, 'mp_high_sphere', 'Alta graduación', 6, 10, 'USD', 'Graduación alta: lleva recargo.', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '92000000-0000-0000-0000-000000000001', true);

-- 1. Three pairs, same frame in pairs 1 and 2, surcharge only on pair 2.
do $$
declare
  result jsonb;
  quote_id bigint;
begin
  result := public.save_multi_line_quotation(null, 920000001, 920000001, 920000001, jsonb_build_array(
    jsonb_build_object('patientCustomerId', 920000001, 'itemIds', jsonb_build_array(920000001, 920000002)),
    jsonb_build_object('patientCustomerId', 920000002, 'prescriptionRevisionId', 920000001, 'itemIds', jsonb_build_array(920000001, 920000002)),
    jsonb_build_object('patientCustomerId', 920000003, 'prescriptionRevisionId', 920000002, 'itemIds', jsonb_build_array(920000002))
  ), 400, 'familia', '92000000-0000-0000-0000-0000000000a1');
  quote_id := (result->>'quotationId')::bigint;

  -- CUP 6000; USD 50 + 60 (50 + 10 surcharge) + 50 = 160 → 6000 + 160 * 400 = 70000.
  if result->'pricing'->'totals' <> '{"CUP": 6000, "USD": 160}'::jsonb or (result->'pricing'->>'cupEquivalent')::numeric <> 70000 then
    raise exception 'Multi-pair totals are wrong: %', result->'pricing';
  end if;
  if (select count(*) from public.quotation_lines where quotation_id = quote_id) <> 3 then
    raise exception 'Expected 3 quotation lines';
  end if;
  if (select count(*) from public.quotation_items item join public.quotation_lines line on line.id = item.quotation_line_id
      where line.quotation_id = quote_id and line.line_number = 2 and item.line_kind = 'graduation_surcharge') <> 1
    or (select count(*) from public.quotation_items item join public.quotation_lines line on line.id = item.quotation_line_id
      where line.quotation_id = quote_id and line.line_number <> 2 and item.line_kind = 'graduation_surcharge') <> 0 then
    raise exception 'The surcharge must belong to pair 2 only';
  end if;
  if (select cup_equivalent from public.quotations where id = quote_id) <> (select sum(cup_equivalent) from public.quotation_lines where quotation_id = quote_id) then
    raise exception 'Quotation CUP equivalent must be the sum of its pairs';
  end if;

  -- Retry with the same request id returns the same quotation.
  if (public.save_multi_line_quotation(null, 920000001, 920000001, 920000001, jsonb_build_array(
      jsonb_build_object('patientCustomerId', 920000001, 'itemIds', jsonb_build_array(920000001))
    ), 400, null, '92000000-0000-0000-0000-0000000000a1')->>'quotationId')::bigint <> quote_id then
    raise exception 'Retry must return the same quotation';
  end if;

  -- 2. Acceptance snapshots three pairs; a retry returns the same order.
  result := public.accept_quotation(quote_id);
  if (select count(*) from public.order_lines where order_id = (result->>'orderId')::bigint) <> 3 then
    raise exception 'Expected 3 order lines: %', result;
  end if;
  if (select count(*) from public.order_items item join public.order_lines line on line.id = item.order_line_id
      where item.order_id = (result->>'orderId')::bigint and line.order_id = item.order_id) <> 6 then
    raise exception 'Every order item must sit on a line of its order';
  end if;
  if (select cup_equivalent from public.orders where id = (result->>'orderId')::bigint) <> 70000
    or (select patient_customer_id from public.order_lines where order_id = (result->>'orderId')::bigint and line_number = 3) <> 920000003 then
    raise exception 'Order totals or patients are wrong';
  end if;
  if (public.accept_quotation(quote_id)->>'orderId') <> result->>'orderId' then
    raise exception 'Accepting twice must return the same order';
  end if;
end;
$$;

-- 3. The single-pair signature keeps working and keeps its response shape.
do $$
declare result jsonb;
begin
  result := public.save_sale_quotation(null, 920000001, 920000001, 920000002, 920000001, array[920000002::bigint], 400, null, '{}'::jsonb, null);
  if result->'pricing'->'lineItems' is null or (result->'pricing'->>'cupEquivalent')::numeric <> 24000 then
    raise exception 'Single-pair wrapper changed its response: %', result;
  end if;
  if (select patient_customer_id from public.quotation_lines where quotation_id = (result->>'quotationId')::bigint) <> 920000002 then
    raise exception 'Single-pair patient must be the customer';
  end if;
end;
$$;

-- 4. A price change between quotation and acceptance is refused (40001).
do $$
declare
  quote_id bigint;
begin
  quote_id := (public.save_multi_line_quotation(null, 920000001, 920000001, 920000001, jsonb_build_array(
    jsonb_build_object('patientCustomerId', 920000001, 'itemIds', jsonb_build_array(920000001)),
    jsonb_build_object('patientCustomerId', 920000003, 'itemIds', jsonb_build_array(920000001))
  ), 400, null, null)->>'quotationId')::bigint;
  reset role;
  update public.catalog_items set sale_price = 3500 where id = 920000001;
  set local role authenticated;
  begin
    perform public.accept_quotation(quote_id);
    raise exception 'A price change must block acceptance';
  exception when serialization_failure then null;
  end;
end;
$$;

-- 5. Invalid pairs are refused.
do $$
begin
  begin
    perform public.save_multi_line_quotation(null, 920000001, 920000001, 920000001, jsonb_build_array(
      jsonb_build_object('patientCustomerId', 920000004, 'itemIds', jsonb_build_array(920000002))), 400, null, null);
    raise exception 'A patient of another branch must be refused';
  exception when no_data_found then null;
  end;
  begin
    perform public.save_multi_line_quotation(null, 920000001, 920000001, 920000001, jsonb_build_array(
      jsonb_build_object('patientCustomerId', 920000003, 'prescriptionRevisionId', 920000001, 'itemIds', jsonb_build_array(920000002))), 400, null, null);
    raise exception 'A prescription of another patient must be refused';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_multi_line_quotation(null, 920000001, 920000001, 920000001,
      (select jsonb_agg(jsonb_build_object('patientCustomerId', 920000001, 'itemIds', jsonb_build_array(920000002))) from generate_series(1, 11)), 400, null, null);
    raise exception 'More than 10 pairs must be refused';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

rollback;
