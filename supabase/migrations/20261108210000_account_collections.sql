-- LEN0010 phase 5: collections from retail opticians and their debt.
-- A collection is recorded once and split across one or several commercial orders of the
-- account: one payments row per order, in the receiver's cashbox, sharing collection_id.
-- prepare_cash_payment keeps every rule (rate, overpayment, cashbox, post-close) and now
-- also lets the seller with the exceptional permission collect commercial orders.

alter table public.payments add column collection_id uuid;
create index payments_collection_idx on public.payments (collection_id) where collection_id is not null;

-- Same body as 20261107021257 except the access check.
create or replace function private.prepare_cash_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
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

  -- LEN0010: the seller with the exceptional permission also collects commercial orders.
  if not (private.can_write_seller_sale(sale_order.organization_id, sale_order.branch_id, sale_order.primary_seller_id)
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

-- allocations: [{orderId, amount}] in the collection currency; their sum is the amount.
create function public.record_account_collection(
  target_account_id bigint,
  collection_amount numeric,
  collection_currency text,
  allocations jsonb,
  collection_notes text default null,
  request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.commercial_accounts%rowtype;
  collection uuid := coalesce(request_id, gen_random_uuid());
  currency_code text := upper(coalesce(collection_currency, ''));
  allocation jsonb;
  target_order public.orders%rowtype;
  allocated numeric(14,2) := 0;
  share numeric(14,2);
  created jsonb := '[]'::jsonb;
  new_payment_id bigint;
begin
  select * into account from public.commercial_accounts where id = target_account_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'La óptica minorista no existe.';
  end if;
  if exists (select 1 from public.payments where collection_id = collection) then
    return jsonb_build_object('collectionId', collection, 'duplicate', true,
      'payments', (select jsonb_agg(jsonb_build_object('orderId', order_id, 'paymentId', id, 'amount', amount)) from public.payments where collection_id = collection));
  end if;
  if currency_code not in ('CUP', 'USD') then
    raise exception using errcode = '22023', message = 'La moneda del cobro debe ser CUP o USD.';
  end if;
  if collection_amount is null or collection_amount <= 0 then
    raise exception using errcode = '22023', message = 'Indica un importe mayor que 0.';
  end if;
  if allocations is null or jsonb_typeof(allocations) <> 'array' or jsonb_array_length(allocations) = 0 then
    raise exception using errcode = '22023', message = 'Indica a qué pedidos se aplica el cobro.';
  end if;

  for allocation in select value from jsonb_array_elements(allocations) loop
    begin
      share := (allocation->>'amount')::numeric;
      select * into target_order from public.orders where id = (allocation->>'orderId')::bigint;
    exception when others then
      raise exception using errcode = '22023', message = 'El reparto del cobro no tiene un formato válido.';
    end;
    if target_order.id is null or target_order.order_kind <> 'commercial' or target_order.commercial_account_id <> account.id
      or not private.can_see_commercial_order(target_order.organization_id, target_order.branch_id, target_order.primary_seller_id) then
      raise exception using errcode = 'P0002', message = 'Uno de los pedidos no es de esta óptica o no puedes cobrarlo.';
    end if;
    if share is null or share <= 0 then
      raise exception using errcode = '22023', message = 'Cada pedido del reparto necesita un importe mayor que 0.';
    end if;
    allocated := allocated + share;

    -- prepare_cash_payment sets organization, branch, receiver, cashbox and the USD rate,
    -- and refuses an overpayment of that order.
    insert into public.payments (order_id, organization_id, branch_id, received_by, amount, currency, applied_rate, notes, collection_id)
    values (target_order.id, 0, 0, (select auth.uid()), share, currency_code, target_order.usd_to_cup_rate,
      nullif(btrim(coalesce(collection_notes, '')), ''), collection)
    returning id into new_payment_id;
    created := created || jsonb_build_array(jsonb_build_object('orderId', target_order.id, 'orderNumber', target_order.order_number, 'paymentId', new_payment_id, 'amount', share));
    target_order := null;
  end loop;

  if allocated <> round(collection_amount, 2) then
    raise exception using errcode = '22023', message = 'El reparto no suma el importe cobrado.';
  end if;

  insert into public.audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, origin, payload)
  values (account.organization_id, (select auth.uid()), 'commercial_account.collected', 'commercial_account', account.id::text, 'application',
    jsonb_build_object('collectionId', collection, 'amount', collection_amount, 'currency', currency_code, 'payments', created));
  return jsonb_build_object('collectionId', collection, 'duplicate', false, 'payments', created);
end;
$$;

-- Collections of an account (grouped by collection_id; single payments stand alone),
-- limited to the orders the caller can see.
create function public.list_account_collections(target_account_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(entry order by received_at desc), '[]'::jsonb)
  from (
    select max(payment.received_at) as received_at, jsonb_build_object(
      'collectionId', coalesce(payment.collection_id::text, 'payment-' || min(payment.id)),
      'receivedAt', max(payment.received_at),
      'receivedByName', max(profile.display_name),
      'currency', max(payment.currency),
      'amount', sum(payment.amount),
      'notes', max(payment.notes),
      'orders', jsonb_agg(jsonb_build_object('orderId', sale_order.id, 'orderNumber', sale_order.order_number, 'amount', payment.amount) order by sale_order.created_at)
    ) as entry
    from public.payments payment
    join public.orders sale_order on sale_order.id = payment.order_id
    left join public.profiles profile on profile.user_id = payment.received_by
    where sale_order.order_kind = 'commercial'
      and sale_order.commercial_account_id = target_account_id
      and private.can_see_commercial_order(sale_order.organization_id, sale_order.branch_id, sale_order.primary_seller_id)
    group by coalesce(payment.collection_id::text, 'payment-' || payment.id), payment.collection_id
  ) grouped;
$$;

revoke all on function public.record_account_collection(bigint, numeric, text, jsonb, text, uuid) from public, anon;
revoke all on function public.list_account_collections(bigint) from public, anon;
grant execute on function public.record_account_collection(bigint, numeric, text, jsonb, text, uuid) to authenticated;
grant execute on function public.list_account_collections(bigint) to authenticated;
