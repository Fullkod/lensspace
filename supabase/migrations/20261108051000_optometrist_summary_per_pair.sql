-- LEN0006 phase 6: the optometrist summary counts orders through each pair's prescription
-- (order_lines.prescription_revision_id) instead of the order-level revision.

create or replace function public.get_optometrist_summary(target_organization_id bigint, target_branch_id bigint DEFAULT NULL::bigint, date_from date DEFAULT (CURRENT_DATE - 29), date_to date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  business_zone text;
begin
  if not private.has_organization_role(target_organization_id, array['owner']) then
    raise exception using errcode = '42501', message = 'Solo el propietario puede consultar analítica.';
  end if;
  if not exists (
    select 1 from public.organization_modules entitlement
    where entitlement.organization_id = target_organization_id
      and entitlement.module_key = 'analytics'
      and entitlement.is_enabled
  ) then
    raise exception using errcode = '42501', message = 'El módulo Analítica no está habilitado.';
  end if;
  if date_from > date_to then
    raise exception using errcode = '22023', message = 'La fecha inicial no puede ser posterior a la final.';
  end if;

  select timezone into business_zone from public.organizations where id = target_organization_id;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'optometristId', optometrist.id,
      'name', optometrist.full_name,
      'prescriptions', prescribed.prescriptions,
      'customers', prescribed.customers,
      'orders', ordered.orders
    ) order by prescribed.prescriptions desc, ordered.orders desc, optometrist.full_name), '[]'::jsonb)
    from public.optometrists optometrist
    cross join lateral (
      select
        count(distinct revision.prescription_id)::integer as prescriptions,
        count(distinct prescription.customer_id)::integer as customers
      from public.prescription_revisions revision
      join public.prescriptions prescription on prescription.id = revision.prescription_id
      where revision.optometrist_id = optometrist.id
        and revision.revision_number = 1
        and prescription.archived_at is null
        and revision.prescription_date between date_from and date_to
        and (target_branch_id is null or revision.branch_id = target_branch_id)
    ) prescribed
    cross join lateral (
      -- LEN0006: an order counts once for each optometrist behind any of its pairs.
      select count(distinct sale_order.id)::integer as orders
      from public.orders sale_order
      join public.order_lines line on line.order_id = sale_order.id
      join public.prescription_revisions revision on revision.id = line.prescription_revision_id
      where revision.optometrist_id = optometrist.id
        and (sale_order.created_at at time zone business_zone)::date between date_from and date_to
        and (target_branch_id is null or sale_order.branch_id = target_branch_id)
    ) ordered
    where optometrist.organization_id = target_organization_id
  );
end;
$function$
;
