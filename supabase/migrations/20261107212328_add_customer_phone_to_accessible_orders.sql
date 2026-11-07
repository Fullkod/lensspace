-- LEN0007: the orders inbox shows the customer's phone and filters by any of their numbers.
-- customerPhone: primary number as stored (display); customerPhoneDigits: every normalized
-- number, space-separated, for client-side partial matching. Still SECURITY INVOKER: RLS on
-- customer_phones applies exactly as for the customer name.
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
      coalesce(sum(payment.equivalent_cup), 0) as paid_cup,
      coalesce(sum(payment.equivalent_cup) filter (
        where payment.business_date = (now() at time zone organization.timezone)::date
      ), 0) as paid_today_cup
    from public.payments payment
    where payment.order_id = sale_order.id
  ) paid;
$function$;
