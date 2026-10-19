-- Transactional error log fixture (LEN0001). pg_net requests are only sent on
-- commit, so the rollback keeps this test from sending WhatsApp.
begin;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('33000000-0000-0000-0000-000000000001', 'errors-admin@example.test', '{"display_name":"Platform Admin"}', now()),
  ('33000000-0000-0000-0000-000000000002', 'errors-owner@example.test', '{"display_name":"Error Owner"}', now());
insert into private.platform_admins (user_id, created_by)
values ('33000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001');
insert into public.organizations (id, name, order_prefix) overriding system value values (996000001, 'Error Optics', 'ERR');
insert into public.organization_memberships (organization_id, user_id, role, status)
values (996000001, '33000000-0000-0000-0000-000000000002', 'owner', 'active');

do $$
declare
  first_group bigint;
  second_group bigint;
  clean text;
begin
  clean := private.sanitize_error_text('Fallo de ana@example.com con eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc tel +53 5555 1234 key sb_secret_abcdefghijkl', 1000);
  if clean ~ 'ana@|eyJhbGci|5555|sb_secret_' then raise exception 'Sensitive data not redacted: %', clean; end if;

  -- Same bug with different ids and quoted values: one group, two occurrences, one alert.
  first_group := private.record_error('server_action',
    '{"message":"duplicate key value violates unique constraint \"payments_pkey\" (id)=(41)","route":"/orders/41?tab=pagos","stack":"Error: x\n at y","digest":"123abc","context":{"method":"POST","cookie":"secret"}}',
    '33000000-0000-0000-0000-000000000002');
  second_group := private.record_error('server_action',
    '{"message":"duplicate key value violates unique constraint \"payments_pkey\" (id)=(97)","route":"/orders/97"}',
    '33000000-0000-0000-0000-000000000002');
  if first_group is distinct from second_group then raise exception 'Repeats must share the group'; end if;
  if (select occurrences from private.error_groups where id = first_group) <> 2 then raise exception 'Occurrences not counted'; end if;
  if (select route_path from private.error_groups where id = first_group) <> '/orders/:id' then raise exception 'Route not normalized'; end if;
  if (select count(*) from private.error_alerts where group_id = first_group) <> 1 then raise exception 'Exactly one alert per new group'; end if;
  if (select organization_id from private.error_occurrences where group_id = first_group order by id limit 1) <> 996000001 then
    raise exception 'Organization not resolved from the single membership';
  end if;
  if exists (select 1 from private.error_occurrences where group_id = first_group and context ? 'cookie') then
    raise exception 'Context must be whitelisted';
  end if;
  if not exists (select 1 from private.error_alerts where group_id = first_group and message like '%Error Optics%' and message like '%Error Owner%') then
    raise exception 'Alert message lacks organization or user';
  end if;
end $$;

-- Tenant users cannot read the log and cannot use the server entry point.
set local role authenticated;
select set_config('request.jwt.claim.sub', '33000000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    perform public.list_error_groups('open', 10);
    raise exception 'Tenant user listed the error log';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_server_error('wrong-secret', '{"source":"server_render","message":"x"}');
    raise exception 'Wrong ingest secret accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.report_client_error('{"source":"server_render","message":"x"}');
    raise exception 'Browser reported a server source';
  exception when invalid_parameter_value then null;
  end;
  -- 25 reports: only 20 are accepted in the 10-minute window.
  for i in 1..25 loop
    perform public.report_client_error(jsonb_build_object('source', 'client', 'message', 'Cannot read properties of undefined', 'route', '/sales'));
  end loop;
end $$;
reset role;

do $$
begin
  if (select occurrences from private.error_groups where source = 'client' and route_path = '/sales') <> 20 then
    raise exception 'Per-user quota not applied';
  end if;
end $$;

-- Anonymous visitors cannot report from the browser.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  perform public.report_client_error('{"source":"client","message":"x"}');
  raise exception 'Anonymous browser report accepted';
exception when insufficient_privilege then null;
end $$;
reset role;

-- The platform admin resolves; the error coming back reopens it and alerts again;
-- an ignored group never alerts.
set local role authenticated;
select set_config('request.jwt.claim.sub', '33000000-0000-0000-0000-000000000001', true);
do $$
declare
  target bigint;
  listed jsonb;
begin
  listed := public.list_error_groups('open', 10);
  select (item->>'id')::bigint into target from jsonb_array_elements(listed->'groups') item where item->>'route_path' = '/orders/:id';
  if target is null then raise exception 'Admin does not see the open group'; end if;
  if public.get_error_group(target) ? 'fingerprint' then raise exception 'Fingerprint must not be exposed'; end if;
  perform public.set_error_group_status(target, 'resolved');
end $$;
reset role;

do $$
declare
  target bigint := (select id from private.error_groups where route_path = '/orders/:id');
  ignored bigint;
begin
  perform private.record_error('server_action', '{"message":"duplicate key value violates unique constraint \"payments_pkey\" (id)=(5)","route":"/orders/5"}', null);
  if (select status from private.error_groups where id = target) <> 'open' then raise exception 'Regression must reopen'; end if;
  if not exists (select 1 from private.error_alerts where group_id = target and reason = 'regression') then raise exception 'Missing regression alert'; end if;

  ignored := (select id from private.error_groups where source = 'client' and route_path = '/sales');
  update private.error_groups set status = 'ignored' where id = ignored;
  perform private.record_error('client', '{"message":"Cannot read properties of undefined","route":"/sales"}', null);
  if (select count(*) from private.error_alerts where group_id = ignored) <> 1 then raise exception 'Ignored group alerted again'; end if;

  -- Hourly cap: never more than 6 alerts requested in an hour; the rest are skipped.
  for i in 1..8 loop
    perform private.record_error('server_render', jsonb_build_object('message', 'Distinct failure ' || chr(96 + i), 'route', '/cap-test'), null);
  end loop;
  if (select count(*) from private.error_alerts where created_at > now() - interval '1 hour' and status <> 'skipped') > 6 then
    raise exception 'Hourly alert cap exceeded';
  end if;
  if not exists (select 1 from private.error_alerts where status = 'skipped' and failure_code = 'hourly_cap') then
    raise exception 'Alerts over the cap must be skipped';
  end if;
end $$;

rollback;
