-- The exceptional seller permission (organization_memberships.can_manage_commercial_orders)
-- now covers every order of the seller's branch, retail included: see totals, payments and
-- balance, collect, send the "ready" WhatsApp, manage production and deliver.
-- private.can_access_seller_sale is deliberately untouched: it also guards quotations and
-- cashboxes, which stay private to each seller.
-- The flag and its helper keep their LEN0010 names to avoid a rename across ~10 functions.

create function private.can_write_branch_order(target_organization_id bigint, target_branch_id bigint, target_seller_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_write_seller_sale(target_organization_id, target_branch_id, target_seller_id)
    or (private.can_manage_branch_commercial_orders(target_organization_id, target_branch_id)
      and private.can_operate_in_organization(target_organization_id, 'optical_sales')
      and private.is_operational_branch(target_organization_id, target_branch_id));
$$;

revoke all on function private.can_write_branch_order(bigint, bigint, uuid) from public, anon;
grant execute on function private.can_write_branch_order(bigint, bigint, uuid) to authenticated;

-- A. Read and update orders. order_lines, order_items, order_confirmations and payments
-- are readable through the orders policy, so they follow it.

alter policy orders_select on public.orders
using (
  (select private.can_access_seller_sale(organization_id, branch_id, primary_seller_id))
  or (select private.can_manage_branch_commercial_orders(organization_id, branch_id))
);

alter policy orders_update_commercial on public.orders
using ((select private.can_write_branch_order(organization_id, branch_id, primary_seller_id)))
with check ((select private.can_write_branch_order(organization_id, branch_id, primary_seller_id)));

alter policy notification_attempts_select on public.notification_attempts
using (
  exists (
    select 1 from public.orders sale_order
    where sale_order.id = notification_attempts.order_id
      and (
        (select private.can_access_seller_sale(sale_order.organization_id, sale_order.branch_id, sale_order.primary_seller_id))
        or (select private.can_manage_branch_commercial_orders(sale_order.organization_id, sale_order.branch_id))
      )
  )
);

-- Names of who assigned, sold or produced. Sellers only read their own profile (the
-- memberships RLS inside profiles_select_self_or_related hides the rest), and
-- list_accessible_production_jobs inner-joins the provider profile, so without this the
-- authorized seller would not see jobs assigned to someone else.

create function private.is_member_visible_to_order_manager(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships mine
    join public.organization_memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and mine.role = 'seller'
      and mine.status = 'active'
      and mine.can_manage_commercial_orders
      and theirs.user_id = target_user_id
      and theirs.status = 'active'
  );
$$;

revoke all on function private.is_member_visible_to_order_manager(uuid) from public, anon;
grant execute on function private.is_member_visible_to_order_manager(uuid) to authenticated;

create policy profiles_select_for_order_managers on public.profiles
for select to authenticated
using (private.is_member_visible_to_order_manager(user_id));

-- B. Delivery guard (retail path).

create or replace function private.guard_order_commercial_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  balance_cup numeric(14,2);
begin
  if old.order_kind = 'commercial' then
    if new.commercial_status is distinct from old.commercial_status then
      if (old.commercial_status, new.commercial_status) not in (
        ('open', 'confirmed'), ('confirmed', 'open'), ('ready', 'open'), ('confirmed', 'ready'),
        ('confirmed', 'delivered'), ('ready', 'delivered'), ('delivered', 'closed')
      ) then
        raise exception using errcode = '23514', message = 'Ese cambio de estado no es válido para un pedido comercial.';
      end if;
      if new.commercial_status = 'closed' then
        select greatest(coalesce(old.cup_equivalent, 0) - coalesce(sum(payment.equivalent_cup), 0), 0)
        into balance_cup from public.payments payment where payment.order_id = old.id;
        if balance_cup > 0 then
          raise exception using errcode = '23514', message = 'El pedido comercial termina cuando está entregado y pagado.';
        end if;
      end if;
    end if;
    if new.commercial_status = 'delivered' and new.delivered_at is null then new.delivered_at := now(); end if;
    return new;
  end if;

  if not private.can_write_branch_order(old.organization_id, old.branch_id, old.primary_seller_id) then
    raise exception using errcode = '42501', message = 'No puedes actualizar este pedido.';
  end if;
  if new.commercial_status is distinct from old.commercial_status then
    select greatest(coalesce(old.cup_equivalent, 0) - coalesce(sum(payment.equivalent_cup), 0), 0)
    into balance_cup from public.payments payment where payment.order_id = old.id;
    if new.commercial_status = 'delivered' and balance_cup > 0 then
      raise exception using errcode = '23514', message = 'No se puede entregar un pedido con saldo pendiente.';
    end if;
    if old.commercial_status = 'accepted' and new.commercial_status <> 'delivered' then
      raise exception using errcode = '23514', message = 'La siguiente transición comercial válida es entregado.';
    end if;
    if old.commercial_status = 'delivered' and new.commercial_status <> 'closed' then
      raise exception using errcode = '23514', message = 'La siguiente transición comercial válida es cerrado.';
    end if;
    if old.commercial_status = 'closed' then
      raise exception using errcode = '55000', message = 'El pedido cerrado no admite transiciones.';
    end if;
  end if;
  if new.commercial_status = 'delivered' and new.delivered_at is null then new.delivered_at := now(); end if;
  return new;
end;
$$;

-- C. Cash payments: the money still goes to the cashbox of whoever collects it.

create or replace function private.prepare_cash_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale_order public.orders%rowtype;
  paid_cup numeric(14,2);
  remaining_cup numeric(14,2);
  incoming_cup numeric(14,2);
  target_cashbox_id bigint;
  organization_timezone text;
begin
  select * into sale_order
  from public.orders
  where id = new.order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Pedido no encontrado.';
  end if;

  -- The seller with the exceptional permission collects any order of the branch.
  if not (private.can_write_branch_order(sale_order.organization_id, sale_order.branch_id, sale_order.primary_seller_id)
    or (sale_order.order_kind = 'commercial'
      and private.can_manage_branch_commercial_orders(sale_order.organization_id, sale_order.branch_id)
      and private.can_operate_in_organization(sale_order.organization_id, 'optical_sales'))) then
    raise exception using errcode = '42501', message = 'No puedes registrar pagos para este pedido.';
  end if;

  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = sale_order.organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        membership.role = 'owner'
        or (
          membership.role = 'seller'
          and membership.branch_id = sale_order.branch_id
        )
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Solo el propietario de la organización o un vendedor activo de la sucursal puede recibir efectivo.';
  end if;

  if not private.can_operate_in_organization(sale_order.organization_id, 'cashbox') then
    raise exception using errcode = '42501', message = 'El módulo Caja no está operativo.';
  end if;

  if sale_order.commercial_status = 'closed' then
    raise exception using errcode = '55000', message = 'El pedido está cerrado.';
  end if;

  new.organization_id := sale_order.organization_id;
  new.branch_id := sale_order.branch_id;
  new.received_by := (select auth.uid());
  new.payment_method := 'cash';
  new.received_at := now();

  if new.currency = 'USD' then
    new.applied_rate := sale_order.usd_to_cup_rate;
  end if;

  select organization.timezone into organization_timezone
  from public.organizations organization
  where organization.id = new.organization_id;

  new.business_date := (new.received_at at time zone organization_timezone)::date;

  insert into public.seller_cashboxes (
    organization_id,
    branch_id,
    seller_id,
    business_date,
    currency
  ) values (
    new.organization_id,
    new.branch_id,
    new.received_by,
    new.business_date,
    new.currency
  )
  on conflict (organization_id, branch_id, seller_id, business_date, currency) do nothing
  returning id into target_cashbox_id;

  if target_cashbox_id is null then
    select id into target_cashbox_id
    from public.seller_cashboxes
    where organization_id = new.organization_id
      and branch_id = new.branch_id
      and seller_id = new.received_by
      and business_date = new.business_date
      and currency = new.currency;
  end if;

  perform 1
  from public.seller_cashboxes
  where id = target_cashbox_id
  for update;

  new.cashbox_id := target_cashbox_id;
  new.is_post_close := exists (
    select 1
    from public.cashbox_closures closure
    where closure.cashbox_id = target_cashbox_id
      and closure.closure_type = 'primary'
  );

  select coalesce(sum(payment.equivalent_cup), 0) into paid_cup
  from public.payments payment
  where payment.order_id = new.order_id;

  remaining_cup := greatest(coalesce(sale_order.cup_equivalent, 0) - paid_cup, 0);
  incoming_cup := round(
    new.amount * case when new.currency = 'USD' then new.applied_rate else 1 end,
    2
  );

  if incoming_cup > remaining_cup
    and not (
      new.currency = 'USD'
      and remaining_cup > 0
      and incoming_cup - remaining_cup < new.applied_rate * 0.01
    ) then
    raise exception using errcode = '22003', message = 'El pago supera el saldo pendiente.';
  end if;

  return new;
end;
$$;

-- D. "Ready to pick up" WhatsApp.

create or replace function public.notify_order_ready(target_order_id bigint, request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale_order public.orders%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión.';
  end if;
  if request_id is null then
    raise exception using errcode = '22023', message = 'Solicitud de aviso no válida.';
  end if;
  select * into sale_order from public.orders where id = target_order_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pedido no encontrado.';
  end if;
  if not private.can_write_branch_order(sale_order.organization_id, sale_order.branch_id, sale_order.primary_seller_id)
    or not private.can_operate_in_organization(sale_order.organization_id, 'whatsapp') then
    raise exception using errcode = '42501', message = 'No puedes avisar al cliente de este pedido.';
  end if;
  if sale_order.commercial_status <> 'accepted' then
    raise exception using errcode = '55000', message = 'El pedido ya fue entregado.';
  end if;

  perform private.queue_openwa_notification(
    sale_order.id, 'order_ready', (select auth.uid()),
    'order_ready:' || sale_order.id || ':' || request_id
  );
  return jsonb_build_object('queued', true);
end;
$$;

-- E. Production: read jobs, change their status, report incidents, assign and rework.

create or replace function private.can_access_production_job(target_organization_id bigint, target_order_id bigint, target_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    private.has_organization_role(target_organization_id, array['owner'])
    or target_provider_id = (select auth.uid())
    or exists (
      select 1 from public.orders sale_order
      where sale_order.id = target_order_id
        and sale_order.organization_id = target_organization_id
        and (sale_order.primary_seller_id = (select auth.uid())
          or private.can_manage_branch_commercial_orders(sale_order.organization_id, sale_order.branch_id))
    )
  );
$$;

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
      and not private.can_manage_branch_commercial_orders(sale_order.organization_id, sale_order.branch_id))
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

create or replace function private.create_production_rework(target_incident_id bigint, new_provider_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  incident public.production_incidents%rowtype;
  original public.production_jobs%rowtype;
  actor_role text;
  rework_id bigint;
  rework_provider_id uuid;
begin
  select * into incident from public.production_incidents where id = target_incident_id for update;
  if not found or incident.rework_job_id is not null then raise exception using errcode = '55000', message = 'Incidencia no disponible para repetición.'; end if;
  select * into original from public.production_jobs where id = incident.job_id for update;
  actor_role := private.production_actor_role(original.organization_id);
  if actor_role not in ('owner', 'seller')
    or (actor_role = 'seller' and not exists (
      select 1 from public.orders sale_order
      where sale_order.id = original.order_id
        and (sale_order.primary_seller_id = (select auth.uid())
          or private.can_manage_branch_commercial_orders(sale_order.organization_id, sale_order.branch_id))))
    or not private.can_operate_in_organization(original.organization_id, 'production') then
    raise exception using errcode = '42501', message = 'No puedes autorizar esta repetición.';
  end if;
  rework_provider_id := coalesce(new_provider_id, original.provider_id);
  if rework_provider_id <> original.provider_id and not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = original.organization_id
      and membership.user_id = rework_provider_id
      and membership.role in (case when original.job_type = 'lens' then 'lens_provider' else 'mounting_provider' end, 'owner', 'seller')
      and membership.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'El responsable no está activo en la organización con un rol válido para este trabajo.';
  end if;
  update public.production_jobs set is_current = false, superseded_at = now() where id = original.id;
  insert into public.production_jobs (
    order_id, organization_id, branch_id, job_type, provider_id, status,
    work_snapshot, original_job_id, assigned_by
  ) values (
    original.order_id, original.organization_id, original.branch_id, original.job_type,
    rework_provider_id, 'pending', original.work_snapshot, original.id, (select auth.uid())
  ) returning id into rework_id;
  update public.production_incidents set rework_job_id = rework_id where id = incident.id;
  insert into public.production_job_events (
    job_id, organization_id, branch_id, from_status, to_status, actor_id, actor_role, notes
  ) values (
    rework_id, original.organization_id, original.branch_id, null, 'pending',
    (select auth.uid()), actor_role,
    case when rework_provider_id = original.provider_id then 'Repetición vinculada a incidencia.' else 'Repetición vinculada a incidencia y reasignada.' end
  );
  return rework_id;
end;
$$;
