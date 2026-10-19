-- LEN0001: private error log for the platform admin.
--
-- Unexpected errors are grouped by fingerprint (source + route + normalized first
-- line). A new group, or a resolved one that comes back, queues one WhatsApp alert
-- to the platform provider phone (global cap of 6 per hour); repeats only count.
--
-- Writers never touch the tables directly:
--   * the Next.js server calls record_server_error with a narrow ingest secret kept
--     in Vault (lensspace_error_ingest_secret) and in a server-only env var. It only
--     allows writing reports, so a leak cannot read or change tenant data;
--   * signed-in browsers call report_client_error, limited to 20 reports per user
--     every 10 minutes.
-- Only platform admins read or change the log, through RPCs. Messages and stacks are
-- redacted (tokens, keys, emails, phone-like numbers) and context is whitelisted.

create table private.error_groups (
  id bigint generated always as identity primary key,
  fingerprint text not null unique,
  source text not null check (source in ('server_render', 'server_action', 'route', 'proxy', 'server_handled', 'client', 'client_handled')),
  route_path text,
  title text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  occurrences integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  last_alerted_at timestamptz
);

create index error_groups_last_seen_idx on private.error_groups (status, last_seen_at desc);

create table private.error_occurrences (
  id bigint generated always as identity primary key,
  group_id bigint not null references private.error_groups(id) on delete cascade,
  organization_id bigint references public.organizations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  message text not null,
  digest text,
  stack text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index error_occurrences_group_idx on private.error_occurrences (group_id, created_at desc);
create index error_occurrences_created_idx on private.error_occurrences (created_at);
create index error_occurrences_organization_idx on private.error_occurrences (organization_id) where organization_id is not null;
create index error_occurrences_user_idx on private.error_occurrences (user_id) where user_id is not null;

create table private.error_alerts (
  id bigint generated always as identity primary key,
  group_id bigint not null references private.error_groups(id) on delete cascade,
  reason text not null check (reason in ('new', 'regression')),
  recipient text,
  message text not null,
  status text not null default 'requested' check (status in ('requested', 'sent', 'failed', 'skipped')),
  failure_code text,
  failure_message text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index error_alerts_group_idx on private.error_alerts (group_id, created_at desc);
create index error_alerts_created_idx on private.error_alerts (created_at);

-- Fixed 10-minute windows of accepted reports per subject ('user:<uuid>' or 'server').
create table private.error_report_quota (
  subject text not null,
  window_start timestamptz not null,
  reports integer not null default 0,
  primary key (subject, window_start)
);

alter table private.error_groups enable row level security;
alter table private.error_occurrences enable row level security;
alter table private.error_alerts enable row level security;
alter table private.error_report_quota enable row level security;
revoke all on private.error_groups, private.error_occurrences, private.error_alerts, private.error_report_quota
  from public, anon, authenticated;

-- Redacts secrets and personal data before anything is stored or sent by WhatsApp.
create or replace function private.sanitize_error_text(value text, max_length integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      btrim(coalesce(value, '')),
      'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+)?', '[token]', 'g'),
      '(sb_secret_|sb_publishable_|tk_|sk_|pk_)[A-Za-z0-9_-]{8,}', '[key]', 'g'),
      '(bearer|apikey|api_key|authorization|token|secret|password)(["'':= ]+)[^\s"'',;]+', '\1\2[redacted]', 'gi'),
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g'),
      '\+?\d[\d -]{6,}\d', '[number]', 'g'),
    max_length), '');
$$;

-- Ids, numbers and quoted values vary between occurrences of the same bug.
create or replace function private.error_fingerprint(source text, route text, title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(
    source || '|' || coalesce(route, '') || '|' ||
    regexp_replace(regexp_replace(regexp_replace(lower(coalesce(title, '')),
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<id>', 'g'),
      '"[^"]*"|''[^'']*''|\([^)]*\)', '<v>', 'g'),
      '\d+', '<n>', 'g'),
    'sha256'), 'hex');
$$;

-- Query string and fragment dropped; numeric and uuid segments become :id.
create or replace function private.normalize_error_route(route text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(regexp_replace(
    split_part(split_part(btrim(coalesce(route, '')), '?', 1), '#', 1),
    '/(\d+|[0-9a-fA-F-]{36})(?=/|$)', '/:id', 'g'), 200), '');
$$;

create or replace function private.take_error_quota(target_subject text, max_reports integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted integer;
begin
  insert into private.error_report_quota as quota (subject, window_start, reports)
  values (target_subject, date_bin('10 minutes', now(), timestamptz '2000-01-01'), 1)
  on conflict (subject, window_start) do update set reports = quota.reports + 1
  returning reports into accepted;
  return accepted <= max_reports;
end;
$$;

create or replace function private.uuid_or_null(value text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then value::uuid end;
$$;

-- Renders the alert in the database and asks send-platform-alert to deliver it.
create or replace function private.queue_error_alert(target_group_id bigint, target_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  error_group private.error_groups;
  latest private.error_occurrences;
  recipient text;
  organization_name text;
  user_name text;
  source_label text;
  alert_message text;
  alert_status text := 'requested';
  alert_id bigint;
  project_url text;
  notify_secret text;
begin
  -- Serializes the hourly cap check between concurrent reports.
  perform pg_advisory_xact_lock(hashtext('lensspace_error_alerts'));

  select * into error_group from private.error_groups where id = target_group_id;
  if not found then return; end if;
  select * into latest from private.error_occurrences where group_id = target_group_id order by id desc limit 1;
  select nullif(btrim(coalesce(phone, '')), '') into recipient from public.platform_provider_profile limit 1;
  select name into organization_name from public.organizations where id = latest.organization_id;
  select display_name into user_name from public.profiles where user_id = latest.user_id;

  source_label := case error_group.source
    when 'server_render' then 'pantalla, servidor'
    when 'server_action' then 'acción, servidor'
    when 'route' then 'ruta, servidor'
    when 'proxy' then 'proxy, servidor'
    when 'server_handled' then 'fallo controlado, servidor'
    when 'client' then 'pantalla, navegador'
    else 'fallo controlado, navegador' end;

  alert_message := concat_ws(E'\n',
    case target_reason when 'new' then '⚠️ *LensSpace: error nuevo*' else '⚠️ *LensSpace: un error resuelto volvió a aparecer*' end,
    '',
    format('Error #%s: %s', error_group.id, left(error_group.title, 300)),
    format('Dónde: %s (%s)', coalesce(error_group.route_path, 'desconocido'), source_label),
    'Óptica: ' || coalesce(organization_name, 'sin óptica identificada'),
    'Usuario: ' || user_name,
    'Cuándo: ' || to_char(error_group.last_seen_at at time zone 'America/Havana', 'DD/MM/YYYY HH24:MI'),
    '',
    'Revísalo en LensSpace → Errores.');

  if (select count(*) from private.error_alerts
      where created_at > now() - interval '1 hour' and status <> 'skipped') >= 6 then
    alert_status := 'skipped';
  end if;

  insert into private.error_alerts (group_id, reason, recipient, message, status, failure_code, completed_at)
  values (target_group_id, target_reason, recipient, alert_message, alert_status,
    case when alert_status = 'skipped' then 'hourly_cap' end,
    case when alert_status = 'skipped' then now() end)
  returning id into alert_id;
  if alert_status = 'skipped' then return; end if;

  update private.error_groups set last_alerted_at = now() where id = target_group_id;

  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'vision_studio_project_url';
  select decrypted_secret into notify_secret from vault.decrypted_secrets where name = 'vision_studio_wa_notify_secret';
  if nullif(project_url, '') is null or nullif(notify_secret, '') is null then
    raise warning 'Error alert % queued without runtime configuration', alert_id;
    return;
  end if;

  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/send-platform-alert',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-wa-secret', notify_secret),
    body := jsonb_build_object('alertId', alert_id),
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning 'queue_error_alert failed for group %: %', target_group_id, sqlerrm;
end;
$$;

-- Groups the report, stores the occurrence (at most 20 per group per hour; the
-- counter always grows) and alerts on a new or regressed group.
create or replace function private.record_error(target_source text, report jsonb, target_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_message text := coalesce(private.sanitize_error_text(report->>'message', 1000), 'Error sin mensaje');
  clean_route text := private.normalize_error_route(report->>'route');
  error_title text;
  target_fingerprint text;
  target_group_id bigint;
  previous_status text;
  alert_reason text;
  member_organization_id bigint;
begin
  error_title := left(split_part(clean_message, E'\n', 1), 200);
  target_fingerprint := private.error_fingerprint(target_source, clean_route, error_title);

  -- Only when the user belongs to exactly one organization; providers working for
  -- several opticians stay unassigned rather than guessed.
  if target_user_id is not null then
    select min(membership.organization_id) into member_organization_id
    from public.organization_memberships membership
    where membership.user_id = target_user_id and membership.status = 'active'
    having count(distinct membership.organization_id) = 1;
  end if;

  insert into private.error_groups (fingerprint, source, route_path, title)
  values (target_fingerprint, target_source, clean_route, error_title)
  on conflict (fingerprint) do nothing
  returning id into target_group_id;

  if target_group_id is not null then
    alert_reason := 'new';
  else
    select id, status into target_group_id, previous_status
    from private.error_groups where fingerprint = target_fingerprint for update;
    if previous_status = 'resolved' then alert_reason := 'regression'; end if;
  end if;

  update private.error_groups set
    occurrences = occurrences + 1,
    last_seen_at = now(),
    status = case when status = 'resolved' then 'open' else status end,
    resolved_at = case when status = 'resolved' then null else resolved_at end,
    resolved_by = case when status = 'resolved' then null else resolved_by end
  where id = target_group_id;

  if (select count(*) from private.error_occurrences occurrence
      where occurrence.group_id = target_group_id and occurrence.created_at > now() - interval '1 hour') < 20 then
    insert into private.error_occurrences (group_id, organization_id, user_id, message, digest, stack, context)
    values (
      target_group_id, member_organization_id, target_user_id, clean_message,
      nullif(left(regexp_replace(coalesce(report->>'digest', ''), '[^A-Za-z0-9_-]', '', 'g'), 64), ''),
      private.sanitize_error_text(report->>'stack', 4000),
      jsonb_strip_nulls(jsonb_build_object(
        'path', private.normalize_error_route(report->'context'->>'path'),
        'method', left(report->'context'->>'method', 10),
        'routeType', left(report->'context'->>'routeType', 30),
        'renderSource', left(report->'context'->>'renderSource', 60),
        'userAgent', left(report->'context'->>'userAgent', 300),
        'release', left(report->'context'->>'release', 40)
      ))
    );
  end if;

  if alert_reason is not null then
    perform private.queue_error_alert(target_group_id, alert_reason);
  end if;
  return target_group_id;
end;
$$;

-- Server reports (Next.js onRequestError and handled server failures).
create or replace function public.record_server_error(ingest_secret text, report jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_secret text;
  report_source text := report->>'source';
begin
  select decrypted_secret into expected_secret from vault.decrypted_secrets where name = 'lensspace_error_ingest_secret';
  if nullif(expected_secret, '') is null or nullif(ingest_secret, '') is null
    or extensions.digest(ingest_secret, 'sha256') <> extensions.digest(expected_secret, 'sha256') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if report_source is null or report_source not in ('server_render', 'server_action', 'route', 'proxy', 'server_handled') then
    raise exception 'Origen de error inválido.' using errcode = '22023';
  end if;
  -- Even the trusted server cannot flood the log or WhatsApp.
  if not private.take_error_quota('server', 500) then return; end if;
  perform private.record_error(report_source, report, private.uuid_or_null(report->>'userId'));
end;
$$;

-- Browser reports from signed-in users; the user is always the caller.
create or replace function public.report_client_error(report jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  report_source text := report->>'source';
begin
  if caller is null then raise exception 'No autorizado.' using errcode = '42501'; end if;
  if report_source is null or report_source not in ('client', 'client_handled') then
    raise exception 'Origen de error inválido.' using errcode = '22023';
  end if;
  if octet_length(report::text) > 16384 then return; end if;
  if not private.take_error_quota('user:' || caller::text, 20) then return; end if;
  perform private.record_error(report_source, report, caller);
end;
$$;

create or replace function public.list_error_groups(target_status text default 'open', target_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_platform_admin()) then
    raise exception 'Solo la administración de la plataforma puede ver los errores.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'counts', (select jsonb_build_object(
      'open', count(*) filter (where status = 'open'),
      'resolved', count(*) filter (where status = 'resolved'),
      'ignored', count(*) filter (where status = 'ignored')) from private.error_groups),
    'groups', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.last_seen_at desc)
      from (
        select error_group.id, error_group.source, error_group.route_path, error_group.title, error_group.status,
          error_group.occurrences, error_group.first_seen_at, error_group.last_seen_at, error_group.resolved_at,
          (select organization.name from private.error_occurrences occurrence
            join public.organizations organization on organization.id = occurrence.organization_id
            where occurrence.group_id = error_group.id order by occurrence.id desc limit 1) as last_organization_name,
          (select count(distinct occurrence.organization_id) from private.error_occurrences occurrence
            where occurrence.group_id = error_group.id) as organizations,
          (select count(distinct occurrence.user_id) from private.error_occurrences occurrence
            where occurrence.group_id = error_group.id) as users
        from private.error_groups error_group
        where target_status is null or error_group.status = target_status
        order by error_group.last_seen_at desc
        limit least(greatest(coalesce(target_limit, 100), 1), 200)
      ) item), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_error_group(target_group_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not (select private.is_platform_admin()) then
    raise exception 'Solo la administración de la plataforma puede ver los errores.' using errcode = '42501';
  end if;
  select to_jsonb(error_group) - 'fingerprint' || jsonb_build_object(
    'resolved_by_name', (select display_name from public.profiles where user_id = error_group.resolved_by),
    'occurrence_list', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.created_at desc)
      from (
        select occurrence.id, occurrence.created_at, occurrence.message, occurrence.digest, occurrence.stack,
          occurrence.context, organization.name as organization_name, profile.display_name as user_name
        from private.error_occurrences occurrence
        left join public.organizations organization on organization.id = occurrence.organization_id
        left join public.profiles profile on profile.user_id = occurrence.user_id
        where occurrence.group_id = error_group.id
        order by occurrence.id desc
        limit 30
      ) item), '[]'::jsonb),
    'alert_list', coalesce((
      select jsonb_agg(jsonb_build_object('id', alert.id, 'reason', alert.reason, 'status', alert.status,
        'failure_code', alert.failure_code, 'created_at', alert.created_at) order by alert.created_at desc)
      from (select * from private.error_alerts where group_id = error_group.id order by id desc limit 10) alert), '[]'::jsonb)
  ) into result
  from private.error_groups error_group
  where error_group.id = target_group_id;
  if result is null then raise exception 'Error no encontrado.' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.set_error_group_status(target_group_id bigint, target_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_platform_admin()) then
    raise exception 'Solo la administración de la plataforma puede cambiar los errores.' using errcode = '42501';
  end if;
  if target_status not in ('open', 'resolved', 'ignored') then
    raise exception 'Estado inválido.' using errcode = '22023';
  end if;
  update private.error_groups set
    status = target_status,
    resolved_at = case when target_status = 'resolved' then now() end,
    resolved_by = case when target_status = 'resolved' then (select auth.uid()) end
  where id = target_group_id;
  if not found then raise exception 'Error no encontrado.' using errcode = 'P0002'; end if;
end;
$$;

-- Edge Function send-platform-alert (service role only).
create or replace function public.get_platform_alert_payload(target_alert_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('alertId', id, 'status', status, 'recipient', recipient, 'message', message)
  from private.error_alerts where id = target_alert_id;
$$;

create or replace function public.complete_platform_alert(
  target_alert_id bigint, target_outcome text, target_failure_code text,
  target_failure_message text, target_message_id text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_outcome not in ('sent', 'failed') then raise exception 'Resultado inválido.' using errcode = '22023'; end if;
  update private.error_alerts set
    status = target_outcome,
    failure_code = left(target_failure_code, 80),
    failure_message = left(target_failure_message, 500),
    provider_message_id = left(target_message_id, 200),
    completed_at = now()
  where id = target_alert_id and status = 'requested';
end;
$$;

-- Occurrences and alerts are kept 90 days; groups stay as history.
create or replace function private.cleanup_error_log()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.error_occurrences where created_at < now() - interval '90 days';
  delete from private.error_alerts where created_at < now() - interval '90 days';
  delete from private.error_report_quota where window_start < now() - interval '1 day';
$$;

revoke all on function private.sanitize_error_text(text, integer), private.error_fingerprint(text, text, text),
  private.normalize_error_route(text), private.take_error_quota(text, integer), private.uuid_or_null(text),
  private.queue_error_alert(bigint, text), private.record_error(text, jsonb, uuid), private.cleanup_error_log()
  from public, anon, authenticated;

revoke all on function public.record_server_error(text, jsonb) from public;
grant execute on function public.record_server_error(text, jsonb) to anon, authenticated;

revoke all on function public.report_client_error(jsonb) from public, anon;
grant execute on function public.report_client_error(jsonb) to authenticated;

revoke all on function public.list_error_groups(text, integer), public.get_error_group(bigint),
  public.set_error_group_status(bigint, text) from public, anon;
grant execute on function public.list_error_groups(text, integer), public.get_error_group(bigint),
  public.set_error_group_status(bigint, text) to authenticated;

revoke all on function public.get_platform_alert_payload(bigint),
  public.complete_platform_alert(bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function public.get_platform_alert_payload(bigint),
  public.complete_platform_alert(bigint, text, text, text, text) to service_role;

select cron.schedule('lensspace-error-log-cleanup', '30 8 * * *', 'select private.cleanup_error_log()');
