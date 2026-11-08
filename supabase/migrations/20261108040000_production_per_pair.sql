-- LEN0006 phase 5: production per pair.
-- * One current job per (pair, job type) instead of per (order, job type).
-- * private.assign_production_job gains target_order_line_id; the 3-argument version
--   (still used by the deployed app) assigns line 1 and refuses multi-pair orders.
-- * public.assign_production_jobs assigns one job type to several pairs atomically
--   ("Asignar a todos los pares").
-- * Work snapshot: the pair's concepts and prescription plus lineNumber/lineCount, never
--   the patient's identity. Panel, job list and timeline expose the pair.

drop index if exists public.production_jobs_one_current_type_idx;
create unique index production_jobs_one_current_line_type_idx
  on public.production_jobs (order_line_id, job_type) where is_current;

create or replace function private.assign_production_job(target_order_id bigint, target_job_type text, target_provider_id uuid, target_order_line_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sale_order public.orders%rowtype;
  provider_role text;
  actor_role text;
  created_job_id bigint;
  snapshot jsonb;
  sale_line public.order_lines%rowtype;
  line_count integer;
begin
  if target_job_type not in ('lens', 'mounting') then
    raise exception using errcode = '22023', message = 'Tipo de trabajo no válido.';
  end if;
  select * into sale_order from public.orders where id = target_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Pedido no encontrado.'; end if;
  actor_role := private.production_actor_role(sale_order.organization_id);
  if actor_role not in ('owner', 'seller')
    or (actor_role = 'seller' and sale_order.primary_seller_id <> (select auth.uid()))
    or not private.can_operate_in_organization(sale_order.organization_id, 'production') then
    raise exception using errcode = '42501', message = 'No puedes asignar producción para este pedido.';
  end if;
  provider_role := case when target_job_type = 'lens' then 'lens_provider' else 'mounting_provider' end;
  -- An active owner/seller of the organization is a valid in-house workshop.
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = sale_order.organization_id
      and membership.user_id = target_provider_id
      and membership.role in (provider_role, 'owner', 'seller') and membership.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'El responsable no está activo en la organización con un rol válido para este trabajo.';
  end if;
  -- LEN0006: every job belongs to one pair. Without a pair only single-pair orders work.
  select count(*) into line_count from public.order_lines where order_id = sale_order.id;
  if target_order_line_id is null then
    if line_count > 1 then
      raise exception using errcode = '23502', message = 'Indica el par del trabajo.';
    end if;
    select * into sale_line from public.order_lines where order_id = sale_order.id order by line_number limit 1;
  else
    select * into sale_line from public.order_lines where id = target_order_line_id and order_id = sale_order.id;
  end if;
  if sale_line.id is null then raise exception using errcode = 'P0002', message = 'Par no encontrado en este pedido.'; end if;
  if exists (select 1 from public.production_jobs where order_line_id = sale_line.id and job_type = target_job_type and is_current) then
    raise exception using errcode = '23505', message = case when line_count > 1
      then 'El par ' || sale_line.line_number || ' ya tiene un trabajo activo de ese tipo.'
      else 'El pedido ya tiene un trabajo activo de ese tipo.' end;
  end if;

  select jsonb_build_object(
    'orderNumber', sale_order.order_number,
    'jobType', target_job_type,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'category', item.category, 'name', item.name, 'position', item.position
    ) order by item.position) from public.order_items item where item.order_line_id = sale_line.id), '[]'::jsonb),
    'prescription', (select to_jsonb(revision) - array['created_by', 'change_reason', 'notes']
      from public.prescription_revisions revision where revision.id = sale_line.prescription_revision_id),
    -- Providers see "Par 2 de 3", never who wears it.
    'lineNumber', sale_line.line_number,
    'lineCount', line_count
  ) into snapshot;

  insert into public.production_jobs (
    order_id, order_line_id, organization_id, branch_id, job_type, provider_id, work_snapshot, assigned_by
  ) values (
    sale_order.id, sale_line.id, sale_order.organization_id, sale_order.branch_id, target_job_type,
    target_provider_id, snapshot, (select auth.uid())
  ) returning id into created_job_id;
  insert into public.production_job_events (
    job_id, organization_id, branch_id, from_status, to_status, actor_id, actor_role, notes
  ) values (
    created_job_id, sale_order.organization_id, sale_order.branch_id, null, 'pending',
    (select auth.uid()), actor_role, 'Trabajo asignado.'
  );
  return created_job_id;
end;
$function$
;

revoke all on function private.assign_production_job(bigint, text, uuid, bigint) from public, anon;
grant execute on function private.assign_production_job(bigint, text, uuid, bigint) to authenticated;

create or replace function private.assign_production_job(target_order_id bigint, target_job_type text, target_provider_id uuid)
returns bigint
language sql
security definer
set search_path to ''
as $function$
  select private.assign_production_job(target_order_id, target_job_type, target_provider_id, null::bigint);
$function$;

create or replace function public.assign_production_jobs(target_order_id bigint, job_type text, provider_id uuid, target_order_line_ids bigint[])
returns bigint[]
language plpgsql
set search_path to ''
as $function$
declare
  line_id bigint;
  created bigint[] := '{}';
begin
  if coalesce(cardinality(target_order_line_ids), 0) not between 1 and 10
    or cardinality(target_order_line_ids) <> (select count(distinct value) from unnest(target_order_line_ids) value) then
    raise exception using errcode = '22023', message = 'Indica entre 1 y 10 pares distintos.';
  end if;
  foreach line_id in array target_order_line_ids loop
    created := created || private.assign_production_job(target_order_id, job_type, provider_id, line_id);
  end loop;
  return created;
end;
$function$;

revoke all on function public.assign_production_jobs(bigint, text, uuid, bigint[]) from public, anon;
grant execute on function public.assign_production_jobs(bigint, text, uuid, bigint[]) to authenticated, service_role;

create or replace function public.get_order_production_panel(target_order_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with sale_order as (
    select id, organization_id from public.orders where id = target_order_id
  ), assignee_roles as (
    select membership.user_id,
      case when membership.role in ('owner', 'seller') then 'in_house' else membership.role end as role
    from public.organization_memberships membership
    join sale_order on sale_order.organization_id = membership.organization_id
    where membership.status = 'active'
      and (membership.role in ('lens_provider', 'mounting_provider')
        or (membership.role in ('owner', 'seller') and membership.user_id = (select auth.uid())))
  ), jobs as (
    select job.id, job.job_type, job.status, job.provider_id, job.order_line_id
    from public.production_jobs job
    join sale_order on sale_order.id = job.order_id
    where job.is_current
  )
  select case when not exists (select 1 from sale_order) then null else jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
      'id', jobs.id, 'orderLineId', jobs.order_line_id, 'jobType', jobs.job_type, 'status', jobs.status, 'providerId', jobs.provider_id,
      'providerName', coalesce(profile.display_name, 'Proveedor')) order by jobs.id)
      from jobs left join public.profiles profile on profile.user_id = jobs.provider_id), '[]'::jsonb),
    'pairs', coalesce((select jsonb_agg(jsonb_build_object(
      'id', line.id, 'lineNumber', line.line_number, 'patientName', coalesce(patient.full_name, 'Paciente')
    ) order by line.line_number)
      from public.order_lines line join sale_order on sale_order.id = line.order_id
      left join public.customers patient on patient.id = line.patient_customer_id), '[]'::jsonb),
    'assignees', coalesce((select jsonb_agg(jsonb_build_object(
      'id', grouped.user_id, 'name', coalesce(profile.display_name, 'Proveedor'), 'roles', grouped.roles))
      from (select user_id, jsonb_agg(distinct role) as roles from assignee_roles group by user_id) grouped
      left join public.profiles profile on profile.user_id = grouped.user_id), '[]'::jsonb)
  ) end;
$function$
;

create or replace function public.list_accessible_production_jobs()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', job.id, 'orderId', job.order_id, 'orderLineId', job.order_line_id, 'orderNumber', job.work_snapshot ->> 'orderNumber',
    'jobType', job.job_type, 'providerId', job.provider_id,
    'providerName', provider.display_name, 'status', job.status, 'isCurrent', job.is_current,
    'snapshot', job.work_snapshot, 'originalJobId', job.original_job_id,
    'assignedAt', job.assigned_at, 'dispatchedAt', job.dispatched_at,
    'completedAt', job.completed_at, 'receivedAt', job.received_at,
    'incidents', coalesce((select jsonb_agg(jsonb_build_object(
      'id', incident.id, 'description', incident.description,
      'costResponsibility', incident.cost_responsibility, 'openedAt', incident.opened_at,
      'reworkJobId', incident.rework_job_id
    ) order by incident.opened_at) from public.production_incidents incident where incident.job_id = job.id), '[]'::jsonb)
  ) order by job.assigned_at desc), '[]'::jsonb)
  from public.production_jobs job
  join public.profiles provider on provider.user_id = job.provider_id;
$function$
;

create or replace function public.get_order_timeline(target_order_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  sale_order public.orders%rowtype;
  result jsonb;
  multi_pair boolean;
begin
  select * into sale_order from public.orders where id = target_order_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pedido no encontrado o no accesible.';
  end if;

  multi_pair := (select count(*) from public.order_lines line where line.order_id = sale_order.id) > 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', event_key,
    'kind', kind,
    'title', title,
    'detail', detail,
    'actorId', actor_id,
    'actorName', coalesce(profile.display_name, 'Sistema'),
    'occurredAt', occurred_at,
    'metadata', metadata
  ) order by occurred_at, event_key), '[]'::jsonb)
  into result
  from (
    select 'order:' || sale_order.id as event_key, 'order_created' as kind,
      'Pedido confirmado' as title, sale_order.order_number as detail,
      sale_order.primary_seller_id as actor_id, sale_order.accepted_at as occurred_at,
      jsonb_build_object('status', sale_order.commercial_status) as metadata
    union all
    select 'confirmation:' || confirmation.id, 'confirmation', 'Aceptación del cliente',
      'Confirmación ' || confirmation.confirmation_method, confirmation.confirmed_by,
      confirmation.confirmed_at, jsonb_build_object('cupEquivalent', confirmation.cup_equivalent)
    from public.order_confirmations confirmation where confirmation.order_id = sale_order.id
    union all
    select 'payment:' || payment.id, 'payment', 'Pago registrado',
      payment.amount || ' ' || payment.currency, payment.received_by, payment.received_at,
      jsonb_build_object('equivalentCup', payment.equivalent_cup, 'postClose', payment.is_post_close)
    from public.payments payment where payment.order_id = sale_order.id
    union all
    select 'production:' || production_event.id, 'production',
      case production_event.to_status
        when 'pending' then case job.job_type when 'lens' then 'Asignado al cristalero' else 'Asignado al montador' end
        when 'ready_to_send' then case job.job_type when 'lens' then 'Cristales listos para entregar al cristalero' else 'Trabajo listo para entregar al montador' end
        when 'dispatched' then case job.job_type when 'lens' then 'Entregado al cristalero' else 'Entregado al montador' end
        when 'in_production' then 'Fabricación iniciada · Cristalero'
        when 'in_mounting' then 'Montaje iniciado · Montador'
        when 'completed' then case job.job_type when 'lens' then 'Cristales listos · Cristalero' else 'Montaje listo · Montador' end
        when 'received' then 'Recibido por la óptica'
        when 'reviewed' then 'Revisado por la óptica'
        when 'incident' then 'Incidencia reportada'
        else 'Estado de producción actualizado'
      end,
      case when multi_pair then 'Par ' || line.line_number || ' · ' else '' end
        || coalesce(production_event.notes, case job.job_type when 'lens' then 'Cristales' else 'Montaje' end),
      production_event.actor_id, production_event.occurred_at,
      jsonb_build_object('jobId', job.id, 'jobType', job.job_type, 'fromStatus', production_event.from_status, 'toStatus', production_event.to_status)
    from public.production_job_events production_event
    join public.production_jobs job on job.id = production_event.job_id
    join public.order_lines line on line.id = job.order_line_id
    where job.order_id = sale_order.id
      and production_event.to_status <> 'incident'
    union all
    select 'incident:' || incident.id, 'incident', 'Incidencia de producción',
      case when multi_pair then 'Par ' || line.line_number || ' · ' else '' end || incident.description || ' · Costo: ' || case incident.cost_responsibility
        when 'organization' then 'Óptica'
        when 'lens_provider' then 'Cristalero'
        when 'mounting_provider' then 'Montador'
        when 'customer' then 'Cliente'
        else incident.cost_responsibility
      end,
      incident.opened_by, incident.opened_at,
      jsonb_build_object('responsibility', incident.cost_responsibility, 'reworkJobId', incident.rework_job_id)
    from public.production_incidents incident
    join public.production_jobs job on job.id = incident.job_id
    join public.order_lines line on line.id = job.order_line_id
    where job.order_id = sale_order.id
    union all
    select 'notification:' || attempt.id, 'notification',
      case attempt.outcome
        when 'opened' then 'WhatsApp preparado'
        when 'sent' then 'WhatsApp enviado'
        when 'failed' then case attempt.failure_code
          when 'provider_unconfirmed' then 'WhatsApp enviado sin confirmación del proveedor'
          when 'missing_consent' then 'WhatsApp no enviado: el cliente no autorizó mensajes'
          when 'module_unavailable' then 'WhatsApp no enviado: el módulo no está activo'
          else 'Intento de WhatsApp fallido'
        end
        else 'Intento de WhatsApp fallido'
      end,
      template.name, attempt.attempted_by, attempt.attempted_at,
      jsonb_build_object(
        'outcome', attempt.outcome,
        'provider', attempt.provider_key,
        'providerMessageId', attempt.provider_message_id,
        'failureCode', attempt.failure_code
      )
    from public.notification_attempts attempt
    join public.notification_templates template on template.key = attempt.template_key
    where attempt.order_id = sale_order.id
    union all
    select 'delivery:' || sale_order.id, 'delivery', 'Pedido entregado', sale_order.order_number,
      sale_order.delivered_by, sale_order.delivered_at, '{}'::jsonb
    where sale_order.delivered_at is not null
  ) timeline
  left join public.profiles profile on profile.user_id = timeline.actor_id;

  return result;
end;
$function$
;
