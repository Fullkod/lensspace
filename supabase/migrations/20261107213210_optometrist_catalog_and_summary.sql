-- LEN0008: optometrists as an organization catalog, linked from each prescription revision,
-- plus an owner summary per optometrist. The prescription form keeps a free-text field:
-- create_prescription_revision finds the optometrist by normalized name (case, accents,
-- extra spaces and a leading Dr./Dra./Lic. ignored) or adds it, so a new optometrist is
-- registered from the same form. prescriber_name keeps the catalog spelling as a snapshot.

create function private.normalize_person_name(value text)
returns text
language sql
immutable
parallel safe
set search_path to ''
as $$
  select lower(btrim(regexp_replace(
    regexp_replace(
      translate(btrim(value), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'),
      '^(dra|dr|lic|lcda|lcdo)(\.|\s)\s*', '', 'i'
    ),
    '\s+', ' ', 'g'
  )));
$$;

grant execute on function private.normalize_person_name(text) to authenticated;

create table public.optometrists (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 160),
  normalized_name text generated always as (private.normalize_person_name(full_name)) stored,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint optometrists_normalized_name_check check (char_length(normalized_name) >= 2),
  constraint optometrists_organization_name_key unique (organization_id, normalized_name)
);

alter table public.optometrists enable row level security;

-- The catalog is shared by the organization: owners and sellers read it and add to it.
create policy optometrists_select_commercial on public.optometrists
for select to authenticated
using ((select private.has_organization_role(organization_id, array['owner', 'seller'])));

create policy optometrists_insert_commercial on public.optometrists
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.has_organization_role(organization_id, array['owner', 'seller']))
);

revoke all on public.optometrists from anon;
grant select, insert on public.optometrists to authenticated;

alter table public.prescription_revisions
  add column optometrist_id bigint references public.optometrists(id) on delete set null;

create index prescription_revisions_optometrist_idx
  on public.prescription_revisions (optometrist_id, prescription_date);

-- Backfill: one optometrist per organization and normalized name (earliest spelling wins).
insert into public.optometrists (organization_id, full_name, created_by, created_at)
select distinct on (revision.organization_id, private.normalize_person_name(revision.prescriber_name))
  revision.organization_id, btrim(revision.prescriber_name), revision.created_by, revision.created_at
from public.prescription_revisions revision
join public.prescriptions prescription on prescription.id = revision.prescription_id and prescription.archived_at is null
where char_length(private.normalize_person_name(coalesce(revision.prescriber_name, ''))) >= 2
order by revision.organization_id, private.normalize_person_name(revision.prescriber_name), revision.created_at;

update public.prescription_revisions revision
set optometrist_id = optometrist.id
from public.optometrists optometrist
where optometrist.organization_id = revision.organization_id
  and optometrist.normalized_name = private.normalize_person_name(revision.prescriber_name);

create or replace function public.create_prescription_revision(target_organization_id bigint, target_branch_id bigint, target_customer_id bigint, target_prescription_id bigint, revision_prescription_date date, revision_prescriber_name text, revision_right_sphere numeric, revision_right_cylinder numeric, revision_right_axis smallint, revision_right_addition numeric, revision_right_prism numeric, revision_right_prism_base text, revision_left_sphere numeric, revision_left_cylinder numeric, revision_left_axis smallint, revision_left_addition numeric, revision_left_prism numeric, revision_left_prism_base text, revision_pupillary_distance_total numeric, revision_right_pupillary_distance numeric, revision_left_pupillary_distance numeric, revision_right_height numeric, revision_left_height numeric, revision_notes text, revision_change_reason text)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  actor_user_id uuid := (select auth.uid());
  prescription_row public.prescriptions%rowtype;
  new_revision_id bigint;
  next_revision_number integer;
  prescriber text := nullif(btrim(revision_prescriber_name), '');
  optometrist_row public.optometrists%rowtype;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'Debes iniciar sesión.';
  end if;

  if target_prescription_id is null then
    insert into public.prescriptions (
      organization_id,
      branch_id,
      customer_id,
      created_by
    )
    values (
      target_organization_id,
      target_branch_id,
      target_customer_id,
      actor_user_id
    )
    returning * into prescription_row;
  else
    select * into prescription_row
    from public.prescriptions
    where id = target_prescription_id
      and organization_id = target_organization_id
      and branch_id = target_branch_id
      and customer_id = target_customer_id
      and archived_at is null
    for update;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'La receta no existe o no pertenece al cliente y sucursal indicados.';
    end if;
  end if;

  -- Serializes revision numbering for this prescription.
  perform 1
  from public.prescriptions
  where id = prescription_row.id
  for update;

  select coalesce(max(revision_number), 0) + 1
    into next_revision_number
  from public.prescription_revisions
  where prescription_id = prescription_row.id;

  if next_revision_number > 1
    and nullif(btrim(revision_change_reason), '') is null
  then
    raise exception using
      errcode = '22023',
      message = 'Indica el motivo de la corrección.';
  end if;

  -- LEN0008: link the optometrist from the catalog, adding it when it is new.
  if char_length(private.normalize_person_name(coalesce(prescriber, ''))) >= 2 then
    insert into public.optometrists (organization_id, full_name, created_by)
    values (target_organization_id, prescriber, actor_user_id)
    on conflict (organization_id, normalized_name) do nothing;

    select * into optometrist_row
    from public.optometrists
    where organization_id = target_organization_id
      and normalized_name = private.normalize_person_name(prescriber);
  end if;

  insert into public.prescription_revisions (
    organization_id,
    branch_id,
    prescription_id,
    revision_number,
    prescription_date,
    prescriber_name,
    optometrist_id,
    right_sphere,
    right_cylinder,
    right_axis,
    right_addition,
    right_prism,
    right_prism_base,
    left_sphere,
    left_cylinder,
    left_axis,
    left_addition,
    left_prism,
    left_prism_base,
    pupillary_distance_total,
    right_pupillary_distance,
    left_pupillary_distance,
    right_height,
    left_height,
    notes,
    change_reason,
    created_by
  )
  values (
    target_organization_id,
    target_branch_id,
    prescription_row.id,
    next_revision_number,
    revision_prescription_date,
    coalesce(optometrist_row.full_name, prescriber),
    optometrist_row.id,
    revision_right_sphere,
    revision_right_cylinder,
    revision_right_axis,
    revision_right_addition,
    revision_right_prism,
    nullif(btrim(revision_right_prism_base), ''),
    revision_left_sphere,
    revision_left_cylinder,
    revision_left_axis,
    revision_left_addition,
    revision_left_prism,
    nullif(btrim(revision_left_prism_base), ''),
    revision_pupillary_distance_total,
    revision_right_pupillary_distance,
    revision_left_pupillary_distance,
    revision_right_height,
    revision_left_height,
    nullif(btrim(revision_notes), ''),
    nullif(btrim(revision_change_reason), ''),
    actor_user_id
  )
  returning id into new_revision_id;

  return jsonb_build_object(
    'prescriptionId', prescription_row.id,
    'revisionId', new_revision_id,
    'revisionNumber', next_revision_number
  );
end;
$function$;

-- Owner summary per optometrist. A prescription counts once, for the optometrist of its
-- first revision, on its prescription date; corrections do not add prescriptions. Orders
-- count for the optometrist of the revision they were made from, on their creation day.
-- Every optometrist of the organization is listed, with zeros when idle.
create function public.get_optometrist_summary(
  target_organization_id bigint,
  target_branch_id bigint default null,
  date_from date default (current_date - 29),
  date_to date default current_date
)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
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
        and revision.prescription_date between date_from and date_to
        and (target_branch_id is null or revision.branch_id = target_branch_id)
    ) prescribed
    cross join lateral (
      select count(*)::integer as orders
      from public.orders sale_order
      join public.prescription_revisions revision on revision.id = sale_order.prescription_revision_id
      where revision.optometrist_id = optometrist.id
        and (sale_order.created_at at time zone business_zone)::date between date_from and date_to
        and (target_branch_id is null or sale_order.branch_id = target_branch_id)
    ) ordered
    where optometrist.organization_id = target_organization_id
  );
end;
$function$;

revoke all on function public.get_optometrist_summary(bigint, bigint, date, date) from public, anon;
grant execute on function public.get_optometrist_summary(bigint, bigint, date, date) to authenticated;
