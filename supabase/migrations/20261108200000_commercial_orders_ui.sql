-- LEN0010 phase 4: readers for the commercial orders screens, production rules for
-- commercial orders and the advisor follow-ups of phase 3.

-- A. Advisors: composite FK indexes and one SELECT policy on orders ----------------------

drop index if exists public.orders_commercial_account_idx;
create index orders_commercial_account_idx on public.orders (commercial_account_id, organization_id) where commercial_account_id is not null;
drop index if exists public.customers_commercial_account_idx;
create index customers_commercial_account_idx on public.customers (commercial_account_id, organization_id) where commercial_account_id is not null;
create index commercial_account_prices_account_org_idx on public.commercial_account_prices (account_id, organization_id);
create index commercial_account_prices_changed_by_idx on public.commercial_account_prices (changed_by);
create index commercial_accounts_created_by_idx on public.commercial_accounts (created_by);

drop policy orders_select_commercial_manager on public.orders;
drop policy orders_select on public.orders;
create policy orders_select on public.orders
for select to authenticated
using (
  (select private.can_access_seller_sale(organization_id, branch_id, primary_seller_id))
  or (order_kind = 'commercial' and (select private.can_manage_branch_commercial_orders(organization_id, branch_id)))
);

-- B. Production -------------------------------------------------------------------------

-- Same as LEN0006 phase 5 plus, for commercial orders: only once closed (confirmed or
-- ready), never on removed or delivered lines, and the exceptional seller may assign.
create or replace function private.assign_production_job(target_order_id bigint, target_job_type text, target_provider_id uuid, target_order_line_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale_order public.orders%rowtype;
  provider_role text;
  actor_role text;
  created_job_id bigint;
  snapshot jsonb;
  sale_line public.order_lines%rowtype;
  line_count integer;
begin
  if target_job_type not in ('lens', 'mounting') then
    raise exception using errcode = '22023', message = 'Tipo de trabajo no válido.';
  end if;
  select * into sale_order from public.orders where id = target_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Pedido no encontrado.'; end if;
  actor_role := private.production_actor_role(sale_order.organization_id);
  if actor_role not in ('owner', 'seller')
    or (actor_role = 'seller' and sale_order.primary_seller_id <> (select auth.uid())
      and not (sale_order.order_kind = 'commercial' and private.can_manage_branch_commercial_orders(sale_order.organization_id, sale_order.branch_id)))
    or not private.can_operate_in_organization(sale_order.organization_id, 'production') then
    raise exception using errcode = '42501', message = 'No puedes asignar producción para este pedido.';
  end if;
  if sale_order.order_kind = 'commercial' and sale_order.commercial_status not in ('confirmed', 'ready') then
    raise exception using errcode = '55000', message = 'Cierra el pedido para mandarlo a fabricar.';
  end if;
  provider_role := case when target_job_type = 'lens' then 'lens_provider' else 'mounting_provider' end;
  -- An active owner/seller of the organization is a valid in-house workshop.
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = sale_order.organization_id
      and membership.user_id = target_provider_id
      and membership.role in (provider_role, 'owner', 'seller') and membership.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'El responsable no está activo en la organización con un rol válido para este trabajo.';
  end if;
  -- LEN0006: every job belongs to one pair. Without a pair only single-pair orders work.
  select count(*) into line_count from public.order_lines where order_id = sale_order.id and removed_at is null;
  if target_order_line_id is null then
    if line_count > 1 then
      raise exception using errcode = '23502', message = 'Indica el par del trabajo.';
    end if;
    select * into sale_line from public.order_lines where order_id = sale_order.id and removed_at is null order by line_number limit 1;
  else
    select * into sale_line from public.order_lines where id = target_order_line_id and order_id = sale_order.id;
  end if;
  if sale_line.id is null or sale_line.removed_at is not null then
    raise exception using errcode = 'P0002', message = 'Par no encontrado en este pedido.';
  end if;
  if sale_line.delivered_at is not null then
    raise exception using errcode = '55000', message = 'Ese trabajo ya se entregó.';
  end if;
  if exists (select 1 from public.production_jobs where order_line_id = sale_line.id and job_type = target_job_type and is_current) then
    raise exception using errcode = '23505', message = case when line_count > 1
      then 'El par ' || sale_line.line_number || ' ya tiene un trabajo activo de ese tipo.'
      else 'El pedido ya tiene un trabajo activo de ese tipo.' end;
  end if;

  select jsonb_build_object(
    'orderNumber', sale_order.order_number,
    'jobType', target_job_type,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'category', item.category, 'name', item.name, 'position', item.position
    ) order by item.position) from public.order_items item where item.order_line_id = sale_line.id), '[]'::jsonb),
    'prescription', (select to_jsonb(revision) - array['created_by', 'change_reason', 'notes']
      from public.prescription_revisions revision where revision.id = sale_line.prescription_revision_id),
    -- Providers see "Par 2 de 3", never who wears it.
    'lineNumber', sale_line.line_number,
    'lineCount', line_count
  ) into snapshot;

  insert into public.production_jobs (
    order_id, order_line_id, organization_id, branch_id, job_type, provider_id, work_snapshot, assigned_by
  ) values (
    sale_order.id, sale_line.id, sale_order.organization_id, sale_order.branch_id, target_job_type,
    target_provider_id, snapshot, (select auth.uid())
  ) returning id into created_job_id;
  insert into public.production_job_events (
    job_id, organization_id, branch_id, from_status, to_status, actor_id, actor_role, notes
  ) values (
    created_job_id, sale_order.organization_id, sale_order.branch_id, null, 'pending',
    (select auth.uid()), actor_role, 'Trabajo asignado.'
  );
  return created_job_id;
end;
$$;

-- "Asignar a todos": up to 200 lines (commercial orders); retail orders have at most 10.
create or replace function public.assign_production_jobs(target_order_id bigint, job_type text, provider_id uuid, target_order_line_ids bigint[])
returns bigint[]
language plpgsql
set search_path = ''
as $$
declare
  line_id bigint;
  created bigint[] := '{}';
begin
  if coalesce(cardinality(target_order_line_ids), 0) not between 1 and 200
    or cardinality(target_order_line_ids) <> (select count(distinct value) from unnest(target_order_line_ids) value) then
    raise exception using errcode = '22023', message = 'Indica pares distintos del pedido.';
  end if;
  foreach line_id in array target_order_line_ids loop
    created := created || private.assign_production_job(target_order_id, job_type, provider_id, line_id);
  end loop;
  return created;
end;
$$;

-- Panel: removed lines are not pairs any more.
create or replace function public.get_order_production_panel(target_order_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with sale_order as (
    select id, organization_id from public.orders where id = target_order_id
  ), assignee_roles as (
    select membership.user_id,
      case when membership.role in ('owner', 'seller') then 'in_house' else membership.role end as role
    from public.organization_memberships membership
    join sale_order on sale_order.organization_id = membership.organization_id
    where membership.status = 'active'
      and (membership.role in ('lens_provider', 'mounting_provider')
        or (membership.role in ('owner', 'seller') and membership.user_id = (select auth.uid())))
  ), jobs as (
    select job.id, job.job_type, job.status, job.provider_id, job.order_line_id
    from public.production_jobs job
    join sale_order on sale_order.id = job.order_id
    where job.is_current
  )
  select case when not exists (select 1 from sale_order) then null else jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
      'id', jobs.id, 'orderLineId', jobs.order_line_id, 'jobType', jobs.job_type, 'status', jobs.status, 'providerId', jobs.provider_id,
      'providerName', coalesce(profile.display_name, 'Proveedor')) order by jobs.id)
      from jobs left join public.profiles profile on profile.user_id = jobs.provider_id), '[]'::jsonb),
    'pairs', coalesce((select jsonb_agg(jsonb_build_object(
      'id', line.id, 'lineNumber', line.line_number, 'patientName', coalesce(patient.full_name, 'Paciente')
    ) order by line.line_number)
      from public.order_lines line join sale_order on sale_order.id = line.order_id
      left join public.customers patient on patient.id = line.patient_customer_id
      where line.removed_at is null), '[]'::jsonb),
    'assignees', coalesce((select jsonb_agg(jsonb_build_object(
      'id', grouped.user_id, 'name', coalesce(profile.display_name, 'Proveedor'), 'roles', grouped.roles))
      from (select user_id, jsonb_agg(distinct role) as roles from assignee_roles group by user_id) grouped
      left join public.profiles profile on profile.user_id = grouped.user_id), '[]'::jsonb)
  ) end;
$$;

-- C. Readers ----------------------------------------------------------------------------

create function private.can_see_commercial_order(target_organization_id bigint, target_branch_id bigint, target_seller_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_access_seller_sale(target_organization_id, target_branch_id, target_seller_id)
    or private.can_manage_branch_commercial_orders(target_organization_id, target_branch_id);
$$;

revoke all on function private.can_see_commercial_order(bigint, bigint, uuid) from public, anon;
grant execute on function private.can_see_commercial_order(bigint, bigint, uuid) to authenticated;

-- Commercial orders the caller can see, newest first (optionally one account).
create function public.list_commercial_orders(target_account_id bigint default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb)
  from (
    select sale_order.created_at, jsonb_build_object(
      'id', sale_order.id,
      'orderNumber', sale_order.order_number,
      'organizationId', sale_order.organization_id,
      'branchId', sale_order.branch_id,
      'accountId', sale_order.commercial_account_id,
      'accountName', account.name,
      'status', sale_order.commercial_status,
      'paymentStatus', sale_order.payment_status,
      'totals', sale_order.totals,
      'cupEquivalent', sale_order.cup_equivalent,
      'rate', sale_order.usd_to_cup_rate,
      'paidCup', coalesce((select sum(payment.equivalent_cup) from public.payments payment where payment.order_id = sale_order.id), 0),
      'lineCount', (select count(*) from public.order_lines line where line.order_id = sale_order.id and line.removed_at is null),
      'deliveredCount', (select count(*) from public.order_lines line where line.order_id = sale_order.id and line.removed_at is null and line.delivered_at is not null),
      'sellerName', coalesce(seller.display_name, 'Usuario'),
      'createdAt', sale_order.created_at
    ) as row_data
    from public.orders sale_order
    join public.commercial_accounts account on account.id = sale_order.commercial_account_id
    left join public.profiles seller on seller.user_id = sale_order.primary_seller_id
    where sale_order.order_kind = 'commercial'
      and (target_account_id is null or sale_order.commercial_account_id = target_account_id)
      and private.can_see_commercial_order(sale_order.organization_id, sale_order.branch_id, sale_order.primary_seller_id)
  ) visible;
$$;

-- One commercial order with its lines (concepts, who added/removed/delivered) and what
-- the caller may do with it.
create function public.get_commercial_order(target_order_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sale_order public.orders%rowtype;
  can_manage boolean;
  paid_cup numeric(14,2);
begin
  select * into sale_order from public.orders where id = target_order_id and order_kind = 'commercial';
  if not found or not private.can_see_commercial_order(sale_order.organization_id, sale_order.branch_id, sale_order.primary_seller_id) then
    raise exception using errcode = 'P0002', message = 'Pedido comercial no encontrado.';
  end if;
  can_manage := private.can_manage_branch_commercial_orders(sale_order.organization_id, sale_order.branch_id)
    and private.can_operate_in_organization(sale_order.organization_id, 'optical_sales');
  select coalesce(sum(equivalent_cup), 0) into paid_cup from public.payments where order_id = sale_order.id;

  return jsonb_build_object(
    'id', sale_order.id,
    'orderNumber', sale_order.order_number,
    'organizationId', sale_order.organization_id,
    'organizationName', (select name from public.organizations where id = sale_order.organization_id),
    'branchId', sale_order.branch_id,
    'branchName', (select name from public.branches where id = sale_order.branch_id),
    'accountId', sale_order.commercial_account_id,
    'accountName', (select name from public.commercial_accounts where id = sale_order.commercial_account_id),
    'status', sale_order.commercial_status,
    'paymentStatus', sale_order.payment_status,
    'totals', sale_order.totals,
    'cupEquivalent', sale_order.cup_equivalent,
    'rate', sale_order.usd_to_cup_rate,
    'paidCup', paid_cup,
    'sellerName', (select display_name from public.profiles where user_id = sale_order.primary_seller_id),
    'createdAt', sale_order.created_at,
    'closedAt', sale_order.closed_at,
    'closedByName', (select display_name from public.profiles where user_id = sale_order.closed_by),
    'readyAt', sale_order.ready_at,
    'deliveredAt', sale_order.delivered_at,
    'canManage', can_manage,
    'canWork', private.can_operate_in_organization(sale_order.organization_id, 'optical_sales'),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', line.id,
        'lineNumber', line.line_number,
        'patientId', line.patient_customer_id,
        'patientName', patient.full_name,
        'prescriptionRevisionId', line.prescription_revision_id,
        'totals', line.totals,
        'cupEquivalent', line.cup_equivalent,
        'addedAt', coalesce(line.added_at, line.created_at),
        'addedByName', added.display_name,
        'removedAt', line.removed_at,
        'removedByName', removed.display_name,
        'removalReason', line.removal_reason,
        'deliveredAt', line.delivered_at,
        'deliveredByName', delivered.display_name,
        'hasProduction', exists (select 1 from public.production_jobs job where job.order_line_id = line.id),
        'items', coalesce((select jsonb_agg(jsonb_build_object(
          'name', item.name, 'category', item.category, 'kind', item.line_kind,
          'amount', item.amount, 'baseAmount', item.base_amount, 'currency', item.currency,
          'adjustmentReason', item.price_adjustment_reason
        ) order by item.position) from public.order_items item where item.order_line_id = line.id), '[]'::jsonb)
      ) order by line.line_number)
      from public.order_lines line
      left join public.customers patient on patient.id = line.patient_customer_id
      left join public.profiles added on added.user_id = line.added_by
      left join public.profiles removed on removed.user_id = line.removed_by
      left join public.profiles delivered on delivered.user_id = line.delivered_by
      where line.order_id = sale_order.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Catalog as the account buys it (for the "Agregar trabajo" picker): fixed price, else
-- the account discount on the retail price. Graduation surcharges are added when saving.
create function public.get_commercial_price_list(target_order_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sale_order public.orders%rowtype;
  account public.commercial_accounts%rowtype;
begin
  select * into sale_order from public.orders where id = target_order_id and order_kind = 'commercial';
  if not found or not private.can_see_commercial_order(sale_order.organization_id, sale_order.branch_id, sale_order.primary_seller_id) then
    raise exception using errcode = 'P0002', message = 'Pedido comercial no encontrado.';
  end if;
  select * into account from public.commercial_accounts where id = sale_order.commercial_account_id;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', item.id,
      'organizationId', item.organization_id,
      'category', item.category,
      'name', item.name,
      'price', coalesce(fixed.sale_price, round(coalesce(override.sale_price, item.sale_price) * (1 - account.discount_percent / 100), 2)),
      'currency', coalesce(fixed.currency, override.currency, item.currency),
      'catalogPrice', coalesce(override.sale_price, item.sale_price),
      'catalogCurrency', coalesce(override.currency, item.currency),
      'priceSource', case when fixed.account_id is not null then 'account_fixed' when account.discount_percent > 0 then 'account_discount' else 'catalog' end
    ) order by item.category, item.name)
    from public.catalog_items item
    left join public.catalog_item_overrides override
      on override.catalog_item_id = item.id and override.organization_id = sale_order.organization_id
    left join public.commercial_account_prices fixed
      on fixed.account_id = account.id and fixed.catalog_item_id = item.id
    where item.is_active
      and (item.organization_id is null or item.organization_id = sale_order.organization_id)
      and coalesce(override.is_enabled, true)
  ), '[]'::jsonb);
end;
$$;

-- Team screen: sellers and their exceptional permission (owner only).
create function public.list_commercial_order_permissions(target_organization_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'membershipId', membership.id,
    'name', coalesce(profile.display_name, 'Vendedor'),
    'branchName', branch.name,
    'enabled', membership.can_manage_commercial_orders
  ) order by profile.display_name), '[]'::jsonb)
  from public.organization_memberships membership
  left join public.profiles profile on profile.user_id = membership.user_id
  left join public.branches branch on branch.id = membership.branch_id
  where membership.organization_id = target_organization_id
    and membership.role = 'seller' and membership.status = 'active'
    and private.has_organization_role(target_organization_id, array['owner']);
$$;

revoke all on function public.list_commercial_orders(bigint) from public, anon;
revoke all on function public.get_commercial_order(bigint) from public, anon;
revoke all on function public.get_commercial_price_list(bigint) from public, anon;
revoke all on function public.list_commercial_order_permissions(bigint) from public, anon;
grant execute on function public.list_commercial_orders(bigint) to authenticated;
grant execute on function public.get_commercial_order(bigint) to authenticated;
grant execute on function public.get_commercial_price_list(bigint) to authenticated;
grant execute on function public.list_commercial_order_permissions(bigint) to authenticated;
