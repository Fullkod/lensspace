-- Wholesale jobs use one hidden patient per optician and branch. Rollback-only.
begin;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('98000000-0000-0000-0000-000000000001', 'jp-owner@example.test', '{"display_name":"JP Owner"}', now()),
  ('98000000-0000-0000-0000-000000000002', 'jp-seller-a@example.test', '{"display_name":"JP Seller A"}', now()),
  ('98000000-0000-0000-0000-000000000003', 'jp-seller-c@example.test', '{"display_name":"JP Seller C"}', now());

insert into public.organizations (id, name, order_prefix, timezone) overriding system value values (980000001, 'Job Patient Test', 'JPQA', 'America/Havana');
insert into public.branches (id, organization_id, name, code) overriding system value values (980000001, 980000001, 'Main', 'MAIN');
insert into public.organization_memberships (organization_id, user_id, branch_id, role, status) values
  (980000001, '98000000-0000-0000-0000-000000000001', null, 'owner', 'active'),
  (980000001, '98000000-0000-0000-0000-000000000002', 980000001, 'seller', 'active'),
  (980000001, '98000000-0000-0000-0000-000000000003', 980000001, 'seller', 'active');
insert into public.subscriptions (organization_id, status, starts_on, expires_on) values (980000001, 'active', current_date - 1, current_date + 30);
insert into public.organization_modules (organization_id, module_key, changed_by) values (980000001, 'optical_sales', '98000000-0000-0000-0000-000000000001');
insert into public.commercial_accounts (id, organization_id, name, created_by) overriding system value values
  (980000001, 980000001, 'Óptica Mayor', '98000000-0000-0000-0000-000000000001');

create temporary table jp_ids (key text primary key, id bigint) on commit drop;
grant all on jp_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '98000000-0000-0000-0000-000000000002', true);
do $$
declare
  sale_order bigint := (public.open_commercial_order(980000001, 980000001, 980000001, 400, null)->>'orderId')::bigint;
  first_call jsonb := public.ensure_commercial_order_patient(sale_order);
  second_call jsonb := public.ensure_commercial_order_patient(sale_order);
begin
  if first_call->>'id' <> second_call->>'id' then raise exception 'One hidden patient per optician and branch'; end if;
  if first_call->>'name' <> 'Óptica Mayor' then raise exception 'The hidden patient takes the optician name: %', first_call; end if;
  if (select full_name from public.customers where id = (first_call->>'id')::bigint) <> 'Óptica Mayor' then raise exception 'Wrong patient name'; end if;
  insert into jp_ids values ('order', sale_order), ('patient', (first_call->>'id')::bigint);
end;
$$;

-- Another seller without the permission cannot touch the order.
select set_config('request.jwt.claim.sub', '98000000-0000-0000-0000-000000000003', true);
do $$
begin
  perform public.ensure_commercial_order_patient((select id from jp_ids where key = 'order'));
  raise exception 'Seller C must be refused';
exception when insufficient_privilege then null;
end;
$$;

-- Renaming the optician renames the hidden patient.
select set_config('request.jwt.claim.sub', '98000000-0000-0000-0000-000000000001', true);
update public.commercial_accounts set name = 'Óptica Mayor Nueva' where id = 980000001;
do $$
begin
  if (select full_name from public.customers where id = (select id from jp_ids where key = 'patient')) <> 'Óptica Mayor Nueva' then
    raise exception 'The hidden patient must follow the rename';
  end if;
end;
$$;

rollback;
