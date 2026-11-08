-- LEN0006 phase 6: "Ver pedidos de este cliente" on a relative's card also lists the family
-- orders where they wear a pair (patientCustomerIds).

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
