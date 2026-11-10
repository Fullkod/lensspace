-- A retail optician can have its own users. role = 'account_user' is deliberately outside
-- owner/seller: no existing policy or helper grants it anything. Its only entry points are
-- the three RPCs at the end, which never go through private.lock_commercial_order, so the
-- user cannot reach delivery, collection, close or line removal.

alter table public.organization_memberships
  add column commercial_account_id bigint,
  add constraint organization_memberships_commercial_account_fkey
    foreign key (commercial_account_id, organization_id) references public.commercial_accounts(id, organization_id);

create index organization_memberships_commercial_account_idx
  on public.organization_memberships (commercial_account_id)
  where commercial_account_id is not null;

alter table public.organization_memberships drop constraint organization_memberships_role_check;
alter table public.organization_memberships add constraint organization_memberships_role_check
  check (role = any (array['owner', 'seller', 'lens_provider', 'mounting_provider', 'account_user']));

alter table public.organization_memberships drop constraint organization_memberships_branch_role_check;
alter table public.organization_memberships add constraint organization_memberships_branch_role_check
  check ((role in ('seller', 'account_user') and branch_id is not null) or (role not in ('seller', 'account_user') and branch_id is null));

alter table public.organization_memberships add constraint organization_memberships_account_user_check
  check ((role = 'account_user') = (commercial_account_id is not null));

-- A. Invitation and team management --------------------------------------------------------

drop function public.add_organization_member(uuid, uuid, bigint, bigint, text, text);

create function public.add_organization_member(
  actor_user_id uuid,
  target_user_id uuid,
  target_organization_id bigint,
  target_branch_id bigint,
  target_role text,
  target_status text,
  target_account_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_id bigint;
begin
  if not (
    exists (
      select 1 from private.platform_admins pa where pa.user_id = actor_user_id
    )
    or exists (
      select 1
      from public.organization_memberships membership
      join public.profiles profile
        on profile.user_id = membership.user_id
        and profile.is_active
      where membership.organization_id = target_organization_id
        and membership.user_id = actor_user_id
        and membership.role = 'owner'
        and membership.status = 'active'
    )
  ) then
    raise exception 'Only the organization owner can manage its team.'
      using errcode = 'insufficient_privilege';
  end if;

  if target_role not in ('seller', 'lens_provider', 'mounting_provider', 'account_user') then
    raise exception 'Invalid managed member role.'
      using errcode = 'check_violation';
  end if;

  if target_status not in ('invited', 'active') then
    raise exception 'Invalid initial membership status.'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.profiles profile
    where profile.user_id = target_user_id
      and profile.is_active
  ) then
    raise exception 'The invited user profile does not exist or is inactive.'
      using errcode = 'foreign_key_violation';
  end if;

  if target_role in ('seller', 'account_user') then
    if target_branch_id is null or not exists (
      select 1
      from public.branches branch
      where branch.id = target_branch_id
        and branch.organization_id = target_organization_id
        and branch.is_active
    ) then
      raise exception 'A seller requires an active branch in the organization.'
        using errcode = 'check_violation';
    end if;
  elsif target_branch_id is not null then
    raise exception 'External providers are assigned to the organization, not a branch.'
      using errcode = 'check_violation';
  end if;

  if target_role = 'account_user' and (target_account_id is null or not exists (
    select 1 from public.commercial_accounts account
    where account.id = target_account_id
      and account.organization_id = target_organization_id
      and account.archived_at is null
  )) then
    raise exception 'An optician user requires an active optician of the organization.'
      using errcode = 'check_violation';
  end if;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    branch_id,
    role,
    status,
    commercial_account_id
  )
  values (
    target_organization_id,
    target_user_id,
    target_branch_id,
    target_role,
    target_status,
    case when target_role = 'account_user' then target_account_id end
  )
  on conflict (organization_id, user_id, role)
  do update set
    branch_id = excluded.branch_id,
    status = excluded.status,
    commercial_account_id = excluded.commercial_account_id
  returning id into membership_id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    origin,
    payload
  )
  values (
    target_organization_id,
    actor_user_id,
    'membership.invited',
    'organization_membership',
    membership_id::text,
    'application',
    jsonb_build_object(
      'user_id', target_user_id,
      'role', target_role,
      'branch_id', target_branch_id,
      'status', target_status,
      'commercial_account_id', target_account_id
    )
  );

  return membership_id;
end;
$$;

revoke all on function public.add_organization_member(uuid, uuid, bigint, bigint, text, text, bigint) from public, anon, authenticated;
grant execute on function public.add_organization_member(uuid, uuid, bigint, bigint, text, text, bigint) to service_role;

do $migration$
declare
  definition text := pg_get_functiondef('public.manage_organization_member(bigint,text,bigint)'::regprocedure);
  role_list text := $a$    'mounting_provider'$a$;
  branch_rule text := $a$if current_membership.role = 'seller' then$a$;
begin
  if position(role_list in definition) = 0 or position(branch_rule in definition) = 0 then
    raise exception 'manage_organization_member changed: anchor not found';
  end if;
  execute replace(replace(definition, role_list, role_list || $a$, 'account_user'$a$),
    branch_rule, $a$if current_membership.role in ('seller', 'account_user') then$a$);
end;
$migration$;

-- B. Pricing: reachable by the optician's user only from inside its own RPC --------------

do $migration$
declare
  catalog_definition text := pg_get_functiondef('public.calculate_catalog_price(bigint,bigint[],bigint,numeric)'::regprocedure);
  catalog_anchor text := '    or private.is_platform_admin()';
  account_definition text := pg_get_functiondef('private.apply_account_prices(jsonb,bigint,bigint,numeric)'::regprocedure);
  account_anchor text := ' or private.is_platform_admin()) then';
begin
  if position(catalog_anchor in catalog_definition) = 0 or position(account_anchor in account_definition) = 0 then
    raise exception 'pricing functions changed: anchor not found';
  end if;
  execute replace(catalog_definition, catalog_anchor, catalog_anchor || ' or private.in_commercial_rpc()');
  execute replace(account_definition, account_anchor, ' or private.is_platform_admin() or private.in_commercial_rpc()) then');
end;
$migration$;

-- C. Shared insert of a job ---------------------------------------------------------------

create function private.insert_commercial_line(sale_order public.orders, target_line jsonb, request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.order_lines%rowtype;
  patient_id bigint;
  revision_id bigint;
  item_ids bigint[];
  adjustments jsonb;
  pricing jsonb;
  next_number integer;
  next_position integer;
  new_line_id bigint;
  item jsonb;
begin
  if request_id is not null then
    select * into existing from public.order_lines where order_id = sale_order.id and client_request_id = request_id;
    if found then
      return jsonb_build_object('lineId', existing.id, 'lineNumber', existing.line_number);
    end if;
  end if;
  if sale_order.commercial_status <> 'open' then
    raise exception using errcode = '55000', message = 'El pedido está cerrado. Pide al dueño que lo reabra para agregar trabajos.';
  end if;

  begin
    patient_id := (target_line->>'patientCustomerId')::bigint;
    revision_id := nullif(target_line->>'prescriptionRevisionId', '')::bigint;
    select coalesce(array_agg(value::bigint), '{}') into item_ids from jsonb_array_elements_text(coalesce(target_line->'itemIds', '[]'::jsonb));
    adjustments := coalesce(target_line->'lineAdjustments', '{}'::jsonb);
  exception when others then
    raise exception using errcode = '22023', message = 'El trabajo no tiene un formato válido.';
  end;

  if patient_id is null or not exists (
    select 1 from public.customers
    where id = patient_id and organization_id = sale_order.organization_id and branch_id = sale_order.branch_id
      and commercial_account_id = sale_order.commercial_account_id and archived_at is null
  ) then
    raise exception using errcode = 'P0002', message = 'Elige un paciente de esta óptica.';
  end if;
  if revision_id is not null and not exists (
    select 1 from public.prescription_revisions revision
    join public.prescriptions prescription on prescription.id = revision.prescription_id
    where revision.id = revision_id and prescription.customer_id = patient_id and prescription.organization_id = sale_order.organization_id
  ) then
    raise exception using errcode = '22023', message = 'La receta no es de ese paciente.';
  end if;
  if coalesce(cardinality(item_ids), 0) = 0 then
    raise exception using errcode = '22023', message = 'Elige al menos un concepto.';
  end if;

  pricing := public.calculate_sale_price(sale_order.organization_id, item_ids, revision_id, sale_order.usd_to_cup_rate, adjustments, sale_order.commercial_account_id);

  select coalesce(max(line_number), 0) + 1 into next_number from public.order_lines where order_id = sale_order.id;
  if next_number > 200 then
    raise exception using errcode = '22023', message = 'Un pedido comercial lleva como máximo 200 trabajos.';
  end if;
  select coalesce(max(position), 0) into next_position from public.order_items where order_id = sale_order.id;

  insert into public.order_lines (
    order_id, organization_id, branch_id, line_number, patient_customer_id, prescription_revision_id,
    totals, cup_equivalent, added_by, added_at, client_request_id
  ) values (
    sale_order.id, sale_order.organization_id, sale_order.branch_id, next_number, patient_id, revision_id,
    pricing->'totals', (pricing->>'cupEquivalent')::numeric, (select auth.uid()), now(), request_id
  ) returning id into new_line_id;

  for item in select value from jsonb_array_elements(pricing->'lineItems') loop
    next_position := next_position + 1;
    insert into public.order_items (
      order_id, organization_id, branch_id, order_line_id, catalog_item_id, line_kind, source_code, category,
      name, base_amount, amount, currency, position, price_adjustment_reason, price_adjusted_by, discount_authorized_by
    ) values (
      sale_order.id, sale_order.organization_id, sale_order.branch_id, new_line_id, (item->>'itemId')::bigint, item->>'kind',
      coalesce(item->>'code', item->>'ruleCode'), item->>'category', item->>'name',
      (item->>'baseAmount')::numeric, (item->>'amount')::numeric, item->>'currency', next_position,
      item->>'adjustmentReason', (item->>'adjustedBy')::uuid, (item->>'discountAuthorizedBy')::uuid
    );
  end loop;

  perform private.refresh_commercial_order_totals(sale_order.id);
  return jsonb_build_object('lineId', new_line_id, 'lineNumber', next_number, 'pricing', pricing);
end;
$$;

revoke all on function private.insert_commercial_line(public.orders, jsonb, uuid) from public, anon, authenticated;

create or replace function public.add_commercial_order_line(target_order_id bigint, target_line jsonb, request_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.insert_commercial_line(private.lock_commercial_order(target_order_id, false), target_line, request_id);
end;
$$;

-- D. The optician user's own entry points -------------------------------------------------

create function private.my_account_membership(target_membership_id bigint)
returns public.organization_memberships
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  membership public.organization_memberships%rowtype;
begin
  select m.* into membership
  from public.organization_memberships m
  join public.profiles profile on profile.user_id = m.user_id and profile.is_active
  where m.id = target_membership_id
    and m.user_id = (select auth.uid())
    and m.role = 'account_user'
    and m.status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'Tu cuenta no puede agregar trabajos para esta óptica.';
  end if;
  if not private.can_operate_in_organization(membership.organization_id, 'optical_sales')
    or not private.is_operational_branch(membership.organization_id, membership.branch_id)
    or not exists (select 1 from public.commercial_accounts where id = membership.commercial_account_id and archived_at is null) then
    raise exception using errcode = '42501', message = 'Ahora mismo no se pueden agregar trabajos.';
  end if;
  return membership;
end;
$$;

revoke all on function private.my_account_membership(bigint) from public, anon, authenticated;

create function public.get_my_account_portal()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'membershipId', membership.id,
    'organizationName', organization.name,
    'branchName', branch.name,
    'accountName', account.name,
    'canWork', private.can_operate_in_organization(membership.organization_id, 'optical_sales')
      and private.is_operational_branch(membership.organization_id, membership.branch_id)
      and account.archived_at is null,
    'prices', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', (price->>'id')::bigint,
        'organizationId', membership.organization_id,
        'category', price->>'category',
        'name', price->>'name',
        'price', (price->>'price')::numeric,
        'currency', price->>'currency'
      )), '[]'::jsonb)
      from jsonb_array_elements(private.account_price_list(membership.organization_id, account.id)) price
    ),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sale_order.id,
        'orderNumber', sale_order.order_number,
        'status', sale_order.commercial_status,
        'paymentStatus', sale_order.payment_status,
        'totals', sale_order.totals,
        'cupEquivalent', sale_order.cup_equivalent,
        'rate', sale_order.usd_to_cup_rate,
        'paidCup', coalesce((select sum(payment.equivalent_cup) from public.payments payment where payment.order_id = sale_order.id), 0),
        'createdAt', sale_order.created_at,
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', line.id,
            'lineNumber', line.line_number,
            'totals', line.totals,
            'addedAt', coalesce(line.added_at, line.created_at),
            'deliveredAt', line.delivered_at,
            'hasPrescription', line.prescription_revision_id is not null,
            'hasProduction', exists (select 1 from public.production_jobs job where job.order_line_id = line.id),
            'items', coalesce((select jsonb_agg(jsonb_build_object('name', item.name, 'amount', item.amount, 'currency', item.currency) order by item.position)
              from public.order_items item where item.order_line_id = line.id), '[]'::jsonb)
          ) order by line.line_number)
          from public.order_lines line
          where line.order_id = sale_order.id and line.removed_at is null
        ), '[]'::jsonb)
      ) order by sale_order.created_at desc)
      from public.orders sale_order
      where sale_order.order_kind = 'commercial' and sale_order.commercial_account_id = account.id
    ), '[]'::jsonb)
  ) order by account.name), '[]'::jsonb)
  from public.organization_memberships membership
  join public.profiles profile on profile.user_id = membership.user_id and profile.is_active
  join public.commercial_accounts account on account.id = membership.commercial_account_id
  join public.organizations organization on organization.id = membership.organization_id
  join public.branches branch on branch.id = membership.branch_id
  where membership.user_id = (select auth.uid())
    and membership.role = 'account_user'
    and membership.status = 'active';
$$;

revoke all on function public.get_my_account_portal() from public, anon;
grant execute on function public.get_my_account_portal() to authenticated;

create function public.add_my_account_job(target_membership_id bigint, target_line jsonb, request_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership public.organization_memberships%rowtype := private.my_account_membership(target_membership_id);
  sale_order public.orders%rowtype;
  existing public.order_lines%rowtype;
  order_rate numeric;
begin
  if target_line is null or jsonb_typeof(target_line) <> 'object' then
    raise exception using errcode = '22023', message = 'El trabajo no tiene un formato válido.';
  end if;
  if coalesce(target_line->'lineAdjustments', '{}'::jsonb) <> '{}'::jsonb then
    raise exception using errcode = '42501', message = 'Los precios de la óptica no se pueden cambiar.';
  end if;

  -- One open order per optician and branch, even with two users adding at once.
  perform pg_advisory_xact_lock(hashtextextended('account-order:' || membership.commercial_account_id || ':' || membership.branch_id, 0));
  perform set_config('lensspace.commercial_rpc', 'on', true);

  if request_id is not null then
    select line.* into existing
    from public.order_lines line
    join public.orders sale on sale.id = line.order_id
    where line.client_request_id = request_id and sale.commercial_account_id = membership.commercial_account_id;
    if found then
      return jsonb_build_object('lineId', existing.id, 'lineNumber', existing.line_number);
    end if;
  end if;

  select * into sale_order
  from public.orders
  where order_kind = 'commercial'
    and commercial_account_id = membership.commercial_account_id
    and branch_id = membership.branch_id
    and commercial_status = 'open'
  order by id desc
  limit 1
  for update;

  if not found then
    select coalesce(organization.usd_to_cup_rate, (
      select recent.usd_to_cup_rate from public.orders recent
      where recent.organization_id = organization.id
      order by recent.created_at desc limit 1
    )) into order_rate
    from public.organizations organization
    where organization.id = membership.organization_id;
    if order_rate is null or order_rate <= 0 then
      raise exception using errcode = '55000', message = 'La óptica proveedora todavía no tiene una tasa USD/CUP. Avísale.';
    end if;

    insert into public.orders (
      order_number, organization_id, branch_id, primary_seller_id, order_kind, commercial_account_id,
      commercial_status, payment_status, usd_to_cup_rate, totals, cup_equivalent, accepted_at
    ) values (
      private.next_order_number(membership.organization_id), membership.organization_id, membership.branch_id, membership.user_id, 'commercial', membership.commercial_account_id,
      'open', 'unpaid', order_rate, '{}'::jsonb, 0, now()
    ) returning * into sale_order;
    perform private.audit_commercial_order(sale_order, 'commercial_order.opened', null, '{}'::jsonb);
  end if;

  return private.insert_commercial_line(
    sale_order,
    jsonb_build_object(
      'patientCustomerId', private.ensure_account_patient(membership.organization_id, membership.branch_id, membership.commercial_account_id),
      'prescriptionRevisionId', target_line->'prescriptionRevisionId',
      'itemIds', target_line->'itemIds'
    ),
    request_id
  );
end;
$$;

revoke all on function public.add_my_account_job(bigint, jsonb, uuid) from public, anon;
grant execute on function public.add_my_account_job(bigint, jsonb, uuid) to authenticated;

create function public.create_my_account_prescription(target_membership_id bigint, revision jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership public.organization_memberships%rowtype := private.my_account_membership(target_membership_id);
begin
  perform set_config('lensspace.commercial_rpc', 'on', true);
  return public.create_prescription_revision(
    membership.organization_id,
    membership.branch_id,
    private.ensure_account_patient(membership.organization_id, membership.branch_id, membership.commercial_account_id),
    null::bigint,
    (revision->>'revision_prescription_date')::date,
    revision->>'revision_prescriber_name',
    (revision->>'revision_right_sphere')::numeric,
    (revision->>'revision_right_cylinder')::numeric,
    (revision->>'revision_right_axis')::smallint,
    (revision->>'revision_right_addition')::numeric,
    (revision->>'revision_right_prism')::numeric,
    revision->>'revision_right_prism_base',
    (revision->>'revision_left_sphere')::numeric,
    (revision->>'revision_left_cylinder')::numeric,
    (revision->>'revision_left_axis')::smallint,
    (revision->>'revision_left_addition')::numeric,
    (revision->>'revision_left_prism')::numeric,
    revision->>'revision_left_prism_base',
    (revision->>'revision_pupillary_distance_total')::numeric,
    (revision->>'revision_right_pupillary_distance')::numeric,
    (revision->>'revision_left_pupillary_distance')::numeric,
    (revision->>'revision_right_height')::numeric,
    (revision->>'revision_left_height')::numeric,
    revision->>'revision_notes',
    ''
  );
end;
$$;

revoke all on function public.create_my_account_prescription(bigint, jsonb) from public, anon;
grant execute on function public.create_my_account_prescription(bigint, jsonb) to authenticated;
