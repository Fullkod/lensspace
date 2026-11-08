-- LEN0010 phase 3: commercial order lifecycle. Rollback-only; commercial orders never
-- queue WhatsApp (checked at the end).
begin;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('96000000-0000-0000-0000-000000000001', 'co-owner@example.test', '{"display_name":"CO Owner"}', now()),
  ('96000000-0000-0000-0000-000000000002', 'co-seller-a@example.test', '{"display_name":"CO Seller A"}', now()),
  ('96000000-0000-0000-0000-000000000003', 'co-seller-b@example.test', '{"display_name":"CO Seller B"}', now()),
  ('96000000-0000-0000-0000-000000000004', 'co-seller-c@example.test', '{"display_name":"CO Seller C"}', now()),
  ('96000000-0000-0000-0000-000000000005', 'co-other@example.test', '{"display_name":"CO Other"}', now()),
  ('96000000-0000-0000-0000-000000000006', 'co-lens@example.test', '{"display_name":"CO Lens"}', now());

insert into public.organizations (id, name, order_prefix, timezone) overriding system value values
  (960000001, 'Commercial Orders Test', 'COQA', 'America/Havana'),
  (960000002, 'Commercial Orders Other', 'COOQA', 'America/Havana');
insert into public.branches (id, organization_id, name, code) overriding system value values
  (960000001, 960000001, 'Main', 'MAIN'),
  (960000002, 960000002, 'Main', 'MAIN');
insert into public.organization_memberships (id, organization_id, user_id, branch_id, role, status) overriding system value values
  (960000001, 960000001, '96000000-0000-0000-0000-000000000001', null, 'owner', 'active'),
  (960000002, 960000001, '96000000-0000-0000-0000-000000000002', 960000001, 'seller', 'active'),
  (960000003, 960000001, '96000000-0000-0000-0000-000000000003', 960000001, 'seller', 'active'),
  (960000004, 960000001, '96000000-0000-0000-0000-000000000004', 960000001, 'seller', 'active'),
  (960000005, 960000002, '96000000-0000-0000-0000-000000000005', null, 'owner', 'active'),
  (960000006, 960000001, '96000000-0000-0000-0000-000000000006', null, 'lens_provider', 'active');
insert into public.subscriptions (organization_id, status, starts_on, expires_on) values
  (960000001, 'active', current_date - 1, current_date + 30),
  (960000002, 'active', current_date - 1, current_date + 30);
insert into public.organization_modules (organization_id, module_key, changed_by) values
  (960000001, 'optical_sales', '96000000-0000-0000-0000-000000000001'),
  (960000001, 'production', '96000000-0000-0000-0000-000000000001'),
  (960000001, 'cashbox', '96000000-0000-0000-0000-000000000001'),
  (960000002, 'optical_sales', '96000000-0000-0000-0000-000000000005');
insert into public.catalog_items (id, organization_id, category, code, name, sale_price, currency, is_active) overriding system value values
  (960000001, 960000001, 'vision_type', 'co_single', 'Monofocal CO', 100, 'USD', true),
  (960000002, 960000001, 'frame', 'co_frame', 'Armadura CO', 3000, 'CUP', true);
insert into public.commercial_accounts (id, organization_id, name, discount_percent, created_by) overriding system value values
  (960000001, 960000001, 'Óptica Mayor', 10, '96000000-0000-0000-0000-000000000001');

create temporary table co_ids (key text primary key, id bigint) on commit drop;
grant all on co_ids to authenticated;

set local role authenticated;

-- Seller A opens the order and adds two jobs on "different days".
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000002', true);
do $$
declare
  opened jsonb := public.open_commercial_order(960000001, 960000001, 960000001, 400, '96000000-0000-0000-0000-0000000000aa');
  again jsonb := public.open_commercial_order(960000001, 960000001, 960000001, 400, '96000000-0000-0000-0000-0000000000aa');
  sale_order bigint := (opened->>'orderId')::bigint;
  patient_one bigint := public.create_commercial_patient(960000001, 960000001, '  Ana   Paciente ');
  patient_two bigint := public.create_commercial_patient(960000001, 960000001, 'Luis Paciente');
  first_line jsonb;
  order_totals jsonb;
begin
  if (again->>'orderId')::bigint <> sale_order then raise exception 'Open must be retry-safe'; end if;
  if (select commercial_status from public.orders where id = sale_order) <> 'open' then raise exception 'New order must be open'; end if;
  if (select full_name from public.customers where id = patient_one) <> 'Ana Paciente' then raise exception 'Patient name must be normalized'; end if;
  insert into co_ids values ('order', sale_order), ('patient_one', patient_one), ('patient_two', patient_two);

  first_line := public.add_commercial_order_line(sale_order, jsonb_build_object('patientCustomerId', patient_one, 'itemIds', jsonb_build_array(960000001, 960000002)), '96000000-0000-0000-0000-0000000000b1');
  if (public.add_commercial_order_line(sale_order, jsonb_build_object('patientCustomerId', patient_one, 'itemIds', jsonb_build_array(960000001)), '96000000-0000-0000-0000-0000000000b1')->>'lineId') <> first_line->>'lineId' then
    raise exception 'Add line must be retry-safe';
  end if;
  perform public.add_commercial_order_line(sale_order, jsonb_build_object('patientCustomerId', patient_two, 'itemIds', jsonb_build_array(960000001)), null);

  -- Account prices: 90 USD + 2700 CUP, then 90 USD → order 180 USD + 2700 CUP.
  select o.totals into order_totals from public.orders o where o.id = sale_order;
  if (order_totals->>'USD')::numeric <> 180 or (order_totals->>'CUP')::numeric <> 2700
    or (select cup_equivalent from public.orders where id = sale_order) <> 74700 then
    raise exception 'Order totals are wrong: %', order_totals;
  end if;
  if (select count(*) from public.order_lines where order_id = sale_order and added_by = '96000000-0000-0000-0000-000000000002') <> 2 then
    raise exception 'Lines must record who added them';
  end if;

  -- A shop customer (not of the account) cannot be a patient of the order.
  begin
    perform public.add_commercial_order_line(sale_order, jsonb_build_object('patientCustomerId', 0, 'itemIds', jsonb_build_array(960000001)), null);
    raise exception 'Foreign patient must be refused';
  exception when no_data_found then null;
  end;

  -- Direct writes are refused (the RPC flag lasts the transaction: clear it as a new request would).
  perform set_config('lensspace.commercial_rpc', '', true);
  begin
    insert into public.order_lines (order_id, organization_id, branch_id, line_number, patient_customer_id, totals)
    values (sale_order, 960000001, 960000001, 9, patient_one, '{}');
    raise exception 'Direct line insert must be refused';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.orders set commercial_status = 'confirmed' where id = sale_order;
    raise exception 'Direct status update must be refused';
  exception when insufficient_privilege then null;
  end;

  -- No production while the order is open.
  begin
    perform public.assign_production_jobs(sale_order, 'lens', '96000000-0000-0000-0000-000000000006', array[(first_line->>'lineId')::bigint]);
    raise exception 'Production must wait until the order is closed';
  exception when object_not_in_prerequisite_state then null;
  end;

  -- Readers: the seller lists the order and reads it with account prices.
  if jsonb_array_length(public.list_commercial_orders()) <> 1
    or (public.get_commercial_order(sale_order)->>'canManage')::boolean
    or jsonb_array_length(public.get_commercial_order(sale_order)->'lines') <> 2 then
    raise exception 'Seller readers are wrong';
  end if;
  if not exists (select 1 from jsonb_array_elements(public.get_commercial_price_list(sale_order)) entry
    where (entry->>'id')::bigint = 960000001 and (entry->>'price')::numeric = 90 and entry->>'priceSource' = 'account_discount') then
    raise exception 'Price list must show the account price';
  end if;

  -- The seller cannot close.
  begin
    perform public.close_commercial_order(sale_order);
    raise exception 'A seller without permission must not close';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Seller B sees nothing and cannot add.
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000003', true);
do $$
declare sale_order bigint := (select id from co_ids where key = 'order');
begin
  if exists (select 1 from public.orders where id = sale_order) or exists (select 1 from public.order_lines where order_id = sale_order)
    or jsonb_array_length(public.list_commercial_orders()) <> 0 then
    raise exception 'Another seller must not see the order';
  end if;
  begin
    perform public.get_commercial_order(sale_order);
    raise exception 'Another seller must not read the order';
  exception when no_data_found then null;
  end;
  begin
    perform public.add_commercial_order_line(sale_order, jsonb_build_object('patientCustomerId', (select id from co_ids where key = 'patient_one'), 'itemIds', jsonb_build_array(960000001)), null);
    raise exception 'Another seller must not add lines';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_commercial_orders_permission(960000004, true);
    raise exception 'A seller must not grant the permission';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Owner grants the exceptional permission to seller C.
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000001', true);
select public.set_commercial_orders_permission(960000004, true);

-- Seller C sees the order, closes it, reopens it with a reason.
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000004', true);
do $$
declare sale_order bigint := (select id from co_ids where key = 'order');
begin
  if not exists (select 1 from public.orders where id = sale_order) or (select count(*) from public.order_lines where order_id = sale_order) <> 2 then
    raise exception 'A seller with the permission must see the order and its lines';
  end if;
  perform public.close_commercial_order(sale_order);
  if (select commercial_status from public.orders where id = sale_order) <> 'confirmed'
    or (select closed_by from public.orders where id = sale_order) <> '96000000-0000-0000-0000-000000000004' then
    raise exception 'Close must confirm and stamp the actor';
  end if;
  begin
    perform public.reopen_commercial_order(sale_order, 'no');
    raise exception 'Reopen needs a reason';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- Seller A cannot add while closed.
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000002', true);
do $$
declare sale_order bigint := (select id from co_ids where key = 'order');
begin
  perform public.add_commercial_order_line(sale_order, jsonb_build_object('patientCustomerId', (select id from co_ids where key = 'patient_two'), 'itemIds', jsonb_build_array(960000002)), null);
  raise exception 'A closed order must refuse new lines';
exception when object_not_in_prerequisite_state then null;
end;
$$;

select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000004', true);
select public.reopen_commercial_order((select id from co_ids where key = 'order'), 'Faltaba un trabajo');

-- Seller A adds a third job, removes it with a reason; totals go back.
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000002', true);
do $$
declare
  sale_order bigint := (select id from co_ids where key = 'order');
  third jsonb := public.add_commercial_order_line(sale_order, jsonb_build_object('patientCustomerId', (select id from co_ids where key = 'patient_two'), 'itemIds', jsonb_build_array(960000002)), null);
begin
  if (select (totals->>'CUP')::numeric from public.orders where id = sale_order) <> 5400 then raise exception 'Third line must add 2700 CUP'; end if;
  begin
    perform public.remove_commercial_order_line((third->>'lineId')::bigint, 'x');
    raise exception 'Removal needs a reason';
  exception when invalid_parameter_value then null;
  end;
  perform public.remove_commercial_order_line((third->>'lineId')::bigint, 'Se pidió por error');
  if (select (totals->>'CUP')::numeric from public.orders where id = sale_order) <> 2700
    or (select removed_by from public.order_lines where id = (third->>'lineId')::bigint) <> '96000000-0000-0000-0000-000000000002' then
    raise exception 'Removal must restore totals and stamp the actor';
  end if;
  perform set_config('lensspace.commercial_rpc', '', true);
  begin
    update public.order_lines set removal_reason = 'otra cosa' where id = (third->>'lineId')::bigint;
    if found then raise exception 'Direct line update must be refused'; end if;
  exception when object_not_in_prerequisite_state or insufficient_privilege then null;
  end;
end;
$$;

-- Owner closes; seller A marks ready and delivers line by line on credit.
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000001', true);
select public.close_commercial_order((select id from co_ids where key = 'order'));

-- The permitted seller C assigns lens work to every active line; the removed one is refused.
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000004', true);
do $$
declare
  sale_order bigint := (select id from co_ids where key = 'order');
  active bigint[] := (select array_agg(id order by line_number) from public.order_lines where order_id = sale_order and removed_at is null);
  removed bigint := (select id from public.order_lines where order_id = sale_order and removed_at is not null);
  created bigint[];
begin
  created := public.assign_production_jobs(sale_order, 'lens', '96000000-0000-0000-0000-000000000006', active);
  if cardinality(created) <> 2 then raise exception 'Expected 2 lens jobs'; end if;
  if jsonb_array_length(public.get_order_production_panel(sale_order)->'pairs') <> 2 then
    raise exception 'The production panel must hide removed lines';
  end if;
  begin
    perform public.assign_production_jobs(sale_order, 'lens', '96000000-0000-0000-0000-000000000006', array[removed]);
    raise exception 'A removed line must not get production';
  exception when no_data_found then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000002', true);
do $$
declare
  sale_order bigint := (select id from co_ids where key = 'order');
  first_line bigint := (select id from public.order_lines where order_id = sale_order and line_number = 1);
  result jsonb;
begin
  perform public.mark_commercial_order_ready(sale_order);
  result := public.deliver_commercial_order_lines(sale_order, array[first_line]);
  if (result->>'pending')::int <> 1 or (select commercial_status from public.orders where id = sale_order) <> 'ready' then
    raise exception 'Partial delivery must keep the order ready: %', result;
  end if;
  begin
    perform public.deliver_commercial_order_lines(sale_order, array[first_line]);
    raise exception 'A delivered line cannot be delivered again';
  exception when invalid_parameter_value then null;
  end;
  result := public.deliver_commercial_order_lines(sale_order, null);
  if (result->>'pending')::int <> 0 or (result->>'balanceCup')::numeric <> 74700
    or (select commercial_status from public.orders where id = sale_order) <> 'delivered'
    or (select payment_status from public.orders where id = sale_order) <> 'unpaid' then
    raise exception 'Full delivery on credit must leave the order delivered and unpaid: %', result;
  end if;
end;
$$;

-- After delivery the owner cannot reopen.
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000001', true);
do $$
begin
  perform public.reopen_commercial_order((select id from co_ids where key = 'order'), 'Quiero cambiarlo');
  raise exception 'A delivered order cannot be reopened';
exception when object_not_in_prerequisite_state then null;
end;
$$;

-- Collections: seller A opens a second order and collects 100 USD split across both.
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000002', true);
do $$
declare
  first_order bigint := (select id from co_ids where key = 'order');
  second_order bigint := (public.open_commercial_order(960000001, 960000001, 960000001, 400, null)->>'orderId')::bigint;
  result jsonb;
  again jsonb;
begin
  perform public.add_commercial_order_line(second_order, jsonb_build_object('patientCustomerId', (select id from co_ids where key = 'patient_two'), 'itemIds', jsonb_build_array(960000001)), null);
  insert into co_ids values ('second', second_order);

  begin
    perform public.record_account_collection(960000001, 100, 'USD', jsonb_build_array(jsonb_build_object('orderId', first_order, 'amount', 50), jsonb_build_object('orderId', second_order, 'amount', 40)), null, null);
    raise exception 'A split that does not add up must be refused';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.record_account_collection(960000001, 200, 'USD', jsonb_build_array(jsonb_build_object('orderId', second_order, 'amount', 200)), null, null);
    raise exception 'Overpaying an order must be refused';
  exception when numeric_value_out_of_range then null;
  end;

  result := public.record_account_collection(960000001, 100, 'USD',
    jsonb_build_array(jsonb_build_object('orderId', first_order, 'amount', 60), jsonb_build_object('orderId', second_order, 'amount', 40)),
    'Pago del viernes', '96000000-0000-0000-0000-0000000000c1');
  again := public.record_account_collection(960000001, 100, 'USD',
    jsonb_build_array(jsonb_build_object('orderId', first_order, 'amount', 60), jsonb_build_object('orderId', second_order, 'amount', 40)),
    'Pago del viernes', '96000000-0000-0000-0000-0000000000c1');
  if not (again->>'duplicate')::boolean or (select count(*) from public.payments where collection_id = '96000000-0000-0000-0000-0000000000c1') <> 2
    or (select count(distinct cashbox_id) from public.payments where collection_id = '96000000-0000-0000-0000-0000000000c1') <> 1 then
    raise exception 'Collection must be one retry-safe split in one cashbox: %', result;
  end if;
  if (select payment_status from public.orders where id = first_order) <> 'partial'
    or (select payment_status from public.orders where id = second_order) <> 'partial' then
    raise exception 'Both orders must be partially paid';
  end if;
  if jsonb_array_length(public.list_account_collections(960000001)) <> 1 then
    raise exception 'The collection must be listed once';
  end if;

  -- Paying the rest of the delivered order closes it: 74700 - 24000 = 50700 CUP = 126.75 USD.
  perform public.record_account_collection(960000001, 126.75, 'USD', jsonb_build_array(jsonb_build_object('orderId', first_order, 'amount', 126.75)), null, null);
  if (select commercial_status from public.orders where id = first_order) <> 'closed'
    or (select payment_status from public.orders where id = first_order) <> 'paid' then
    raise exception 'A delivered commercial order closes once paid';
  end if;
end;
$$;

-- Seller B cannot collect orders it cannot see.
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000003', true);
do $$
begin
  perform public.record_account_collection(960000001, 10, 'USD', jsonb_build_array(jsonb_build_object('orderId', (select id from co_ids where key = 'second'), 'amount', 10)), null, null);
  raise exception 'Another seller must not collect';
exception when no_data_found then null;
end;
$$;

-- Owner of another organization sees nothing.
select set_config('request.jwt.claim.sub', '96000000-0000-0000-0000-000000000005', true);
do $$
begin
  if exists (select 1 from public.orders where id = (select id from co_ids where key = 'order')) then
    raise exception 'Cross-organization read must be empty';
  end if;
end;
$$;

reset role;
do $$
declare sale_order bigint := (select id from co_ids where key = 'order');
begin
  if exists (select 1 from private.notification_dispatches where order_id = sale_order) then
    raise exception 'Commercial orders must not queue WhatsApp';
  end if;
  if (select count(*) from public.audit_events where entity_type = 'order' and entity_id = sale_order::text and event_type like 'commercial_order.%') <> 8 then
    raise exception 'Expected 8 audit events (opened, closed, reopened, line_removed, closed, ready, delivered x2), got %',
      (select count(*) from public.audit_events where entity_type = 'order' and entity_id = sale_order::text);
  end if;
end;
$$;

rollback;
