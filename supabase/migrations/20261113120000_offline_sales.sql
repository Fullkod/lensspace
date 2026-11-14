-- LEN0011: sales recorded on a device with no network, uploaded later as normal orders.
-- The server records what already happened (the customer took the deal and paid); it
-- never rejects a sale over a price change, a possible duplicate customer or the device
-- clock. Those become flags on public.offline_sales for the owner and the seller.

create table public.offline_sales (
  id uuid primary key,                              -- generated on the device
  organization_id bigint not null references public.organizations (id),
  branch_id bigint not null references public.branches (id),
  order_id bigint not null unique references public.orders (id),
  seller_id uuid not null references auth.users (id),
  device_id uuid not null,
  local_number text not null check (char_length(local_number) between 1 and 40),
  sold_at timestamptz not null,
  uploaded_at timestamptz not null default now(),
  flags jsonb not null default '[]'::jsonb check (jsonb_typeof(flags) = 'array')
);
comment on table public.offline_sales is 'LEN0011: sales made without network; written only by record_offline_sale.';
create index offline_sales_branch_sold_idx on public.offline_sales (organization_id, branch_id, sold_at desc);
create index offline_sales_seller_idx on public.offline_sales (seller_id);

alter table public.offline_sales enable row level security;
-- Same visibility as the order it produced. No write policies: only the RPC writes.
create policy offline_sales_select on public.offline_sales for select to authenticated
  using ((select private.can_access_seller_sale(organization_id, branch_id, seller_id)));
revoke all on table public.offline_sales from anon;
grant select on table public.offline_sales to authenticated;

-- Sale time of the offline sale being uploaded, only inside record_offline_sale (the
-- setting lasts the transaction and clients cannot set it through the API).
create function private.offline_sale_time()
returns timestamptz
language sql
stable
set search_path to ''
as $$
  select nullif(current_setting('lensspace.offline_sold_at', true), '')::timestamptz;
$$;

create function private.same_money_totals(left_totals jsonb, right_totals jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select coalesce((
    select bool_and(coalesce((left_totals ->> key)::numeric, 0) = coalesce((right_totals ->> key)::numeric, 0))
    from (
      select jsonb_object_keys(coalesce(left_totals, '{}'::jsonb)) as key
      union
      select jsonb_object_keys(coalesce(right_totals, '{}'::jsonb))
    ) keys
  ), true);
$$;

-- Payments: an offline sale keeps the time it was paid (its cashbox day; post-close if
-- that day was already closed) and is never refused for exceeding a balance the server
-- recalculated. Everything else is unchanged.
create or replace function private.prepare_cash_payment()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  sale_order public.orders%rowtype;
  paid_cup numeric(14,2);
  remaining_cup numeric(14,2);
  incoming_cup numeric(14,2);
  target_cashbox_id bigint;
  organization_timezone text;
  offline_time timestamptz := private.offline_sale_time();
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
  new.received_at := coalesce(offline_time, now());

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
    and offline_time is null
    and not (
      new.currency = 'USD'
      and remaining_cup > 0
      and incoming_cup - remaining_cup < new.applied_rate * 0.01
    ) then
    raise exception using errcode = '22003', message = 'El pago supera el saldo pendiente.';
  end if;

  return new;
end;
$function$;

-- Stores the result row. Definer because offline_sales has no write policy; it only
-- accepts an order of the calling seller.
create function private.insert_offline_sale(
  sale_id uuid, target_order_id bigint, target_device_id uuid, target_local_number text,
  target_sold_at timestamptz, sale_flags jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  sale_order public.orders%rowtype;
begin
  select * into sale_order from public.orders where id = target_order_id and primary_seller_id = (select auth.uid());
  if not found then
    raise exception using errcode = '42501', message = 'Pedido de la venta sin conexión no válido.';
  end if;
  insert into public.offline_sales (id, organization_id, branch_id, order_id, seller_id, device_id, local_number, sold_at, flags)
  values (sale_id, sale_order.organization_id, sale_order.branch_id, sale_order.id, sale_order.primary_seller_id,
    target_device_id, btrim(target_local_number), target_sold_at, sale_flags);
end;
$$;
-- Private schema is not exposed by the API; the invoker RPC runs as authenticated.
revoke all on function private.insert_offline_sale(uuid, bigint, uuid, text, timestamptz, jsonb) from public, anon;
grant execute on function private.insert_offline_sale(uuid, bigint, uuid, text, timestamptz, jsonb) to authenticated;

-- Dates the order on the day it was sold (sellers have no UPDATE grant on orders).
create function private.stamp_offline_order(target_order_id bigint, target_sold_at timestamptz)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.orders set created_at = target_sold_at, accepted_at = target_sold_at
  where id = target_order_id and primary_seller_id = (select auth.uid()) and order_kind = 'retail';
  if not found then
    raise exception using errcode = '42501', message = 'Pedido de la venta sin conexión no válido.';
  end if;
end;
$$;
revoke all on function private.stamp_offline_order(bigint, timestamptz) from public, anon;
grant execute on function private.stamp_offline_order(bigint, timestamptz) to authenticated;

-- One uuid per entity derived from the sale id, so the inner retry-safe RPCs get stable keys.
create function private.offline_key(sale_id uuid, part text)
returns uuid
language sql
immutable
set search_path to ''
as $$
  select md5(sale_id::text || ':' || part)::uuid;
$$;

-- New customer from the device payload: {fullName, nationalId?, address?, birthDate?,
-- notes?, messagingConsent?, phones: [{number, label?, whatsappEnabled?}]}.
create function private.offline_new_customer(
  target_organization_id bigint, target_branch_id bigint, sale_id uuid, part text, customer jsonb, inout sale_flags jsonb,
  out customer_id bigint
)
language plpgsql
set search_path to ''
as $$
declare
  duplicates bigint[];
begin
  select array_agg(distinct phone.customer_id) into duplicates
  from public.customer_phones phone
  join public.customers existing on existing.id = phone.customer_id and existing.archived_at is null
  where phone.organization_id = target_organization_id and phone.branch_id = target_branch_id
    and phone.normalized_phone in (
      select regexp_replace(entry ->> 'number', '[^0-9]', '', 'g') from jsonb_array_elements(coalesce(customer -> 'phones', '[]'::jsonb)) entry
    )
    and coalesce((customer ->> 'isRelative')::boolean, false) = false;

  customer_id := public.create_customer_with_phones(
    target_organization_id, target_branch_id, customer ->> 'fullName', private.offline_key(sale_id, part),
    customer ->> 'nationalId', customer ->> 'address', (customer ->> 'birthDate')::date, customer ->> 'notes',
    coalesce((customer ->> 'messagingConsent')::boolean, false), coalesce(customer -> 'phones', '[]'::jsonb)
  );
  if duplicates is not null then
    sale_flags := sale_flags || jsonb_build_array(jsonb_build_object(
      'type', 'possible_duplicate_customer', 'customerId', customer_id, 'name', customer ->> 'fullName', 'existingCustomerIds', to_jsonb(duplicates)
    ));
  end if;
end;
$$;

-- New prescription revision for a patient from {prescriptionDate, prescriberName, rightSphere, ...}.
create function private.offline_new_revision(target_organization_id bigint, target_branch_id bigint, target_customer_id bigint, rx jsonb)
returns bigint
language plpgsql
set search_path to ''
as $$
begin
  return (public.create_prescription_revision(
    target_organization_id, target_branch_id, target_customer_id, null,
    coalesce((rx ->> 'prescriptionDate')::date, current_date), rx ->> 'prescriberName',
    (rx ->> 'rightSphere')::numeric, (rx ->> 'rightCylinder')::numeric, (rx ->> 'rightAxis')::smallint,
    (rx ->> 'rightAddition')::numeric, (rx ->> 'rightPrism')::numeric, rx ->> 'rightPrismBase',
    (rx ->> 'leftSphere')::numeric, (rx ->> 'leftCylinder')::numeric, (rx ->> 'leftAxis')::smallint,
    (rx ->> 'leftAddition')::numeric, (rx ->> 'leftPrism')::numeric, rx ->> 'leftPrismBase',
    (rx ->> 'pupillaryDistanceTotal')::numeric, (rx ->> 'rightPupillaryDistance')::numeric, (rx ->> 'leftPupillaryDistance')::numeric,
    (rx ->> 'rightHeight')::numeric, (rx ->> 'leftHeight')::numeric, rx ->> 'notes', null
  ) ->> 'revisionId')::bigint;
end;
$$;

-- Uploads one offline sale in one transaction: holder, patients and prescriptions,
-- quotation, acceptance and the cash payment. Retry-safe by sale_id: a repeat returns
-- the same order. Permission errors propagate, so the device keeps the sale (D8).
create function public.record_offline_sale(sale_id uuid, sale jsonb)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_organization_id bigint := (sale ->> 'organizationId')::bigint;
  target_branch_id bigint := (sale ->> 'branchId')::bigint;
  sold_at timestamptz := (sale ->> 'soldAt')::timestamptz;
  sale_flags jsonb := '[]'::jsonb;
  existing public.offline_sales%rowtype;
  holder_id bigint;
  pair jsonb;
  pair_index integer := 0;
  patient_id bigint;
  revision_id bigint;
  lines jsonb := '[]'::jsonb;
  quote jsonb;
  accepted jsonb;
  target_order_id bigint;
  paid_cup numeric;
  order_cup numeric;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión.';
  end if;
  if sale_id is null or jsonb_typeof(sale) is distinct from 'object' or sold_at is null
    or jsonb_typeof(sale -> 'pairs') is distinct from 'array' or jsonb_array_length(sale -> 'pairs') not between 1 and 10 then
    raise exception using errcode = '22023', message = 'Venta sin conexión incompleta.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('offline_sale:' || sale_id::text, 0));
  select * into existing from public.offline_sales where id = sale_id;
  if found then
    return jsonb_build_object('orderId', existing.order_id, 'orderNumber', (select order_number from public.orders where id = existing.order_id),
      'flags', existing.flags, 'duplicate', true);
  end if;

  if not private.can_write_seller_sale(target_organization_id, target_branch_id, actor_user_id) then
    raise exception using errcode = '42501', message = 'No puedes vender en esta sucursal.';
  end if;

  -- D7: a device clock ahead of the server must not move the sale to another day.
  if sold_at > now() + interval '10 minutes' then
    sale_flags := sale_flags || jsonb_build_array(jsonb_build_object('type', 'clock_skew', 'deviceSoldAt', sold_at));
    sold_at := now();
  elsif sold_at < now() - interval '8 days' then
    sale_flags := sale_flags || jsonb_build_array(jsonb_build_object('type', 'late_upload', 'soldAt', sold_at));
  end if;

  if sale -> 'holder' ? 'id' then
    holder_id := (sale -> 'holder' ->> 'id')::bigint;
  else
    select created.customer_id, created.sale_flags into holder_id, sale_flags
    from private.offline_new_customer(target_organization_id, target_branch_id, sale_id, 'holder', sale -> 'holder' -> 'new', sale_flags) created;
  end if;

  for pair in select value from jsonb_array_elements(sale -> 'pairs') loop
    pair_index := pair_index + 1;
    if pair -> 'patient' ? 'id' then
      patient_id := (pair -> 'patient' ->> 'id')::bigint;
    elsif pair -> 'patient' ? 'new' then
      select created.customer_id, created.sale_flags into patient_id, sale_flags
      from private.offline_new_customer(target_organization_id, target_branch_id, sale_id, 'patient:' || pair_index,
        (pair -> 'patient' -> 'new') || '{"isRelative": true}'::jsonb, sale_flags) created;
    else
      patient_id := holder_id;
    end if;

    if pair -> 'prescription' ? 'revisionId' then
      revision_id := (pair -> 'prescription' ->> 'revisionId')::bigint;
    elsif pair -> 'prescription' ? 'new' then
      revision_id := private.offline_new_revision(target_organization_id, target_branch_id, patient_id, pair -> 'prescription' -> 'new');
    else
      revision_id := null;
    end if;

    lines := lines || jsonb_build_array(jsonb_build_object(
      'patientCustomerId', patient_id, 'prescriptionRevisionId', revision_id,
      'itemIds', coalesce(pair -> 'itemIds', '[]'::jsonb), 'lineAdjustments', coalesce(pair -> 'lineAdjustments', '{}'::jsonb)
    ));
  end loop;

  quote := public.save_multi_line_quotation(
    null, target_organization_id, target_branch_id, holder_id, lines, (sale ->> 'usdToCupRate')::numeric,
    sale ->> 'notes', private.offline_key(sale_id, 'quotation')
  );
  -- D4: the server prices with today's catalog; a different total is recorded, not refused.
  if sale -> 'device' ? 'totals' and not private.same_money_totals(sale -> 'device' -> 'totals', quote -> 'pricing' -> 'totals') then
    sale_flags := sale_flags || jsonb_build_array(jsonb_build_object(
      'type', 'price_mismatch', 'deviceTotals', sale -> 'device' -> 'totals', 'serverTotals', quote -> 'pricing' -> 'totals'
    ));
  end if;

  accepted := public.accept_quotation((quote ->> 'quotationId')::bigint);
  target_order_id := (accepted ->> 'orderId')::bigint;
  -- The order belongs to the day it was sold, not the day it reached the server.
  perform private.stamp_offline_order(target_order_id, sold_at);

  if coalesce((sale -> 'payment' ->> 'amount')::numeric, 0) > 0 then
    perform set_config('lensspace.offline_sold_at', sold_at::text, true);
    perform public.register_cash_payment(
      target_order_id, (sale -> 'payment' ->> 'amount')::numeric, sale -> 'payment' ->> 'currency',
      -- CUP is 1 as in the online form; for USD the payment trigger uses the order rate.
      coalesce((sale -> 'payment' ->> 'appliedRate')::numeric, 1), sale -> 'payment' ->> 'notes', private.offline_key(sale_id, 'payment')
    );
    perform set_config('lensspace.offline_sold_at', '', true);
    select coalesce(sum(equivalent_cup), 0) into paid_cup from public.payments where order_id = target_order_id;
    select cup_equivalent into order_cup from public.orders where id = target_order_id;
    if paid_cup > coalesce(order_cup, 0) then
      sale_flags := sale_flags || jsonb_build_array(jsonb_build_object('type', 'overpaid', 'paidCup', paid_cup, 'orderCup', order_cup));
    end if;
  end if;

  perform private.insert_offline_sale(sale_id, target_order_id, (sale ->> 'deviceId')::uuid, sale ->> 'localNumber', sold_at, sale_flags);
  return jsonb_build_object('orderId', target_order_id, 'orderNumber', accepted ->> 'orderNumber', 'flags', sale_flags, 'duplicate', false);
end;
$$;
revoke all on function public.record_offline_sale(uuid, jsonb) from public, anon;
grant execute on function public.record_offline_sale(uuid, jsonb) to authenticated;
