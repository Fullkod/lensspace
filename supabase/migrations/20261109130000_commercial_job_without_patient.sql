-- Wholesale jobs no longer ask for a patient. order_lines.patient_customer_id and
-- prescriptions.customer_id are NOT NULL, so each optician gets one hidden patient per
-- branch, named after the optician. It never appears in the branch customer lists, which
-- already filter commercial_account_id is null.

alter table public.customers add column is_account_patient boolean not null default false;

create unique index customers_account_patient_key
  on public.customers (commercial_account_id, branch_id)
  where is_account_patient;

create function private.ensure_account_patient(target_organization_id bigint, target_branch_id bigint, target_account_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.commercial_accounts%rowtype;
  patient_id bigint;
begin
  select * into account from public.commercial_accounts
  where id = target_account_id and organization_id = target_organization_id and archived_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'La óptica minorista no está disponible.';
  end if;

  perform set_config('lensspace.commercial_rpc', 'on', true);
  insert into public.customers (organization_id, branch_id, full_name, created_by, commercial_account_id, messaging_consent, is_account_patient)
  values (account.organization_id, target_branch_id, account.name, (select auth.uid()), account.id, false, true)
  on conflict (commercial_account_id, branch_id) where is_account_patient do nothing
  returning id into patient_id;

  if patient_id is null then
    select id into patient_id from public.customers
    where commercial_account_id = account.id and branch_id = target_branch_id and is_account_patient;
  end if;
  return patient_id;
end;
$$;

revoke all on function private.ensure_account_patient(bigint, bigint, bigint) from public, anon, authenticated;

create function public.ensure_commercial_order_patient(target_order_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale_order public.orders%rowtype;
begin
  sale_order := private.lock_commercial_order(target_order_id, false);
  return jsonb_build_object(
    'id', private.ensure_account_patient(sale_order.organization_id, sale_order.branch_id, sale_order.commercial_account_id),
    'name', (select name from public.commercial_accounts where id = sale_order.commercial_account_id)
  );
end;
$$;

revoke all on function public.ensure_commercial_order_patient(bigint) from public, anon;
grant execute on function public.ensure_commercial_order_patient(bigint) to authenticated;

-- The hidden patient keeps the optician's name.
create function private.sync_account_patient_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.customers set full_name = new.name
  where commercial_account_id = new.id and is_account_patient;
  return new;
end;
$$;

create trigger commercial_accounts_sync_patient_name
after update of name on public.commercial_accounts
for each row when (old.name is distinct from new.name)
execute function private.sync_account_patient_name();
