-- LEN0010 phase 3: accumulative commercial orders for retail opticians.
-- Same orders / order_lines / order_items tables as retail (production, payments and
-- cashbox are reused), with order_kind = 'commercial':
--   open ⇄ confirmed → ready → delivered → closed (delivered and paid)
-- * Lines are added over several days (up to 200), each priced with the account rules and
--   frozen when added (who and when). A line can be soft-removed while the order is open
--   and has no production job.
-- * The owner closes and reopens (with reason). As an exception the owner can let a
--   seller manage every commercial order of the branch (can_manage_commercial_orders).
-- * Delivery is whole or line by line, with or without balance (credit).
-- * Commercial orders send no WhatsApp.
-- Every change goes through the SECURITY DEFINER RPCs below, which set the transaction
-- flag lensspace.commercial_rpc; direct table writes on commercial orders are refused.

-- A. Exceptional seller permission ------------------------------------------------------

alter table public.organization_memberships
  add column can_manage_commercial_orders boolean not null default false;

create function private.can_manage_branch_commercial_orders(target_organization_id bigint, target_branch_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_organization_role(target_organization_id, array['owner'])
    or exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id = target_organization_id
        and membership.branch_id = target_branch_id
        and membership.user_id = (select auth.uid())
        and membership.role = 'seller'
        and membership.status = 'active'
        and membership.can_manage_commercial_orders
    );
$$;

revoke all on function private.can_manage_branch_commercial_orders(bigint, bigint) from public, anon;
grant execute on function private.can_manage_branch_commercial_orders(bigint, bigint) to authenticated;

create function public.set_commercial_orders_permission(target_membership_id bigint, enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership public.organization_memberships%rowtype;
begin
  select * into membership from public.organization_memberships where id = target_membership_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'El miembro no existe.';
  end if;
  if not private.can_manage_commercial_accounts(membership.organization_id) then
    raise exception using errcode = '42501', message = 'Solo el dueño puede dar este permiso.';
  end if;
  if membership.role <> 'seller' then
    raise exception using errcode = '22023', message = 'Este permiso solo se da a vendedores.';
  end if;
  if membership.can_manage_commercial_orders = enabled then return; end if;

  update public.organization_memberships set can_manage_commercial_orders = enabled, updated_at = now() where id = membership.id;
  insert into public.audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, origin, payload)
  values (membership.organization_id, (select auth.uid()),
    case when enabled then 'commercial_orders.permission_granted' else 'commercial_orders.permission_revoked' end,
    'organization_membership', membership.id::text, 'application',
    jsonb_build_object('userId', membership.user_id, 'branchId', membership.branch_id));
end;
$$;

revoke all on function public.set_commercial_orders_permission(bigint, boolean) from public, anon;
grant execute on function public.set_commercial_orders_permission(bigint, boolean) to authenticated;

-- B. Orders and lines -------------------------------------------------------------------

alter table public.orders
  add column order_kind text not null default 'retail',
  add column commercial_account_id bigint,
  add column closed_by uuid references auth.users(id),
  add column closed_at timestamptz,
  add column ready_by uuid references auth.users(id),
  add column ready_at timestamptz,
  add column client_request_id uuid,
  alter column quotation_id drop not null,
  alter column customer_id drop not null;

alter table public.orders drop constraint orders_commercial_status_check;
alter table public.orders
  add constraint orders_commercial_status_check
    check (commercial_status in ('accepted', 'open', 'confirmed', 'ready', 'delivered', 'closed')),
  add constraint orders_order_kind_check check (order_kind in ('retail', 'commercial')),
  add constraint orders_commercial_account_fkey
    foreign key (commercial_account_id, organization_id) references public.commercial_accounts(id, organization_id),
  add constraint orders_kind_shape_check check (
    (order_kind = 'retail' and quotation_id is not null and customer_id is not null and commercial_account_id is null
      and commercial_status in ('accepted', 'delivered', 'closed'))
    or (order_kind = 'commercial' and quotation_id is null and customer_id is null and commercial_account_id is not null
      and usd_to_cup_rate is not null and commercial_status in ('open', 'confirmed', 'ready', 'delivered', 'closed'))
  );

create index orders_commercial_account_idx on public.orders (commercial_account_id) where commercial_account_id is not null;
create unique index orders_client_request_key on public.orders (organization_id, client_request_id) where client_request_id is not null;
create index orders_closed_by_idx on public.orders (closed_by) where closed_by is not null;
create index orders_ready_by_idx on public.orders (ready_by) where ready_by is not null;

alter table public.order_lines
  add column added_by uuid references auth.users(id),
  add column added_at timestamptz,
  add column removed_at timestamptz,
  add column removed_by uuid references auth.users(id),
  add column removal_reason text check (removal_reason is null or char_length(removal_reason) between 5 and 300),
  add column delivered_at timestamptz,
  add column delivered_by uuid references auth.users(id),
  add column client_request_id uuid;

alter table public.order_lines drop constraint order_lines_line_number_check;
alter table public.order_lines add constraint order_lines_line_number_check check (line_number between 1 and 200);

create unique index order_lines_client_request_key on public.order_lines (order_id, client_request_id) where client_request_id is not null;
create index order_lines_added_by_idx on public.order_lines (added_by) where added_by is not null;
create index order_lines_removed_by_idx on public.order_lines (removed_by) where removed_by is not null;
create index order_lines_delivered_by_idx on public.order_lines (delivered_by) where delivered_by is not null;

-- C. Guards -----------------------------------------------------------------------------

create function private.in_commercial_rpc()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('lensspace.commercial_rpc', true), '') = 'on';
$$;

-- Commercial orders change only through the RPCs (or nested triggers such as the
-- payment status refresh).
create function private.guard_commercial_order_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (case when tg_op = 'INSERT' then new.order_kind else old.order_kind end) = 'commercial'
    and not private.in_commercial_rpc() and pg_trigger_depth() <= 1 then
    raise exception using errcode = '42501', message = 'Usa las acciones del pedido comercial.';
  end if;
  if tg_op = 'UPDATE' and new.order_kind is distinct from old.order_kind then
    raise exception using errcode = '55000', message = 'El tipo de pedido no se puede cambiar.';
  end if;
  return new;
end;
$$;

create trigger orders_guard_commercial_write
before insert or update on public.orders
for each row execute function private.guard_commercial_order_write();

-- Lines and concepts of a commercial order are inserted only by the RPCs.
create function private.guard_commercial_order_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.in_commercial_rpc()
    and exists (select 1 from public.orders where id = new.order_id and order_kind = 'commercial') then
    raise exception using errcode = '42501', message = 'Usa las acciones del pedido comercial.';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_commercial_order_child() from public, anon, authenticated;

create trigger order_lines_guard_commercial
before insert on public.order_lines
for each row execute function private.guard_commercial_order_child();
create trigger order_items_guard_commercial
before insert on public.order_items
for each row execute function private.guard_commercial_order_child();

-- Lines stay immutable except the removal and delivery stamps set by the RPCs.
create function private.guard_order_line_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  stamps text[] := array['removed_at', 'removed_by', 'removal_reason', 'delivered_at', 'delivered_by'];
begin
  if tg_op = 'UPDATE' and private.in_commercial_rpc()
    and (to_jsonb(new) - stamps) = (to_jsonb(old) - stamps) then
    return new;
  end if;
  raise exception using errcode = '55000', message = 'La instantánea aceptada del pedido es inmutable.';
end;
$$;

drop trigger order_lines_immutable on public.order_lines;
create trigger order_lines_immutable
before delete or update on public.order_lines
for each row execute function private.guard_order_line_change();

-- Retail rules unchanged (same body as 20260913155559); commercial transitions below.
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

  if not private.can_write_seller_sale(old.organization_id, old.branch_id, old.primary_seller_id) then
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

-- Payment status as before; a delivered commercial order closes once it is paid.
create or replace function private.refresh_order_payment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_total numeric(14,2);
  paid_cup numeric(14,2);
begin
  select coalesce(cup_equivalent, 0) into target_total from public.orders where id = new.order_id;
  select coalesce(sum(equivalent_cup), 0) into paid_cup from public.payments where order_id = new.order_id;
  update public.orders set payment_status = case
    when paid_cup <= 0 then 'unpaid'
    when paid_cup >= target_total then 'paid'
    else 'partial'
  end where id = new.order_id;
  update public.orders set commercial_status = 'closed'
  where id = new.order_id and order_kind = 'commercial' and commercial_status = 'delivered' and payment_status = 'paid';
  return new;
end;
$$;

-- D. No WhatsApp for commercial orders --------------------------------------------------

drop trigger orders_notify_accepted on public.orders;
create trigger orders_notify_accepted
after insert on public.orders
for each row when (new.order_kind = 'retail')
execute function private.notify_order_accepted();

drop trigger orders_notify_delivered on public.orders;
create trigger orders_notify_delivered
after update of commercial_status on public.orders
for each row when (new.order_kind = 'retail')
execute function private.notify_order_delivered();

create or replace function private.notify_payment_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.orders where id = new.order_id and order_kind = 'commercial') then
    return new;
  end if;
  perform private.queue_openwa_notification(
    new.order_id, 'payment_received', new.received_by, 'payment_received:' || new.id
  );
  return new;
end;
$$;

-- E. Visibility: sellers with the exceptional permission see the branch's commercial
-- orders (lines, items and payments follow through their EXISTS policies).
create policy orders_select_commercial_manager on public.orders
for select to authenticated
using (order_kind = 'commercial' and (select private.can_manage_branch_commercial_orders(organization_id, branch_id)));

-- F. RPC helpers ------------------------------------------------------------------------

-- Locks the order and checks the caller. manager = close/reopen level.
create function private.lock_commercial_order(target_order_id bigint, manager boolean)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale_order public.orders%rowtype;
begin
  select * into sale_order from public.orders where id = target_order_id and order_kind = 'commercial' for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pedido comercial no encontrado.';
  end if;
  if not private.can_operate_in_organization(sale_order.organization_id, 'optical_sales')
    or not private.is_operational_branch(sale_order.organization_id, sale_order.branch_id) then
    raise exception using errcode = '42501', message = 'La organización está en modo de solo lectura.';
  end if;
  if manager then
    if not private.can_manage_branch_commercial_orders(sale_order.organization_id, sale_order.branch_id) then
      raise exception using errcode = '42501', message = 'Solo el dueño o un vendedor autorizado puede hacer esto.';
    end if;
  elsif not (private.can_access_seller_sale(sale_order.organization_id, sale_order.branch_id, sale_order.primary_seller_id)
    or private.can_manage_branch_commercial_orders(sale_order.organization_id, sale_order.branch_id)) then
    raise exception using errcode = '42501', message = 'No puedes trabajar en este pedido.';
  end if;
  perform set_config('lensspace.commercial_rpc', 'on', true);
  return sale_order;
end;
$$;

revoke all on function private.lock_commercial_order(bigint, boolean) from public, anon, authenticated;

-- Totals = sum of the active lines; payment status follows the new total.
create function private.refresh_commercial_order_totals(target_order_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_totals jsonb;
  new_cup numeric(14,2);
  paid_cup numeric(14,2);
begin
  select coalesce(jsonb_object_agg(currency, amount), '{}'::jsonb) into new_totals
  from (
    select entry.key as currency, sum(entry.value::numeric) as amount
    from public.order_lines line, jsonb_each_text(line.totals) entry
    where line.order_id = target_order_id and line.removed_at is null
    group by entry.key
  ) per_currency;
  select coalesce(sum(cup_equivalent), 0) into new_cup
  from public.order_lines where order_id = target_order_id and removed_at is null;
  select coalesce(sum(equivalent_cup), 0) into paid_cup from public.payments where order_id = target_order_id;

  update public.orders set
    totals = new_totals,
    cup_equivalent = new_cup,
    payment_status = case when paid_cup <= 0 then 'unpaid' when paid_cup >= new_cup then 'paid' else 'partial' end
  where id = target_order_id;
end;
$$;

revoke all on function private.refresh_commercial_order_totals(bigint) from public, anon, authenticated;

create function private.audit_commercial_order(sale_order public.orders, event text, reason text, payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, origin, reason, payload)
  values (sale_order.organization_id, (select auth.uid()), event, 'order', sale_order.id::text, 'application', reason,
    payload || jsonb_build_object('orderNumber', sale_order.order_number, 'accountId', sale_order.commercial_account_id));
$$;

revoke all on function private.audit_commercial_order(public.orders, text, text, jsonb) from public, anon, authenticated;

-- G. RPCs -------------------------------------------------------------------------------

-- Active accounts (names only) for whoever can sell in the organization.
create function public.list_commercial_accounts_for_orders(target_organization_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', account.id, 'name', account.name) order by account.name), '[]'::jsonb)
  from public.commercial_accounts account
  where account.organization_id = target_organization_id
    and account.archived_at is null
    and private.has_organization_role(target_organization_id, array['owner', 'seller']);
$$;

create function public.open_commercial_order(
  target_organization_id bigint,
  target_branch_id bigint,
  target_account_id bigint,
  target_usd_to_cup_rate numeric,
  request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  sale_order public.orders%rowtype;
begin
  if not private.can_write_seller_sale(target_organization_id, target_branch_id, actor) then
    raise exception using errcode = '42501', message = 'No puedes abrir pedidos en esta sucursal.';
  end if;
  if request_id is not null then
    select * into sale_order from public.orders where organization_id = target_organization_id and client_request_id = request_id;
    if found then
      return jsonb_build_object('orderId', sale_order.id, 'orderNumber', sale_order.order_number);
    end if;
  end if;
  if not exists (
    select 1 from public.commercial_accounts
    where id = target_account_id and organization_id = target_organization_id and archived_at is null
  ) then
    raise exception using errcode = 'P0002', message = 'La óptica minorista no está disponible.';
  end if;
  if target_usd_to_cup_rate is null or target_usd_to_cup_rate <= 0 then
    raise exception using errcode = '22023', message = 'Indica la tasa USD/CUP del pedido.';
  end if;

  perform set_config('lensspace.commercial_rpc', 'on', true);
  insert into public.orders (
    order_number, organization_id, branch_id, primary_seller_id, order_kind, commercial_account_id,
    commercial_status, payment_status, usd_to_cup_rate, totals, cup_equivalent, accepted_at, client_request_id
  ) values (
    private.next_order_number(target_organization_id), target_organization_id, target_branch_id, actor, 'commercial', target_account_id,
    'open', 'unpaid', target_usd_to_cup_rate, '{}'::jsonb, 0, now(), request_id
  ) returning * into sale_order;

  perform private.audit_commercial_order(sale_order, 'commercial_order.opened', null, '{}'::jsonb);
  return jsonb_build_object('orderId', sale_order.id, 'orderNumber', sale_order.order_number);
end;
$$;

-- Patient of a retail optician: a customer linked to the account, hidden from the
-- branch lists, without phone or WhatsApp.
create function public.create_commercial_patient(target_account_id bigint, target_branch_id bigint, patient_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.commercial_accounts%rowtype;
  clean text := btrim(regexp_replace(coalesce(patient_name, ''), '\s+', ' ', 'g'));
  new_id bigint;
begin
  select * into account from public.commercial_accounts where id = target_account_id and archived_at is null;
  if not found then
    raise exception using errcode = 'P0002', message = 'La óptica minorista no está disponible.';
  end if;
  if not (private.can_write_seller_sale(account.organization_id, target_branch_id, (select auth.uid()))
    or (private.can_manage_branch_commercial_orders(account.organization_id, target_branch_id)
      and private.can_operate_in_organization(account.organization_id, 'optical_sales'))) then
    raise exception using errcode = '42501', message = 'No puedes registrar pacientes en esta sucursal.';
  end if;
  if char_length(clean) not between 2 and 160 then
    raise exception using errcode = '22023', message = 'Escribe el nombre del paciente (2 a 160 caracteres).';
  end if;

  perform set_config('lensspace.commercial_rpc', 'on', true);
  insert into public.customers (organization_id, branch_id, full_name, created_by, commercial_account_id, messaging_consent)
  values (account.organization_id, target_branch_id, clean, (select auth.uid()), account.id, false)
  returning id into new_id;
  return new_id;
end;
$$;

-- target_line: {patientCustomerId, prescriptionRevisionId, itemIds, lineAdjustments}
create function public.add_commercial_order_line(target_order_id bigint, target_line jsonb, request_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale_order public.orders%rowtype;
  existing public.order_lines%rowtype;
  patient_id bigint;
  revision_id bigint;
  item_ids bigint[];
  adjustments jsonb;
  pricing jsonb;
  next_number integer;
  next_position integer;
  new_line_id bigint;
  item jsonb;
begin
  sale_order := private.lock_commercial_order(target_order_id, false);
  if request_id is not null then
    select * into existing from public.order_lines where order_id = sale_order.id and client_request_id = request_id;
    if found then
      return jsonb_build_object('lineId', existing.id, 'lineNumber', existing.line_number);
    end if;
  end if;
  if sale_order.commercial_status <> 'open' then
    raise exception using errcode = '55000', message = 'El pedido está cerrado. Pide al dueño que lo reabra para agregar trabajos.';
  end if;

  begin
    patient_id := (target_line->>'patientCustomerId')::bigint;
    revision_id := nullif(target_line->>'prescriptionRevisionId', '')::bigint;
    select coalesce(array_agg(value::bigint), '{}') into item_ids from jsonb_array_elements_text(coalesce(target_line->'itemIds', '[]'::jsonb));
    adjustments := coalesce(target_line->'lineAdjustments', '{}'::jsonb);
  exception when others then
    raise exception using errcode = '22023', message = 'El trabajo no tiene un formato válido.';
  end;

  if patient_id is null or not exists (
    select 1 from public.customers
    where id = patient_id and organization_id = sale_order.organization_id and branch_id = sale_order.branch_id
      and commercial_account_id = sale_order.commercial_account_id and archived_at is null
  ) then
    raise exception using errcode = 'P0002', message = 'Elige un paciente de esta óptica.';
  end if;
  if revision_id is not null and not exists (
    select 1 from public.prescription_revisions revision
    join public.prescriptions prescription on prescription.id = revision.prescription_id
    where revision.id = revision_id and prescription.customer_id = patient_id and prescription.organization_id = sale_order.organization_id
  ) then
    raise exception using errcode = '22023', message = 'La receta no es de ese paciente.';
  end if;
  if coalesce(cardinality(item_ids), 0) = 0 then
    raise exception using errcode = '22023', message = 'Elige al menos un concepto.';
  end if;

  pricing := public.calculate_sale_price(sale_order.organization_id, item_ids, revision_id, sale_order.usd_to_cup_rate, adjustments, sale_order.commercial_account_id);

  select coalesce(max(line_number), 0) + 1 into next_number from public.order_lines where order_id = sale_order.id;
  if next_number > 200 then
    raise exception using errcode = '22023', message = 'Un pedido comercial lleva como máximo 200 trabajos.';
  end if;
  select coalesce(max(position), 0) into next_position from public.order_items where order_id = sale_order.id;

  insert into public.order_lines (
    order_id, organization_id, branch_id, line_number, patient_customer_id, prescription_revision_id,
    totals, cup_equivalent, added_by, added_at, client_request_id
  ) values (
    sale_order.id, sale_order.organization_id, sale_order.branch_id, next_number, patient_id, revision_id,
    pricing->'totals', (pricing->>'cupEquivalent')::numeric, (select auth.uid()), now(), request_id
  ) returning id into new_line_id;

  for item in select value from jsonb_array_elements(pricing->'lineItems') loop
    next_position := next_position + 1;
    insert into public.order_items (
      order_id, organization_id, branch_id, order_line_id, catalog_item_id, line_kind, source_code, category,
      name, base_amount, amount, currency, position, price_adjustment_reason, price_adjusted_by, discount_authorized_by
    ) values (
      sale_order.id, sale_order.organization_id, sale_order.branch_id, new_line_id, (item->>'itemId')::bigint, item->>'kind',
      coalesce(item->>'code', item->>'ruleCode'), item->>'category', item->>'name',
      (item->>'baseAmount')::numeric, (item->>'amount')::numeric, item->>'currency', next_position,
      item->>'adjustmentReason', (item->>'adjustedBy')::uuid, (item->>'discountAuthorizedBy')::uuid
    );
  end loop;

  perform private.refresh_commercial_order_totals(sale_order.id);
  return jsonb_build_object('lineId', new_line_id, 'lineNumber', next_number, 'pricing', pricing);
end;
$$;

create function public.remove_commercial_order_line(target_line_id bigint, target_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  line public.order_lines%rowtype;
  sale_order public.orders%rowtype;
  clean text := btrim(coalesce(target_reason, ''));
begin
  select * into line from public.order_lines where id = target_line_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Trabajo no encontrado.';
  end if;
  sale_order := private.lock_commercial_order(line.order_id, false);
  if sale_order.commercial_status <> 'open' then
    raise exception using errcode = '55000', message = 'Solo se quitan trabajos con el pedido abierto.';
  end if;
  if line.removed_at is not null then return; end if;
  if exists (select 1 from public.production_jobs where order_line_id = line.id) then
    raise exception using errcode = '55000', message = 'Este trabajo ya está en producción y no se puede quitar.';
  end if;
  if char_length(clean) not between 5 and 300 then
    raise exception using errcode = '22023', message = 'Explica por qué se quita (al menos 5 caracteres).';
  end if;

  update public.order_lines set removed_at = now(), removed_by = (select auth.uid()), removal_reason = clean where id = line.id;
  perform private.refresh_commercial_order_totals(sale_order.id);
  perform private.audit_commercial_order(sale_order, 'commercial_order.line_removed', clean, jsonb_build_object('lineNumber', line.line_number));
end;
$$;

create function public.close_commercial_order(target_order_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale_order public.orders%rowtype;
  active_lines integer;
begin
  sale_order := private.lock_commercial_order(target_order_id, true);
  if sale_order.commercial_status <> 'open' then
    raise exception using errcode = '55000', message = 'El pedido ya está cerrado.';
  end if;
  select count(*) into active_lines from public.order_lines where order_id = sale_order.id and removed_at is null;
  if active_lines = 0 then
    raise exception using errcode = '22023', message = 'Agrega al menos un trabajo antes de cerrar el pedido.';
  end if;

  update public.orders set commercial_status = 'confirmed', closed_by = (select auth.uid()), closed_at = now() where id = sale_order.id;
  perform private.audit_commercial_order(sale_order, 'commercial_order.closed', null,
    jsonb_build_object('lines', active_lines, 'totals', (select totals from public.orders where id = sale_order.id)));
end;
$$;

create function public.reopen_commercial_order(target_order_id bigint, reopen_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale_order public.orders%rowtype;
  clean text := btrim(coalesce(reopen_reason, ''));
begin
  sale_order := private.lock_commercial_order(target_order_id, true);
  if sale_order.commercial_status not in ('confirmed', 'ready') then
    raise exception using errcode = '55000', message = 'Solo se reabre un pedido cerrado que aún no se ha entregado.';
  end if;
  if exists (select 1 from public.order_lines where order_id = sale_order.id and delivered_at is not null) then
    raise exception using errcode = '55000', message = 'El pedido ya tiene trabajos entregados y no se puede reabrir.';
  end if;
  if char_length(clean) not between 5 and 300 then
    raise exception using errcode = '22023', message = 'Explica por qué se reabre (al menos 5 caracteres).';
  end if;

  update public.orders set commercial_status = 'open', ready_at = null, ready_by = null where id = sale_order.id;
  perform private.audit_commercial_order(sale_order, 'commercial_order.reopened', clean, jsonb_build_object('from', sale_order.commercial_status));
end;
$$;

create function public.mark_commercial_order_ready(target_order_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale_order public.orders%rowtype;
begin
  sale_order := private.lock_commercial_order(target_order_id, false);
  if sale_order.commercial_status = 'ready' then return; end if;
  if sale_order.commercial_status <> 'confirmed' then
    raise exception using errcode = '55000', message = 'Cierra el pedido antes de marcarlo listo para recoger.';
  end if;
  update public.orders set commercial_status = 'ready', ready_by = (select auth.uid()), ready_at = now() where id = sale_order.id;
  perform private.audit_commercial_order(sale_order, 'commercial_order.ready', null, '{}'::jsonb);
end;
$$;

-- Delivers the given lines (null = every pending one). The order becomes delivered when
-- no active line is pending, and closed if it is also paid.
create function public.deliver_commercial_order_lines(target_order_id bigint, target_line_ids bigint[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale_order public.orders%rowtype;
  delivered_numbers integer[];
  pending integer;
  balance_cup numeric(14,2);
begin
  sale_order := private.lock_commercial_order(target_order_id, false);
  if sale_order.commercial_status not in ('confirmed', 'ready') then
    raise exception using errcode = '55000', message = 'Solo se entrega un pedido cerrado que no se ha entregado completo.';
  end if;
  if target_line_ids is not null and exists (
    select 1 from unnest(target_line_ids) wanted
    where not exists (
      select 1 from public.order_lines line
      where line.id = wanted and line.order_id = sale_order.id and line.removed_at is null and line.delivered_at is null
    )
  ) then
    raise exception using errcode = '22023', message = 'Alguno de los trabajos no está pendiente de entrega en este pedido.';
  end if;

  with delivered as (
    update public.order_lines set delivered_at = now(), delivered_by = (select auth.uid())
    where order_id = sale_order.id and removed_at is null and delivered_at is null
      and (target_line_ids is null or id = any(target_line_ids))
    returning line_number
  )
  select array_agg(line_number order by line_number) into delivered_numbers from delivered;
  if delivered_numbers is null then
    raise exception using errcode = '22023', message = 'No hay trabajos pendientes de entrega.';
  end if;

  select count(*) into pending from public.order_lines where order_id = sale_order.id and removed_at is null and delivered_at is null;
  if pending = 0 then
    update public.orders set commercial_status = 'delivered' where id = sale_order.id;
    update public.orders set commercial_status = 'closed' where id = sale_order.id and payment_status = 'paid';
  end if;

  select greatest(coalesce(sale_order.cup_equivalent, 0) - coalesce(sum(payment.equivalent_cup), 0), 0)
  into balance_cup from public.payments payment where payment.order_id = sale_order.id;
  perform private.audit_commercial_order(sale_order, 'commercial_order.delivered', null,
    jsonb_build_object('lineNumbers', to_jsonb(delivered_numbers), 'complete', pending = 0, 'balanceCup', balance_cup));
  return jsonb_build_object('delivered', to_jsonb(delivered_numbers), 'pending', pending, 'balanceCup', balance_cup);
end;
$$;

revoke all on function public.list_commercial_accounts_for_orders(bigint) from public, anon;
revoke all on function public.open_commercial_order(bigint, bigint, bigint, numeric, uuid) from public, anon;
revoke all on function public.create_commercial_patient(bigint, bigint, text) from public, anon;
revoke all on function public.add_commercial_order_line(bigint, jsonb, uuid) from public, anon;
revoke all on function public.remove_commercial_order_line(bigint, text) from public, anon;
revoke all on function public.close_commercial_order(bigint) from public, anon;
revoke all on function public.reopen_commercial_order(bigint, text) from public, anon;
revoke all on function public.mark_commercial_order_ready(bigint) from public, anon;
revoke all on function public.deliver_commercial_order_lines(bigint, bigint[]) from public, anon;
grant execute on function public.list_commercial_accounts_for_orders(bigint) to authenticated;
grant execute on function public.open_commercial_order(bigint, bigint, bigint, numeric, uuid) to authenticated;
grant execute on function public.create_commercial_patient(bigint, bigint, text) to authenticated;
grant execute on function public.add_commercial_order_line(bigint, jsonb, uuid) to authenticated;
grant execute on function public.remove_commercial_order_line(bigint, text) to authenticated;
grant execute on function public.close_commercial_order(bigint) to authenticated;
grant execute on function public.reopen_commercial_order(bigint, text) to authenticated;
grant execute on function public.mark_commercial_order_ready(bigint) to authenticated;
grant execute on function public.deliver_commercial_order_lines(bigint, bigint[]) to authenticated;

-- H. Customers: the patient RPC links customers to an account (owner rule otherwise).
create or replace function private.guard_customer_commercial_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.commercial_account_id is distinct from (case when tg_op = 'UPDATE' then old.commercial_account_id end)
    and not private.in_commercial_rpc()
    and not private.can_manage_commercial_accounts(new.organization_id) then
    raise exception using errcode = '42501', message = 'No puedes vincular clientes a una óptica minorista.';
  end if;
  return new;
end;
$$;
