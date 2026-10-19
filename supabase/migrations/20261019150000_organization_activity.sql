-- LEN0002: product usage and organization activity for the platform admin.
--
-- Aggregates only (QA-38): counts, dates and money per currency. No customer,
-- prescription, order number or message text leaves these functions. One event
-- stream feeds both the activity card and the 30-day figures of the organization
-- list, so the numbers always match. Business dates are America/Havana days.

-- Every user action that shows the product is being used, one row per event.
-- WhatsApp attempts are listed for their own counts but are not "activity": they are
-- sent automatically after other events.
create or replace function private.organization_activity_events(target_organization_id bigint)
returns table (organization_id bigint, kind text, occurred_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select organization_id, 'quotation', created_at from public.quotations
    where target_organization_id is null or organization_id = target_organization_id
  union all select organization_id, 'quotation_accepted', accepted_at from public.quotations
    where accepted_at is not null and (target_organization_id is null or organization_id = target_organization_id)
  union all select organization_id, 'order', created_at from public.orders
    where target_organization_id is null or organization_id = target_organization_id
  union all select organization_id, 'order_delivered', delivered_at from public.orders
    where delivered_at is not null and (target_organization_id is null or organization_id = target_organization_id)
  union all select organization_id, 'price_adjustment', created_at from public.order_items
    where price_adjustment_reason is not null and (target_organization_id is null or organization_id = target_organization_id)
  union all select organization_id, 'payment', received_at from public.payments
    where target_organization_id is null or organization_id = target_organization_id
  union all select organization_id, 'customer', created_at from public.customers
    where target_organization_id is null or organization_id = target_organization_id
  union all select organization_id, 'prescription', created_at from public.prescriptions
    where target_organization_id is null or organization_id = target_organization_id
  union all select organization_id, 'production_assigned', assigned_at from public.production_jobs
    where assigned_at is not null and original_job_id is null and (target_organization_id is null or organization_id = target_organization_id)
  union all select organization_id, 'rework', assigned_at from public.production_jobs
    where assigned_at is not null and original_job_id is not null and (target_organization_id is null or organization_id = target_organization_id)
  union all select organization_id, 'production_received', received_at from public.production_jobs
    where received_at is not null and (target_organization_id is null or organization_id = target_organization_id)
  union all select organization_id, 'cashbox_closure', closed_at from public.cashbox_closures
    where target_organization_id is null or organization_id = target_organization_id
  union all select organization_id, 'whatsapp', attempted_at from public.notification_attempts
    where target_organization_id is null or organization_id = target_organization_id;
$$;

-- Start of the period: midnight in Havana, N days back including today; null = always.
create or replace function private.activity_period_start(target_days integer)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when target_days is null then '-infinity'::timestamptz
    else (((now() at time zone 'America/Havana')::date - (target_days - 1))::timestamp at time zone 'America/Havana') end;
$$;

revoke all on function private.organization_activity_events(bigint), private.activity_period_start(integer)
  from public, anon, authenticated;

-- One optician (target_organization_id) or the whole platform (null), over the last
-- target_days days (null = always).
create or replace function public.get_organization_activity(target_organization_id bigint default null, target_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  period_start timestamptz;
  result jsonb;
begin
  if not (select private.is_platform_admin()) then
    raise exception 'Solo la administración de la plataforma puede ver la actividad.' using errcode = '42501';
  end if;
  if target_days is not null and target_days not between 1 and 3660 then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  if target_organization_id is not null and not exists (select 1 from public.organizations where id = target_organization_id) then
    raise exception 'Organización no encontrada.' using errcode = 'P0002';
  end if;
  period_start := private.activity_period_start(target_days);

  with all_events as (
    select * from private.organization_activity_events(target_organization_id)
  ), period_events as (
    select * from all_events where occurred_at >= period_start
  ), period_payments as (
    select currency, amount, equivalent_cup from public.payments
    where received_at >= period_start and (target_organization_id is null or organization_id = target_organization_id)
  ), weeks as (
    select (date_trunc('week', now() at time zone 'America/Havana')::date - 7 * step) as week_start
    from generate_series(0, 7) step
  )
  select jsonb_build_object(
    'days', target_days,
    'periodStart', case when target_days is null then null else period_start end,
    'counts', (select coalesce(jsonb_object_agg(kind, total), '{}'::jsonb)
      from (select kind, count(*) as total from period_events group by kind) counted),
    'activeDays', (select count(distinct (occurred_at at time zone 'America/Havana')::date)
      from period_events where kind <> 'whatsapp'),
    'lastActivityAt', (select max(occurred_at) from all_events where kind <> 'whatsapp'),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('currency', currency, 'count', total, 'amount', amount) order by currency), '[]'::jsonb)
      from (select currency, count(*) as total, sum(amount) as amount from period_payments group by currency) grouped),
    'cupEquivalent', (select coalesce(sum(equivalent_cup), 0) from period_payments),
    'whatsappByTemplate', (select coalesce(jsonb_agg(jsonb_build_object('template', template_key, 'total', total, 'sent', sent) order by total desc), '[]'::jsonb)
      from (select template_key, count(*) as total, count(*) filter (where outcome = 'sent') as sent
        from public.notification_attempts
        where attempted_at >= period_start and (target_organization_id is null or organization_id = target_organization_id)
        group by template_key) grouped),
    'weekly', (select jsonb_agg(jsonb_build_object(
        'weekStart', week_start,
        'orders', (select count(*) from all_events event where event.kind = 'order'
          and (event.occurred_at at time zone 'America/Havana')::date >= week_start
          and (event.occurred_at at time zone 'America/Havana')::date < week_start + 7),
        'payments', (select count(*) from all_events event where event.kind = 'payment'
          and (event.occurred_at at time zone 'America/Havana')::date >= week_start
          and (event.occurred_at at time zone 'America/Havana')::date < week_start + 7)
      ) order by week_start) from weeks),
    'adoption', case when target_organization_id is null then jsonb_build_object(
      'organizations', (select count(*) from public.organizations where status <> 'archived'),
      'active', (select count(distinct organization_id) from period_events where kind <> 'whatsapp'),
      'byKind', (select coalesce(jsonb_object_agg(kind, organizations), '{}'::jsonb)
        from (select kind, count(distinct organization_id) as organizations from period_events group by kind) counted)
    ) end,
    -- Names, roles and last access only; a provider's last access is account-wide.
    'team', case when target_organization_id is not null then (
      select coalesce(jsonb_agg(jsonb_build_object(
          'name', coalesce(profile.display_name, 'Sin nombre'),
          'roles', member.roles,
          'status', member.status,
          'lastSignInAt', account.last_sign_in_at
        ) order by account.last_sign_in_at desc nulls last), '[]'::jsonb)
      from (
        select user_id, array_agg(distinct role order by role) as roles,
          case when bool_or(status = 'active') then 'active' else 'invited' end as status
        from public.organization_memberships
        where organization_id = target_organization_id and status in ('active', 'invited')
        group by user_id
      ) member
      left join public.profiles profile on profile.user_id = member.user_id
      left join auth.users account on account.id = member.user_id
    ) end
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_organization_activity(bigint, integer) from public, anon;
grant execute on function public.get_organization_activity(bigint, integer) to authenticated;

-- The organization list also shows the last 30 days; last activity now uses the same
-- event stream as the activity card.
create or replace function public.get_platform_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  last_30_days timestamptz := private.activity_period_start(30);
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'Solo el administrador de plataforma puede consultar uso.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'organizationId', organization.id,
    'customers', (select count(*) from public.customers customer where customer.organization_id = organization.id),
    'orders', (select count(*) from public.orders sale_order where sale_order.organization_id = organization.id),
    'members', (select count(*) from public.organization_memberships membership where membership.organization_id = organization.id and membership.status = 'active'),
    'openProductionJobs', (select count(*) from public.production_jobs job where job.organization_id = organization.id and job.is_current and job.status not in ('received', 'reviewed')),
    'notificationAttempts', (select count(*) from public.notification_attempts attempt where attempt.organization_id = organization.id),
    'orders30', (select count(*) from public.orders sale_order where sale_order.organization_id = organization.id and sale_order.created_at >= last_30_days),
    'activeDays30', (select count(distinct (event.occurred_at at time zone 'America/Havana')::date)
      from private.organization_activity_events(organization.id) event
      where event.kind <> 'whatsapp' and event.occurred_at >= last_30_days),
    'lastActivityAt', (select max(event.occurred_at) from private.organization_activity_events(organization.id) event where event.kind <> 'whatsapp')
  ) order by organization.created_at desc), '[]'::jsonb)
  into result from public.organizations organization;
  return result;
end;
$$;
