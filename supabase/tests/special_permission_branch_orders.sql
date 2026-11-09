-- The special seller permission covers every retail order of the seller's branch, and
-- nothing else. Transactional fixture: everything is rolled back at the end (WhatsApp
-- notices only queue a pg_net request, discarded by the rollback).
begin;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('97000000-0000-0000-0000-000000000001', 'sp-owner@example.test', '{"display_name":"SP Owner"}', now()),
  ('97000000-0000-0000-0000-000000000002', 'sp-seller-a@example.test', '{"display_name":"SP Seller A"}', now()),
  ('97000000-0000-0000-0000-000000000003', 'sp-seller-b@example.test', '{"display_name":"SP Seller B"}', now()),
  ('97000000-0000-0000-0000-000000000004', 'sp-seller-c@example.test', '{"display_name":"SP Seller C"}', now()),
  ('97000000-0000-0000-0000-000000000005', 'sp-seller-d@example.test', '{"display_name":"SP Seller D"}', now()),
  ('97000000-0000-0000-0000-000000000006', 'sp-lens@example.test', '{"display_name":"SP Lens"}', now());

insert into public.organizations (id, name, order_prefix, timezone) overriding system value values (970000001, 'Special Permission Test', 'SPQA', 'America/Havana');
insert into public.branches (id, organization_id, name, code) overriding system value values
  (970000001, 970000001, 'Main', 'MAIN'),
  (970000002, 970000001, 'Other', 'OTHER');
-- A sells. B has the permission in the same branch. C has no permission. D has it in another branch.
insert into public.organization_memberships (id, organization_id, user_id, branch_id, role, status, can_manage_commercial_orders) overriding system value values
  (970000001, 970000001, '97000000-0000-0000-0000-000000000001', null, 'owner', 'active', false),
  (970000002, 970000001, '97000000-0000-0000-0000-000000000002', 970000001, 'seller', 'active', false),
  (970000003, 970000001, '97000000-0000-0000-0000-000000000003', 970000001, 'seller', 'active', true),
  (970000004, 970000001, '97000000-0000-0000-0000-000000000004', 970000001, 'seller', 'active', false),
  (970000005, 970000001, '97000000-0000-0000-0000-000000000005', 970000002, 'seller', 'active', true),
  (970000006, 970000001, '97000000-0000-0000-0000-000000000006', null, 'lens_provider', 'active', false);
insert into public.subscriptions (organization_id, status, starts_on, expires_on) values (970000001, 'active', current_date - 1, current_date + 30);
insert into public.organization_modules (organization_id, module_key, changed_by) values
  (970000001, 'optical_sales', '97000000-0000-0000-0000-000000000001'),
  (970000001, 'production', '97000000-0000-0000-0000-000000000001'),
  (970000001, 'cashbox', '97000000-0000-0000-0000-000000000001'),
  (970000001, 'whatsapp', '97000000-0000-0000-0000-000000000001');
insert into public.customers (id, organization_id, branch_id, full_name, created_by) overriding system value values
  (970000001, 970000001, 970000001, 'Holder', '97000000-0000-0000-0000-000000000002');
insert into public.catalog_items (id, organization_id, category, code, name, sale_price, currency, is_active) overriding system value values
  (970000001, 970000001, 'vision_type', 'sp_single', 'Monofocal SP', 100, 'USD', true);

create temporary table sp_ids (key text primary key, id bigint) on commit drop;
grant all on sp_ids to authenticated;

set local role authenticated;

-- Seller A sells 100 USD at 400 and collects 10 USD.
select set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000002', true);
do $$
declare
  quote_id bigint := (public.save_multi_line_quotation(null, 970000001, 970000001, 970000001, jsonb_build_array(
    jsonb_build_object('patientCustomerId', 970000001, 'itemIds', jsonb_build_array(970000001))), 400, null, null)->>'quotationId')::bigint;
  sale_order bigint := (public.accept_quotation(quote_id)->>'orderId')::bigint;
begin
  insert into sp_ids values ('order', sale_order);
  perform public.register_cash_payment(sale_order, 10, 'USD', 400, null, null);
end;
$$;

-- C (no permission, same branch) and D (permission, other branch) see and do nothing.
create function pg_temp.assert_no_access(seller uuid) returns void language plpgsql as $$
declare
  sale_order bigint := (select id from sp_ids where key = 'order');
begin
  perform set_config('request.jwt.claim.sub', seller::text, true);
  if (select count(*) from public.orders) <> 0 or (select count(*) from public.payments) <> 0 then
    raise exception 'Seller % must not read orders or payments', seller;
  end if;
  if jsonb_array_length(public.list_accessible_orders()) <> 0 or jsonb_array_length(public.list_accessible_production_jobs()) <> 0 then
    raise exception 'Seller % must not list orders or jobs', seller;
  end if;
  begin
    perform public.register_cash_payment(sale_order, 1, 'USD', 400, null, null);
    raise exception 'Seller % must not collect', seller;
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.notify_order_ready(sale_order, gen_random_uuid());
    raise exception 'Seller % must not send the notice', seller;
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.assign_production_job(sale_order, 'lens', '97000000-0000-0000-0000-000000000006');
    raise exception 'Seller % must not assign production', seller;
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mark_order_delivered(sale_order);
    raise exception 'Seller % must not deliver', seller;
  exception when no_data_found then null;
  end;
end;
$$;
select pg_temp.assert_no_access('97000000-0000-0000-0000-000000000004');
select pg_temp.assert_no_access('97000000-0000-0000-0000-000000000005');

-- Without the permission a seller still reads only their own profile.
select set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000004', true);
do $$
begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'C must only read their own profile'; end if;
end;
$$;

-- B works the whole order.
select set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000003', true);
do $$
declare
  sale_order bigint := (select id from sp_ids where key = 'order');
  listed jsonb := public.list_accessible_orders();
  summary jsonb := public.get_order_detail(sale_order)->'summary';
  job_id bigint;
begin
  if jsonb_array_length(listed) <> 1 or (listed->0->>'paidCup')::numeric <> 4000 or (listed->0->>'balanceCup')::numeric <> 36000 then
    raise exception 'B must see the order with paid and balance: %', listed;
  end if;
  if (summary->>'paidCup')::numeric <> 4000 or jsonb_array_length(summary->'payments') <> 1 then
    raise exception 'B must see the payment detail: %', summary;
  end if;

  -- Quotations and other sellers' cashboxes stay private.
  if (select count(*) from public.quotations) <> 0 then raise exception 'B must not read quotations of A'; end if;
  if (select count(*) from public.seller_cashboxes) <> 0
    or jsonb_array_length(public.list_accessible_cashboxes(null, null, null)) <> 0 then
    raise exception 'B must not read the cashbox of A';
  end if;

  perform public.notify_order_ready(sale_order, gen_random_uuid());

  job_id := public.assign_production_job(sale_order, 'lens', '97000000-0000-0000-0000-000000000006');
  if jsonb_array_length(public.list_accessible_production_jobs()) <> 1
    or public.list_accessible_production_jobs()->0->>'providerName' <> 'SP Lens' then
    raise exception 'B must see the job with its provider: %', public.list_accessible_production_jobs();
  end if;
  perform public.transition_production_job(job_id, 'ready_to_send', null);

  -- Delivery still requires a zero balance.
  begin
    perform public.mark_order_delivered(sale_order);
    raise exception 'An order with balance must not be delivered';
  exception when check_violation then null;
  end;

  perform public.register_cash_payment(sale_order, 90, 'USD', 400, null, null);
  if (select received_by from public.payments order by id desc limit 1) <> '97000000-0000-0000-0000-000000000003' then
    raise exception 'The payment must be attributed to B';
  end if;
  if (select count(*) from public.seller_cashboxes where seller_id = '97000000-0000-0000-0000-000000000003') <> 1 then
    raise exception 'The money must go to the cashbox of B';
  end if;

  perform public.mark_order_delivered(sale_order);
  if (select delivered_by from public.orders where id = sale_order) <> '97000000-0000-0000-0000-000000000003'
    or (select commercial_status from public.orders where id = sale_order) <> 'delivered' then
    raise exception 'Delivery must be attributed to B';
  end if;
end;
$$;

-- Revoking the permission closes the access again.
select set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000001', true);
select public.set_commercial_orders_permission(970000003, false);
select set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000003', true);
do $$
begin
  if (select count(*) from public.orders) <> 0 then raise exception 'Revoked seller must not read orders'; end if;
end;
$$;

rollback;
