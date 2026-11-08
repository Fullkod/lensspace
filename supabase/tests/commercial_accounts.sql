-- LEN0009 phase 1: retail optician accounts and their prices. Transactional fixture:
-- everything is rolled back at the end. No orders or payments are created (no WhatsApp).
begin;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('94000000-0000-0000-0000-000000000001', 'ca-owner@example.test', '{"display_name":"CA Owner"}', now()),
  ('94000000-0000-0000-0000-000000000002', 'ca-seller@example.test', '{"display_name":"CA Seller"}', now()),
  ('94000000-0000-0000-0000-000000000003', 'ca-other@example.test', '{"display_name":"CA Other Owner"}', now());

insert into public.organizations (id, name, order_prefix, timezone) overriding system value values
  (940000001, 'Commercial Accounts Test', 'CATQA', 'America/Havana'),
  (940000002, 'Other Org Test', 'COTQA', 'America/Havana');
insert into public.branches (id, organization_id, name, code) overriding system value values
  (940000001, 940000001, 'Main', 'MAIN'),
  (940000002, 940000002, 'Main', 'MAIN');
insert into public.organization_memberships (organization_id, user_id, branch_id, role, status) values
  (940000001, '94000000-0000-0000-0000-000000000001', null, 'owner', 'active'),
  (940000001, '94000000-0000-0000-0000-000000000002', 940000001, 'seller', 'active'),
  (940000002, '94000000-0000-0000-0000-000000000003', null, 'owner', 'active');
insert into public.subscriptions (organization_id, status, starts_on, expires_on) values
  (940000001, 'active', current_date - 1, current_date + 30),
  (940000002, 'active', current_date - 1, current_date + 30);
insert into public.organization_modules (organization_id, module_key, changed_by) values
  (940000001, 'optical_sales', '94000000-0000-0000-0000-000000000001'),
  (940000002, 'optical_sales', '94000000-0000-0000-0000-000000000003');
insert into public.catalog_items (id, organization_id, category, code, name, sale_price, currency, is_active) overriding system value values
  (940000001, 940000001, 'frame', 'ca_frame', 'Armadura CA', 3000, 'CUP', true),
  (940000002, 940000002, 'frame', 'co_frame', 'Armadura otra org', 10, 'USD', true);

create temporary table ca_ids (key text primary key, id bigint) on commit drop;
grant all on ca_ids to authenticated;

set local role authenticated;

-- Owner: create, edit, price, archive.
select set_config('request.jwt.claim.sub', '94000000-0000-0000-0000-000000000001', true);
do $$
declare
  account bigint;
begin
  insert into public.commercial_accounts (organization_id, name, phone, payment_terms, credit_days, discount_percent, created_by)
  values (940000001, 'Óptica Sol', '+53 5555 0000', 'Paga a fin de mes', 30, 15, '94000000-0000-0000-0000-000000000001')
  returning id into account;
  insert into ca_ids values ('sol', account);

  update public.commercial_accounts set contact_name = 'María', discount_percent = 12.5 where id = account;

  -- A second active account with the same name (case/spaces ignored) is refused.
  begin
    insert into public.commercial_accounts (organization_id, name, created_by) values (940000001, '  óptica sol ', '94000000-0000-0000-0000-000000000001');
    raise exception 'Duplicate active name must be refused';
  exception when unique_violation then null;
  end;

  -- Discount over 90 % is refused.
  begin
    update public.commercial_accounts set discount_percent = 95 where id = account;
    raise exception 'Discount above 90 must be refused';
  exception when check_violation then null;
  end;

  -- Fixed price for an own item; the stamp is the current user.
  insert into public.commercial_account_prices (account_id, organization_id, catalog_item_id, sale_price, currency)
  values (account, 940000001, 940000001, 2500, 'CUP');
  update public.commercial_account_prices set sale_price = 20, currency = 'USD' where account_id = account and catalog_item_id = 940000001;
  if (select changed_by from public.commercial_account_prices where account_id = account) <> '94000000-0000-0000-0000-000000000001' then
    raise exception 'Price stamp must be the current user';
  end if;

  -- An item of another organization is refused.
  begin
    insert into public.commercial_account_prices (account_id, organization_id, catalog_item_id, sale_price, currency)
    values (account, 940000001, 940000002, 5, 'USD');
    raise exception 'Foreign catalog item must be refused';
  exception when foreign_key_violation then null;
  end;

  -- The owner links a patient to the account.
  insert into public.customers (organization_id, branch_id, full_name, created_by, commercial_account_id)
  values (940000001, 940000001, 'Paciente de Sol', '94000000-0000-0000-0000-000000000001', account);

  -- Archive frees the name.
  update public.commercial_accounts set archived_at = now() where id = account;
  insert into public.commercial_accounts (organization_id, name, created_by) values (940000001, 'Óptica Sol', '94000000-0000-0000-0000-000000000001');
end;
$$;

-- Seller: sees no accounts or prices and cannot write them or link customers.
select set_config('request.jwt.claim.sub', '94000000-0000-0000-0000-000000000002', true);
do $$
declare
  account bigint := (select id from ca_ids where key = 'sol');
  affected integer;
begin
  if exists (select 1 from public.commercial_accounts) or exists (select 1 from public.commercial_account_prices) then
    raise exception 'A seller must not read accounts or prices';
  end if;
  begin
    insert into public.commercial_accounts (organization_id, name, created_by) values (940000001, 'Óptica Luna', '94000000-0000-0000-0000-000000000002');
    raise exception 'A seller must not create accounts';
  exception when insufficient_privilege then null;
  end;
  update public.commercial_accounts set discount_percent = 50 where id = account;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'A seller must not edit accounts'; end if;
  begin
    insert into public.customers (organization_id, branch_id, full_name, created_by, commercial_account_id)
    values (940000001, 940000001, 'Paciente colado', '94000000-0000-0000-0000-000000000002', account);
    raise exception 'A seller must not link customers to an account';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Owner of another organization: sees nothing and cannot use the account.
select set_config('request.jwt.claim.sub', '94000000-0000-0000-0000-000000000003', true);
do $$
declare
  account bigint := (select id from ca_ids where key = 'sol');
begin
  if exists (select 1 from public.commercial_accounts where organization_id = 940000001) then
    raise exception 'Cross-organization read must be empty';
  end if;
  begin
    insert into public.commercial_account_prices (account_id, organization_id, catalog_item_id, sale_price, currency)
    values (account, 940000001, 940000001, 1, 'USD');
    raise exception 'Cross-organization price must be refused';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;
