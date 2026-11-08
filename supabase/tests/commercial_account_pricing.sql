-- LEN0009 phase 2: account pricing on top of the catalog engine. Rollback-only, no
-- quotations, orders or payments (no WhatsApp).
begin;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('95000000-0000-0000-0000-000000000001', 'cp-owner@example.test', '{"display_name":"CP Owner"}', now()),
  ('95000000-0000-0000-0000-000000000002', 'cp-seller@example.test', '{"display_name":"CP Seller"}', now()),
  ('95000000-0000-0000-0000-000000000003', 'cp-other@example.test', '{"display_name":"CP Other"}', now());

insert into public.organizations (id, name, order_prefix, timezone) overriding system value values
  (950000001, 'Account Pricing Test', 'CPTQA', 'America/Havana'),
  (950000002, 'Account Pricing Other', 'CPOQA', 'America/Havana');
insert into public.branches (id, organization_id, name, code) overriding system value values
  (950000001, 950000001, 'Main', 'MAIN'),
  (950000002, 950000002, 'Main', 'MAIN');
insert into public.organization_memberships (organization_id, user_id, branch_id, role, status) values
  (950000001, '95000000-0000-0000-0000-000000000001', null, 'owner', 'active'),
  (950000001, '95000000-0000-0000-0000-000000000002', 950000001, 'seller', 'active'),
  (950000002, '95000000-0000-0000-0000-000000000003', null, 'owner', 'active');
insert into public.subscriptions (organization_id, status, starts_on, expires_on) values
  (950000001, 'active', current_date - 1, current_date + 30),
  (950000002, 'active', current_date - 1, current_date + 30);
insert into public.organization_modules (organization_id, module_key, changed_by) values
  (950000001, 'optical_sales', '95000000-0000-0000-0000-000000000001'),
  (950000002, 'optical_sales', '95000000-0000-0000-0000-000000000003');

insert into public.catalog_items (id, organization_id, category, code, name, sale_price, currency, is_active) overriding system value values
  (950000001, 950000001, 'vision_type', 'cp_progressive', 'Progresivo CP', 100, 'USD', true),
  (950000002, 950000001, 'frame', 'cp_frame', 'Armadura CP', 3000, 'CUP', true);
insert into public.graduation_rules (organization_id, code, name, applies_to_item_id, minimum_absolute_sphere, surcharge_amount, surcharge_currency, message) values
  (950000001, 'cp_high_power', 'Recargo CP', 950000001, 4, 900, 'CUP', 'Graduación alta.');
insert into public.customers (id, organization_id, branch_id, full_name, created_by) overriding system value values
  (950000001, 950000001, 950000001, 'Paciente CP', '95000000-0000-0000-0000-000000000001');
insert into public.prescriptions (id, organization_id, branch_id, customer_id, created_by) overriding system value values
  (950000001, 950000001, 950000001, 950000001, '95000000-0000-0000-0000-000000000001');
insert into public.prescription_revisions (id, organization_id, branch_id, prescription_id, revision_number, prescription_date, right_sphere, left_sphere, created_by) overriding system value values
  (950000001, 950000001, 950000001, 950000001, 1, current_date, -5, -4.5, '95000000-0000-0000-0000-000000000001');

-- X: 10 % + fixed frame 2500 CUP. Y: no discount + fixed progressive 80 USD. Z: archived.
-- O: account of the other organization.
insert into public.commercial_accounts (id, organization_id, name, discount_percent, created_by, archived_at) overriding system value values
  (950000001, 950000001, 'Óptica X', 10, '95000000-0000-0000-0000-000000000001', null),
  (950000002, 950000001, 'Óptica Y', 0, '95000000-0000-0000-0000-000000000001', null),
  (950000003, 950000001, 'Óptica Z', 0, '95000000-0000-0000-0000-000000000001', now()),
  (950000004, 950000002, 'Óptica O', 0, '95000000-0000-0000-0000-000000000003', null);

set local role authenticated;
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000001', true);
insert into public.commercial_account_prices (account_id, organization_id, catalog_item_id, sale_price, currency) values
  (950000001, 950000001, 950000002, 2500, 'CUP'),
  (950000002, 950000001, 950000001, 80, 'USD');

-- Seller prices: the account rules apply even though prices are owner-only to read.
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000002', true);
do $$
declare
  items bigint[] := array[950000001, 950000002];
  retail jsonb := public.calculate_sale_price(950000001, items, 950000001, 400, '{}'::jsonb);
  x jsonb := public.calculate_sale_price(950000001, items, 950000001, 400, '{}'::jsonb, 950000001);
  y jsonb := public.calculate_sale_price(950000001, items, 950000001, 400, '{}'::jsonb, 950000002);
  sources text;
begin
  -- Retail unchanged: 100 USD + 3000 CUP + 900 CUP surcharge.
  if (retail->'totals'->>'USD')::numeric <> 100 or (retail->'totals'->>'CUP')::numeric <> 3900
    or (retail->>'cupEquivalent')::numeric <> 43900 or retail ? 'commercialAccountId' then
    raise exception 'Retail pricing changed: %', retail;
  end if;

  -- X: progressive 90 USD (discount), frame 2500 CUP (fixed), surcharge 810 CUP (discount).
  if (x->'totals'->>'USD')::numeric <> 90 or (x->'totals'->>'CUP')::numeric <> 3310
    or (x->>'cupEquivalent')::numeric <> 39310 or (x->>'commercialAccountId')::bigint <> 950000001 then
    raise exception 'Account X pricing is wrong: %', x;
  end if;
  select string_agg(value->>'priceSource', ',' order by value->>'name') into sources from jsonb_array_elements(x->'lineItems');
  if sources <> 'account_fixed,account_discount,account_discount' then
    raise exception 'Account X sources are wrong: % (%)', sources, x->'lineItems';
  end if;
  if not exists (select 1 from jsonb_array_elements(x->'lineItems') line
    where line->>'itemId' = '950000002' and (line->>'catalogAmount')::numeric = 3000 and (line->>'baseAmount')::numeric = 2500) then
    raise exception 'Account line must keep the catalog amount and use the account price as base';
  end if;

  -- Y: progressive 80 USD (fixed), frame and surcharge at catalog price.
  if (y->'totals'->>'USD')::numeric <> 80 or (y->'totals'->>'CUP')::numeric <> 3900 then
    raise exception 'Account Y pricing is wrong: %', y;
  end if;

  -- Manual adjustment measured against the account price (90): 85 is fine for a seller…
  perform public.calculate_sale_price(950000001, items, 950000001, 400,
    jsonb_build_object('950000001', jsonb_build_object('amount', 85, 'reason', 'Cliente fijo')), 950000001);
  -- …80 is more than 10 % below 90 and needs the owner.
  begin
    perform public.calculate_sale_price(950000001, items, 950000001, 400,
      jsonb_build_object('950000001', jsonb_build_object('amount', 80, 'reason', 'Rebaja grande')), 950000001);
    raise exception 'A seller discount above 10 %% of the account price must be refused';
  exception when insufficient_privilege then null;
  end;

  -- Archived account and an account of another organization are refused.
  begin
    perform public.calculate_sale_price(950000001, items, null, 400, '{}'::jsonb, 950000003);
    raise exception 'Archived account must be refused';
  exception when no_data_found then null;
  end;
  begin
    perform public.calculate_sale_price(950000001, items, null, 400, '{}'::jsonb, 950000004);
    raise exception 'Foreign account must be refused';
  exception when no_data_found then null;
  end;
end;
$$;

-- An owner of another organization cannot price with this organization's accounts.
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000003', true);
do $$
begin
  perform private.apply_account_prices('{"lineItems":[]}'::jsonb, 950000001, 950000001, 400);
  raise exception 'Foreign user must be refused';
exception when insufficient_privilege then null;
end;
$$;

reset role;
rollback;
