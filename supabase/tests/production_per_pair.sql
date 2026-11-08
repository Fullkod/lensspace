-- LEN0006 phase 5: production per pair. Transactional fixture: everything is rolled back
-- at the end (acceptance only queues a pg_net request, discarded by the rollback).
begin;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('93000000-0000-0000-0000-000000000001', 'pp-seller@example.test', '{"display_name":"PP Seller"}', now()),
  ('93000000-0000-0000-0000-000000000002', 'pp-owner@example.test', '{"display_name":"PP Owner"}', now()),
  ('93000000-0000-0000-0000-000000000003', 'pp-lens@example.test', '{"display_name":"PP Lens"}', now());

insert into public.organizations (id, name, order_prefix, timezone) overriding system value values (930000001, 'Production Pair Test', 'PPTQA', 'America/Havana');
insert into public.branches (id, organization_id, name, code) overriding system value values (930000001, 930000001, 'Main', 'MAIN');
insert into public.organization_memberships (organization_id, user_id, branch_id, role, status) values
  (930000001, '93000000-0000-0000-0000-000000000001', 930000001, 'seller', 'active'),
  (930000001, '93000000-0000-0000-0000-000000000002', null, 'owner', 'active'),
  (930000001, '93000000-0000-0000-0000-000000000003', null, 'lens_provider', 'active');
insert into public.subscriptions (organization_id, status, starts_on, expires_on) values (930000001, 'active', current_date - 1, current_date + 30);
insert into public.organization_modules (organization_id, module_key, changed_by) values
  (930000001, 'optical_sales', '93000000-0000-0000-0000-000000000002'),
  (930000001, 'production', '93000000-0000-0000-0000-000000000002');

insert into public.customers (id, organization_id, branch_id, full_name, created_by) overriding system value values
  (930000001, 930000001, 930000001, 'Holder', '93000000-0000-0000-0000-000000000001'),
  (930000002, 930000001, 930000001, 'Relative Secret', '93000000-0000-0000-0000-000000000001'),
  (930000003, 930000001, 930000001, 'Relative Two', '93000000-0000-0000-0000-000000000001');
insert into public.prescriptions (id, organization_id, branch_id, customer_id, created_by) overriding system value values
  (930000001, 930000001, 930000001, 930000002, '93000000-0000-0000-0000-000000000001');
insert into public.prescription_revisions (id, organization_id, branch_id, prescription_id, revision_number, prescription_date, right_sphere, left_sphere, created_by) overriding system value values
  (930000001, 930000001, 930000001, 930000001, 1, current_date, -2, -2.5, '93000000-0000-0000-0000-000000000001');
insert into public.catalog_items (id, organization_id, category, code, name, sale_price, currency, is_active) overriding system value values
  (930000001, 930000001, 'frame', 'pp_frame', 'Armadura PP', 3000, 'CUP', true),
  (930000002, 930000001, 'vision_type', 'pp_single', 'Monofocal PP', 50, 'USD', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000001', true);

create temporary table pp_ids (key text primary key, id bigint) on commit drop;

do $$
declare
  family_order bigint;
  single_order bigint;
  lines bigint[];
  created bigint[];
  snapshot jsonb;
begin
  family_order := (public.accept_quotation((public.save_multi_line_quotation(null, 930000001, 930000001, 930000001, jsonb_build_array(
    jsonb_build_object('patientCustomerId', 930000001, 'itemIds', jsonb_build_array(930000001)),
    jsonb_build_object('patientCustomerId', 930000002, 'prescriptionRevisionId', 930000001, 'itemIds', jsonb_build_array(930000001, 930000002)),
    jsonb_build_object('patientCustomerId', 930000003, 'itemIds', jsonb_build_array(930000002))
  ), 400, null, null)->>'quotationId')::bigint)->>'orderId')::bigint;
  select array_agg(id order by line_number) into lines from public.order_lines where order_id = family_order;

  -- 1. Without a pair, a multi-pair order is refused.
  begin
    perform public.assign_production_job(family_order, 'lens', '93000000-0000-0000-0000-000000000003');
    raise exception 'A multi-pair order needs the pair';
  exception when not_null_violation then null;
  end;

  -- 2. "Asignar a todos los pares": one current lens job per pair.
  created := public.assign_production_jobs(family_order, 'lens', '93000000-0000-0000-0000-000000000003', lines);
  if cardinality(created) <> 3 or (select count(*) from public.production_jobs where order_id = family_order and is_current and job_type = 'lens') <> 3 then
    raise exception 'Expected 3 current lens jobs';
  end if;

  -- 3. A second current job of the same type on the same pair is refused; another type is fine.
  begin
    perform public.assign_production_jobs(family_order, 'lens', '93000000-0000-0000-0000-000000000002', array[lines[1]]);
    raise exception 'Duplicate current job on a pair must be refused';
  exception when unique_violation then null;
  end;
  perform public.assign_production_jobs(family_order, 'mounting', '93000000-0000-0000-0000-000000000002', array[lines[2]]);

  -- 4. Pair 2 snapshot: its own concepts and prescription, "Par 2 de 3", no patient.
  select work_snapshot into snapshot from public.production_jobs where order_line_id = lines[2] and job_type = 'lens';
  if (snapshot->>'lineNumber')::int <> 2 or (snapshot->>'lineCount')::int <> 3
    or jsonb_array_length(snapshot->'items') <> 2
    or (snapshot->'prescription'->>'id')::bigint <> 930000001
    or snapshot::text like '%Relative%' or snapshot ? 'patientCustomerId' then
    raise exception 'Pair snapshot is wrong: %', snapshot;
  end if;
  if (select work_snapshot->'prescription' from public.production_jobs where order_line_id = lines[1] and job_type = 'lens') <> 'null'::jsonb then
    raise exception 'Pair 1 has no prescription';
  end if;

  -- 5. Bad input: a line of another order, repeated lines.
  begin
    perform public.assign_production_jobs(family_order, 'mounting', '93000000-0000-0000-0000-000000000002', array[lines[1], lines[1]]);
    raise exception 'Repeated pairs must be refused';
  exception when invalid_parameter_value then null;
  end;

  -- 6. Single-pair order: the legacy 3-argument call still works.
  single_order := (public.accept_quotation((public.save_multi_line_quotation(null, 930000001, 930000001, 930000001, jsonb_build_array(
    jsonb_build_object('patientCustomerId', 930000001, 'itemIds', jsonb_build_array(930000001))), 400, null, null)->>'quotationId')::bigint)->>'orderId')::bigint;
  created := array[public.assign_production_job(single_order, 'lens', '93000000-0000-0000-0000-000000000003')];
  if (select work_snapshot->>'lineCount' from public.production_jobs where id = created[1]) <> '1' then
    raise exception 'Single-pair snapshot must say lineCount 1';
  end if;
  begin
    perform public.assign_production_jobs(single_order, 'mounting', '93000000-0000-0000-0000-000000000002', array[lines[3]]);
    raise exception 'A pair of another order must be refused';
  exception when no_data_found then null;
  end;

  insert into pp_ids values ('family', family_order), ('pair2_lens', (select id from public.production_jobs where order_line_id = lines[2] and job_type = 'lens'));
end;
$$;

-- 7. The provider sees "Par 2 de 3" but never the patient; panel and timeline show pairs.
select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000003', true);
do $$
declare listed jsonb := public.list_accessible_production_jobs();
begin
  if jsonb_array_length(listed) <> 4 or listed::text like '%Relative%' or listed::text like '%Holder%' then
    raise exception 'Provider list is wrong or leaks the patient: %', listed;
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '93000000-0000-0000-0000-000000000001', true);
do $$
declare
  family_order bigint := (select id from pp_ids where key = 'family');
  panel jsonb := public.get_order_production_panel(family_order);
  timeline jsonb := public.get_order_timeline(family_order);
begin
  if jsonb_array_length(panel->'pairs') <> 3 or jsonb_array_length(panel->'jobs') <> 4
    or exists (select 1 from jsonb_array_elements(panel->'jobs') job where job->>'orderLineId' is null) then
    raise exception 'Panel is wrong: %', panel;
  end if;
  if not exists (select 1 from jsonb_array_elements(timeline) event where event->>'kind' = 'production' and event->>'detail' like 'Par 2 · %') then
    raise exception 'Timeline must label production events by pair: %', timeline;
  end if;
end;
$$;

rollback;
