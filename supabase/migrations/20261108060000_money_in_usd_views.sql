-- Show money in USD everywhere (owner decision 2026-11-08) while the base stays as is:
-- catalog prices, payments and cashboxes keep their currency and balances are still
-- CUP equivalents at each sale's frozen rate. The orders list exposes the sale rate and
-- the owner dashboard adds USD figures converted order by order.

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
    'patientCustomerIds', pairs.patient_ids,
    'commercialStatus', sale_order.commercial_status,
    'paymentStatus', sale_order.payment_status,
    'totalCup', sale_order.cup_equivalent,
    'saleRate', sale_order.usd_to_cup_rate,
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
      coalesce(string_agg(distinct patient.full_name, ' · ') filter (where line.patient_customer_id <> sale_order.customer_id), '') as patient_names,
      coalesce(jsonb_agg(distinct line.patient_customer_id) filter (where line.patient_customer_id <> sale_order.customer_id), '[]'::jsonb) as patient_ids
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


create or replace function private.get_owner_dashboard_unchecked(target_organization_id bigint, target_branch_id bigint DEFAULT NULL::bigint, target_seller_id uuid DEFAULT NULL::uuid, date_from date DEFAULT (CURRENT_DATE - 29), date_to date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  if date_to < date_from or date_to - date_from > 366 then
    raise exception using errcode = '22023', message = 'El rango debe estar ordenado y no exceder 367 días.';
  end if;
  if not private.has_organization_role(target_organization_id, array['owner']) then
    raise exception using errcode = '42501', message = 'Solo el propietario puede consultar analítica.';
  end if;

  with filtered_orders as (
    select sale_order.*
    from public.orders sale_order
    where sale_order.organization_id = target_organization_id
      and (target_branch_id is null or sale_order.branch_id = target_branch_id)
      and (target_seller_id is null or sale_order.primary_seller_id = target_seller_id)
      and sale_order.accepted_at >= date_from::timestamptz
      and sale_order.accepted_at < (date_to + 1)::timestamptz
  ), payments_summary as (
    select coalesce(sum(payment.equivalent_cup), 0) collected_cup,
      round(coalesce(sum(payment.equivalent_cup / nullif(sale_order.usd_to_cup_rate, 0)), 0), 2) collected_usd
    from public.payments payment join filtered_orders sale_order on sale_order.id = payment.order_id
  ), seller_totals as (
    select sale_order.primary_seller_id, coalesce(profile.display_name, 'Vendedor') seller_name,
      count(*) order_count, coalesce(sum(sale_order.cup_equivalent), 0) sales_cup,
      round(coalesce(sum(sale_order.cup_equivalent / nullif(sale_order.usd_to_cup_rate, 0)), 0), 2) sales_usd
    from filtered_orders sale_order left join public.profiles profile on profile.user_id = sale_order.primary_seller_id
    group by sale_order.primary_seller_id, profile.display_name order by sales_cup desc
  ), provider_loads as (
    select job.provider_id, coalesce(profile.display_name, 'Proveedor') provider_name,
      job.job_type, count(*) filter (where job.is_current and job.status not in ('received', 'reviewed')) active_jobs
    from public.production_jobs job
    join filtered_orders sale_order on sale_order.id = job.order_id
    left join public.profiles profile on profile.user_id = job.provider_id
    group by job.provider_id, profile.display_name, job.job_type
  ), top_items as (
    select item.name, item.category, count(*) quantity
    from public.order_items item join filtered_orders sale_order on sale_order.id = item.order_id
    group by item.name, item.category order by quantity desc, item.name limit 8
  )
  select jsonb_build_object(
    'orders', jsonb_build_object(
      'total', count(*),
      'accepted', count(*) filter (where commercial_status = 'accepted'),
      'delivered', count(*) filter (where commercial_status = 'delivered'),
      'withIncidents', count(*) filter (where exists (
        select 1 from public.production_jobs job join public.production_incidents incident on incident.job_id = job.id
        where job.order_id = filtered_orders.id
      ))
    ),
    'salesCup', coalesce(sum(cup_equivalent), 0),
    -- USD figures convert each order at its own frozen rate (owner decision 2026-11-08).
    'salesUsd', round(coalesce(sum(cup_equivalent / nullif(usd_to_cup_rate, 0)), 0), 2),
    'collectionsUsd', (select collected_usd from payments_summary),
    'outstandingUsd', round(coalesce(sum(greatest(coalesce(cup_equivalent, 0) - coalesce((
      select sum(payment.equivalent_cup) from public.payments payment where payment.order_id = filtered_orders.id
    ), 0), 0) / nullif(usd_to_cup_rate, 0)), 0), 2),
    'collectionsCup', (select collected_cup from payments_summary),
    'outstandingCup', coalesce(sum(greatest(coalesce(cup_equivalent, 0) - coalesce((
      select sum(payment.equivalent_cup) from public.payments payment where payment.order_id = filtered_orders.id
    ), 0), 0)), 0),
    'averageDeliveryHours', round((avg(extract(epoch from (delivered_at - accepted_at)) / 3600)
      filter (where delivered_at is not null))::numeric, 1),
    'cashDifferenceCup', coalesce((select sum(closure.difference_amount)
      from public.cashbox_closures closure
      where closure.organization_id = target_organization_id
        and closure.currency = 'CUP'
        and (target_branch_id is null or closure.branch_id = target_branch_id)
        and (target_seller_id is null or closure.seller_id = target_seller_id)
        and closure.business_date between date_from and date_to), 0),
    'bySeller', (select coalesce(jsonb_agg(to_jsonb(seller_totals)), '[]'::jsonb) from seller_totals),
    'providerLoads', (select coalesce(jsonb_agg(to_jsonb(provider_loads)), '[]'::jsonb) from provider_loads),
    'topItems', (select coalesce(jsonb_agg(to_jsonb(top_items)), '[]'::jsonb) from top_items)
  ) into result from filtered_orders;
  return result;
end;
$function$
;


-- Dashboard header: same figures as the orders page, also in USD (each order at its rate).
create or replace function public.get_order_kpis()
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with orders as (
    select entry ->> 'commercialStatus' as commercial_status,
      (entry ->> 'balanceCup')::numeric as balance_cup,
      coalesce((entry ->> 'paidTodayCup')::numeric, 0) as paid_today_cup,
      nullif((entry ->> 'saleRate')::numeric, 0) as sale_rate
    from jsonb_array_elements(public.list_accessible_orders()) entry
  ), active as (
    select * from orders where commercial_status not in ('delivered', 'closed')
  )
  select jsonb_build_object(
    'activeCount', (select count(*) from active),
    'balanceDue', (select coalesce(sum(balance_cup), 0) from active),
    'balanceDueUsd', (select round(coalesce(sum(balance_cup / sale_rate), 0), 2) from active),
    'readyToDeliver', (select count(*) from active where balance_cup <= 0),
    'withBalance', (select count(*) from active where balance_cup > 0),
    'collectedToday', (select coalesce(sum(paid_today_cup), 0) from orders),
    'collectedTodayUsd', (select round(coalesce(sum(paid_today_cup / sale_rate), 0), 2) from orders)
  );
$function$;
