-- LEN0008: the owner manages the optometrist catalog (add, rename, merge duplicates).
-- SECURITY DEFINER because merging repoints immutable prescription revisions (no update
-- policy); every function checks owner role and that the organization can operate.
-- prescriber_name stays as recorded on each revision (clinical snapshot); summaries use
-- the catalog name.

create function private.assert_can_manage_optometrists(target_organization_id bigint)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not private.has_organization_role(target_organization_id, array['owner']) then
    raise exception using errcode = '42501', message = 'Solo el propietario puede administrar optometristas.';
  end if;
  if not private.can_operate_in_organization(target_organization_id, 'optical_sales') then
    raise exception using errcode = '42501', message = 'La organización está en modo de solo lectura.';
  end if;
end;
$$;

create function private.assert_optometrist_name_free(target_organization_id bigint, candidate text, except_id bigint)
returns text
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  clean text := btrim(regexp_replace(coalesce(candidate, ''), '\s+', ' ', 'g'));
  existing text;
begin
  if char_length(clean) not between 2 and 160 or char_length(private.normalize_person_name(clean)) < 2 then
    raise exception using errcode = '22023', message = 'Escribe un nombre de 2 a 160 caracteres.';
  end if;
  select full_name into existing
  from public.optometrists
  where organization_id = target_organization_id
    and normalized_name = private.normalize_person_name(clean)
    and id is distinct from except_id;
  if found then
    raise exception using errcode = '23505', message = format('Ya existe «%s». Si es la misma persona, usa Fusionar.', existing);
  end if;
  return clean;
end;
$$;

create function public.create_optometrist(target_organization_id bigint, optometrist_name text)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  clean text;
  new_id bigint;
begin
  perform private.assert_can_manage_optometrists(target_organization_id);
  clean := private.assert_optometrist_name_free(target_organization_id, optometrist_name, null);
  insert into public.optometrists (organization_id, full_name, created_by)
  values (target_organization_id, clean, (select auth.uid()))
  returning id into new_id;
  return new_id;
end;
$$;

create function public.rename_optometrist(target_optometrist_id bigint, optometrist_name text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  organization bigint;
  clean text;
begin
  select organization_id into organization from public.optometrists where id = target_optometrist_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'El optometrista no existe.';
  end if;
  perform private.assert_can_manage_optometrists(organization);
  clean := private.assert_optometrist_name_free(organization, optometrist_name, target_optometrist_id);
  update public.optometrists set full_name = clean where id = target_optometrist_id;
end;
$$;

-- Moves every prescription of `source` to `target` and removes `source`.
create function public.merge_optometrists(source_optometrist_id bigint, target_optometrist_id bigint)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  source_organization bigint;
  target_organization bigint;
  moved integer;
begin
  if source_optometrist_id = target_optometrist_id then
    raise exception using errcode = '22023', message = 'Elige dos optometristas distintos.';
  end if;
  select organization_id into source_organization from public.optometrists where id = source_optometrist_id for update;
  select organization_id into target_organization from public.optometrists where id = target_optometrist_id for update;
  if source_organization is null or target_organization is null or source_organization <> target_organization then
    raise exception using errcode = 'P0002', message = 'Los optometristas no existen o no son de la misma óptica.';
  end if;
  perform private.assert_can_manage_optometrists(source_organization);

  update public.prescription_revisions
  set optometrist_id = target_optometrist_id
  where optometrist_id = source_optometrist_id;
  get diagnostics moved = row_count;

  delete from public.optometrists where id = source_optometrist_id;
  return moved;
end;
$$;

-- Prescriptions per optometrist for the management list (archived ones excluded).
create function public.list_optometrists(target_organization_id bigint)
returns jsonb
language sql
stable
set search_path to ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', optometrist.id,
    'name', optometrist.full_name,
    'prescriptions', (
      select count(distinct revision.prescription_id)::integer
      from public.prescription_revisions revision
      join public.prescriptions prescription on prescription.id = revision.prescription_id
      where revision.optometrist_id = optometrist.id and prescription.archived_at is null
    )
  ) order by optometrist.full_name), '[]'::jsonb)
  from public.optometrists optometrist
  where optometrist.organization_id = target_organization_id;
$$;

revoke all on function private.assert_can_manage_optometrists(bigint) from public, anon, authenticated;
revoke all on function private.assert_optometrist_name_free(bigint, text, bigint) from public, anon, authenticated;
revoke all on function public.create_optometrist(bigint, text) from public, anon;
revoke all on function public.rename_optometrist(bigint, text) from public, anon;
revoke all on function public.merge_optometrists(bigint, bigint) from public, anon;
revoke all on function public.list_optometrists(bigint) from public, anon;
grant execute on function public.create_optometrist(bigint, text) to authenticated;
grant execute on function public.rename_optometrist(bigint, text) to authenticated;
grant execute on function public.merge_optometrists(bigint, bigint) to authenticated;
grant execute on function public.list_optometrists(bigint) to authenticated;
