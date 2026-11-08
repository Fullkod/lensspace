-- LEN0009: retail opticians ("ópticas minoristas") the organization sells to. They have
-- no LensSpace user: staff record their orders (LEN0010). Each account has its own
-- payment terms and price rules: a general discount on the catalog price plus fixed
-- prices per catalog item (the fixed price wins). Accounts and prices are owner-only;
-- sellers will get a names-only reader when commercial orders arrive (LEN0010).
-- Patients of an account are customers linked to it and stay out of the branch lists.

create table public.commercial_accounts (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  contact_name text check (contact_name is null or char_length(btrim(contact_name)) between 2 and 160),
  phone text check (phone is null or char_length(btrim(phone)) between 6 and 40),
  email text check (email is null or (char_length(email) <= 160 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  address text check (address is null or char_length(address) <= 300),
  payment_terms text check (payment_terms is null or char_length(payment_terms) <= 300),
  credit_days smallint check (credit_days is null or credit_days between 0 and 365),
  discount_percent numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 90),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid not null references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_accounts_id_organization_key unique (id, organization_id)
);

-- One active account per name in an organization (archived ones may repeat it).
create unique index commercial_accounts_active_name_key
  on public.commercial_accounts (organization_id, lower(btrim(name)))
  where archived_at is null;

create trigger commercial_accounts_set_updated_at
before update on public.commercial_accounts
for each row execute function private.set_updated_at();

create table public.commercial_account_prices (
  account_id bigint not null,
  organization_id bigint not null,
  catalog_item_id bigint not null references public.catalog_items(id) on delete cascade,
  sale_price numeric(12,2) not null check (sale_price >= 0),
  currency text not null check (currency in ('CUP', 'USD')),
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  primary key (account_id, catalog_item_id),
  foreign key (account_id, organization_id)
    references public.commercial_accounts(id, organization_id) on delete cascade
);

create index commercial_account_prices_item_idx on public.commercial_account_prices (catalog_item_id);
create index commercial_account_prices_organization_idx on public.commercial_account_prices (organization_id);

-- The item must be visible to the organization (global or its own), and the stamp is
-- always the current user and time.
create function private.prepare_commercial_account_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.catalog_items item
    where item.id = new.catalog_item_id
      and (item.organization_id is null or item.organization_id = new.organization_id)
  ) then
    raise exception using errcode = '23503', message = 'El artículo no pertenece al catálogo de la organización.';
  end if;
  new.changed_by := (select auth.uid());
  new.changed_at := now();
  return new;
end;
$$;

revoke all on function private.prepare_commercial_account_price() from public, anon, authenticated;

create trigger commercial_account_prices_prepare
before insert or update on public.commercial_account_prices
for each row execute function private.prepare_commercial_account_price();

-- Owner of an organization that can operate sales.
create function private.can_manage_commercial_accounts(target_organization_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_organization_role(target_organization_id, array['owner'])
    and private.can_operate_in_organization(target_organization_id, 'optical_sales');
$$;

revoke all on function private.can_manage_commercial_accounts(bigint) from public, anon;
grant execute on function private.can_manage_commercial_accounts(bigint) to authenticated;

alter table public.commercial_accounts enable row level security;
alter table public.commercial_account_prices enable row level security;

create policy commercial_accounts_select_owner on public.commercial_accounts
for select to authenticated
using ((select private.has_organization_role(organization_id, array['owner'])));

create policy commercial_accounts_insert_owner on public.commercial_accounts
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.can_manage_commercial_accounts(organization_id))
);

create policy commercial_accounts_update_owner on public.commercial_accounts
for update to authenticated
using ((select private.can_manage_commercial_accounts(organization_id)))
with check ((select private.can_manage_commercial_accounts(organization_id)));

create policy commercial_account_prices_select_owner on public.commercial_account_prices
for select to authenticated
using ((select private.has_organization_role(organization_id, array['owner'])));

create policy commercial_account_prices_insert_owner on public.commercial_account_prices
for insert to authenticated
with check ((select private.can_manage_commercial_accounts(organization_id)));

create policy commercial_account_prices_update_owner on public.commercial_account_prices
for update to authenticated
using ((select private.can_manage_commercial_accounts(organization_id)))
with check ((select private.can_manage_commercial_accounts(organization_id)));

create policy commercial_account_prices_delete_owner on public.commercial_account_prices
for delete to authenticated
using ((select private.can_manage_commercial_accounts(organization_id)));

revoke all on public.commercial_accounts from anon;
revoke all on public.commercial_account_prices from anon;
revoke all on public.commercial_accounts from authenticated;
revoke all on public.commercial_account_prices from authenticated;
grant select on public.commercial_accounts to authenticated;
grant insert (organization_id, name, contact_name, phone, email, address, payment_terms, credit_days, discount_percent, notes, created_by)
  on public.commercial_accounts to authenticated;
grant update (name, contact_name, phone, email, address, payment_terms, credit_days, discount_percent, notes, archived_at)
  on public.commercial_accounts to authenticated;
grant select, delete on public.commercial_account_prices to authenticated;
grant insert (account_id, organization_id, catalog_item_id, sale_price, currency)
  on public.commercial_account_prices to authenticated;
grant update (sale_price, currency) on public.commercial_account_prices to authenticated;

-- Patients of a retail optician: ordinary customers linked to the account, hidden from
-- the branch customer lists. Null = the shop's own customer.
alter table public.customers add column commercial_account_id bigint;
alter table public.customers
  add constraint customers_commercial_account_fkey
  foreign key (commercial_account_id, organization_id)
  references public.commercial_accounts(id, organization_id);
create index customers_commercial_account_idx
  on public.customers (commercial_account_id)
  where commercial_account_id is not null;

-- customers has a table-wide INSERT grant: only the owner may link a customer to an
-- account until LEN0010 adds the patient RPC (which will widen this check).
create function private.guard_customer_commercial_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.commercial_account_id is distinct from (case when tg_op = 'UPDATE' then old.commercial_account_id end)
    and not private.can_manage_commercial_accounts(new.organization_id) then
    raise exception using errcode = '42501', message = 'No puedes vincular clientes a una óptica minorista.';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_customer_commercial_account() from public, anon, authenticated;

create trigger customers_guard_commercial_account
before insert or update of commercial_account_id on public.customers
for each row execute function private.guard_customer_commercial_account();
