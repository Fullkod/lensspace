-- WhatsApp balance always in USD (at the sale rate), for every sale, not only USD-only ones.

create or replace function public.get_automatic_notification_payload(target_dispatch_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  dispatch private.notification_dispatches%rowtype;
  sale_order public.orders%rowtype;
  customer public.customers%rowtype;
  template public.notification_templates%rowtype;
  store_name text;
  sender_name text;
  sender_phone text;
  payment_label text;
  recipient text;
  rendered text;
  balance numeric(14,2);
  balance_label text;
  pair_count integer;
  module_available boolean;
begin
  select * into dispatch from private.notification_dispatches where id = target_dispatch_id;
  if not found then raise exception using errcode = 'P0002', message = 'Despacho no encontrado.'; end if;

  select * into sale_order from public.orders where id = dispatch.order_id;
  select * into customer from public.customers where id = sale_order.customer_id;
  select * into template from public.notification_templates
    where key = dispatch.template_key and is_active;
  select organization.name into store_name from public.organizations organization
    where organization.id = sale_order.organization_id;
  select profile.display_name, nullif(btrim(profile.phone), '') into sender_name, sender_phone
    from public.profiles profile where profile.user_id = dispatch.actor_id;
  if sender_phone is null then
    select nullif(btrim(profile.phone), '') into sender_phone
    from public.organization_memberships membership
    join public.profiles profile on profile.user_id = membership.user_id
    where membership.organization_id = sale_order.organization_id
      and membership.role = 'owner' and membership.status = 'active'
      and nullif(btrim(profile.phone), '') is not null
    order by membership.id
    limit 1;
  end if;

  if dispatch.template_key = 'payment_received' then
    select private.format_amount_es(payment.amount) || ' ' || payment.currency into payment_label
    from public.payments payment
    where payment.order_id = sale_order.id
      and payment.id::text = split_part(dispatch.source_event_key, ':', 2);
  end if;

  select exists (
    select 1
    from public.organizations organization
    join public.subscriptions subscription on subscription.organization_id = organization.id
    join public.organization_modules organization_module
      on organization_module.organization_id = organization.id
      and organization_module.module_key = 'whatsapp'
      and organization_module.is_enabled
    join public.modules module on module.key = organization_module.module_key and module.is_active
    where organization.id = sale_order.organization_id
      and organization.status = 'active'
      and subscription.status in ('trial', 'active')
      and current_date between subscription.starts_on and subscription.expires_on
  ) into module_available;

  select phone.normalized_phone into recipient
  from public.customer_phones phone
  where phone.customer_id = customer.id and phone.whatsapp_enabled
  order by phone.is_primary desc, phone.id
  limit 1;

  select greatest(
    coalesce(sale_order.cup_equivalent, 0) - coalesce(sum(payment.equivalent_cup), 0), 0
  ) into balance from public.payments payment where payment.order_id = sale_order.id;

  -- Product decision (Roberto, 2026-11-08): messages always tell the balance in USD at
  -- the sale's frozen rate, rounded up to the cent like the app (cupToUsd). CUP only
  -- when the order has no rate.
  balance_label := case
    when coalesce(sale_order.usd_to_cup_rate, 0) > 0
    then private.format_amount_es(ceil(round(balance / sale_order.usd_to_cup_rate * 100, 2)) / 100) || ' USD'
    else private.format_amount_es(balance) || ' CUP'
  end;

  -- Family orders: the holder is told how many pairs, never whose they are (LEN0006).
  select count(*) into pair_count from public.order_lines line where line.order_id = sale_order.id;

  rendered := replace(replace(replace(replace(replace(replace(replace(template.body_template,
    '{{pairs_summary}}', case when pair_count > 1 then E'\nPares: *' || pair_count || '*' else '' end),
    '{{balance}}', balance_label),
    '{{customer_name}}', customer.full_name),
    '{{order_number}}', sale_order.order_number),
    '{{balance_cup}}', private.format_amount_es(balance)),
    '{{store_name}}', coalesce(store_name, 'la óptica')),
    '{{payment_amount}}', coalesce(payment_label, 'efectivo'));
  rendered := rendered || E'\n\n' || case
    when sender_phone is not null then
      '_Te atendió ' || coalesce(sender_name, store_name) || '._' || E'\n'
      || '_Si tienes dudas, escríbele al ' || sender_phone || '._' || E'\n'
      || '_Este número solo envía avisos._'
    else
      '_Te atendió ' || coalesce(sender_name, 'el equipo') || ' de ' || coalesce(store_name, 'la óptica') || '._'
      || E'\n' || '_Este número solo envía avisos._'
  end;

  return jsonb_build_object(
    'dispatchId', dispatch.id,
    'sourceEventKey', dispatch.source_event_key,
    'dispatchStatus', dispatch.status,
    'orderId', sale_order.id,
    'organizationId', sale_order.organization_id,
    'branchId', sale_order.branch_id,
    'customerId', customer.id,
    'templateKey', template.key,
    'actorId', dispatch.actor_id,
    'recipient', recipient,
    'message', rendered,
    'failureCode', case
      when not module_available then 'module_unavailable'
      when not customer.messaging_consent then 'missing_consent'
      when recipient is null then 'missing_recipient'
      else null
    end,
    'failureMessage', case
      when not module_available then 'WhatsApp no está operativo para esta organización.'
      when not customer.messaging_consent then 'El cliente no autorizó mensajería.'
      when recipient is null then 'No existe un teléfono habilitado para WhatsApp.'
      else null
    end
  );
end;
$function$
;
