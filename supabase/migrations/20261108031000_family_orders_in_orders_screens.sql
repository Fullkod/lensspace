-- LEN0006 phase 4: family orders in the orders screens and messages.
-- * list_accessible_orders(): pairCount and the other patients' names (search by patient).
-- * get_order_detail(): pairs with patient, prescription and concepts.
-- * WhatsApp: {{pairs_summary}} renders "Pares: *N*" only when the order has 2+ pairs, so
--   single-pair messages stay byte for byte the same. Computed when the message is
--   built (after the order lines exist), never names the patients.

update public.notification_templates
set body_template = replace(body_template, 'Pedido: *{{order_number}}*', 'Pedido: *{{order_number}}*{{pairs_summary}}')
where key in ('order_accepted', 'order_ready') and body_template not like '%{{pairs_summary}}%';

create or replace function public.list_accessible_orders()
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sale_order.id,
    'orderNumber', sale_order.order_number,
    'customerId', sale_order.customer_id,
    'customerName', customer.full_name,
    'customerPhone', phones.primary_phone,
    'customerPhoneDigits', phones.all_digits,
    'pairCount', pairs.pair_count,
    'patientNames', pairs.patient_names,
    'commercialStatus', sale_order.commercial_status,
    'paymentStatus', sale_order.payment_status,
    'totalCup', sale_order.cup_equivalent,
    'createdAt', sale_order.created_at,
    'paidCup', paid.paid_cup,
    'balanceCup', greatest(sale_order.cup_equivalent - paid.paid_cup, 0),
    'paidTodayCup', paid.paid_today_cup,
    'hasOpenIncident', exists (
      select 1
      from public.production_jobs job
      join public.production_incidents incident on incident.job_id = job.id
      where job.order_id = sale_order.id and incident.rework_job_id is null
    )
  ) order by sale_order.created_at desc), '[]'::jsonb)
  from public.orders sale_order
  join public.customers customer on customer.id = sale_order.customer_id
  join public.organizations organization on organization.id = sale_order.organization_id
  cross join lateral (
    select
      (array_agg(phone.phone_number order by phone.is_primary desc, phone.id))[1] as primary_phone,
      coalesce(string_agg(phone.normalized_phone, ' '), '') as all_digits
    from public.customer_phones phone
    where phone.customer_id = customer.id
  ) phones
  cross join lateral (
    select
      count(*)::integer as pair_count,
      coalesce(string_agg(distinct patient.full_name, ' · ') filter (where line.patient_customer_id <> sale_order.customer_id), '') as patient_names
    from public.order_lines line
    left join public.customers patient on patient.id = line.patient_customer_id
    where line.order_id = sale_order.id
  ) pairs
  cross join lateral (
    select
      coalesce(sum(payment.equivalent_cup), 0) as paid_cup,
      coalesce(sum(payment.equivalent_cup) filter (
        where payment.business_date = (now() at time zone organization.timezone)::date
      ), 0) as paid_today_cup
    from public.payments payment
    where payment.order_id = sale_order.id
  ) paid;
$function$;


create or replace function public.get_order_detail(target_order_id bigint)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  history jsonb;
  pairs jsonb;
begin
  begin
    history := public.get_order_timeline(target_order_id);
  exception when others then
    history := '[]'::jsonb;
  end;
  -- SECURITY INVOKER: order_lines/order_items/customers RLS apply as for the order itself.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', line.id,
    'lineNumber', line.line_number,
    'patientCustomerId', line.patient_customer_id,
    'patientName', patient.full_name,
    'prescriptionLabel', case when revision.id is null then null
      else 'Receta #' || revision.prescription_id || ' · ' || to_char(revision.prescription_date, 'DD/MM/YYYY') end,
    'totals', line.totals,
    'cupEquivalent', line.cup_equivalent,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('name', item.name, 'amount', item.amount, 'currency', item.currency) order by item.position)
      from public.order_items item where item.order_line_id = line.id
    ), '[]'::jsonb)
  ) order by line.line_number), '[]'::jsonb)
  into pairs
  from public.order_lines line
  left join public.customers patient on patient.id = line.patient_customer_id
  left join public.prescription_revisions revision on revision.id = line.prescription_revision_id
  where line.order_id = target_order_id;

  return jsonb_build_object(
    'summary', public.get_order_payment_summary(target_order_id),
    'timeline', coalesce(history, '[]'::jsonb),
    'pairs', pairs
  );
end;
$function$;

create or replace function public.get_automatic_notification_payload(target_dispatch_id bigint)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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

  -- A sale priced only in USD is quoted and charged in USD, so its balance is told in
  -- USD at the sale's frozen rate, rounded up to the cent like the app (cupToUsd).
  balance_label := case
    when (select array_agg(key) from jsonb_object_keys(coalesce(sale_order.totals, '{}'::jsonb)) as key) = array['USD']
      and coalesce(sale_order.usd_to_cup_rate, 0) > 0
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
$function$;
