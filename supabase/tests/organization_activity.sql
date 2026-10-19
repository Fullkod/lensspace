-- Transactional activity fixture (LEN0002): the RPC figures must match direct counts
-- on whatever data the project has, and only platform admins may call it.
begin;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('34000000-0000-0000-0000-000000000001', 'activity-admin@example.test', '{"display_name":"Activity Admin"}', now()),
  ('34000000-0000-0000-0000-000000000002', 'activity-owner@example.test', '{"display_name":"Activity Owner"}', now());
insert into private.platform_admins (user_id, created_by)
values ('34000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001');
insert into public.organizations (id, name, order_prefix) overriding system value values (995000001, 'Activity Optics', 'ACT');
insert into public.organization_memberships (organization_id, user_id, role, status)
values (995000001, '34000000-0000-0000-0000-000000000002', 'owner', 'active');
insert into public.branches (organization_id, name, code)
select 995000001, 'Principal', 'PRI' where not exists (select 1 from public.branches where organization_id = 995000001);
insert into public.customers (organization_id, branch_id, full_name, created_by, created_at)
select 995000001, branch.id, fixture.full_name, '34000000-0000-0000-0000-000000000002', fixture.created_at
from (select id from public.branches where organization_id = 995000001 order by id limit 1) branch
cross join (values ('Cliente hoy', now()), ('Cliente viejo', now() - interval '40 days')) fixture(full_name, created_at);

set local role authenticated;
select set_config('request.jwt.claim.sub', '34000000-0000-0000-0000-000000000002', true);
do $$
begin
  perform public.get_organization_activity(995000001, 30);
  raise exception 'Tenant user read the activity';
exception when insufficient_privilege then null;
end $$;

reset role;

-- Direct counts must bypass RLS (the admin cannot read tenant rows, QA-38); the RPC
-- still sees the admin through the JWT claim.
select set_config('request.jwt.claim.sub', '34000000-0000-0000-0000-000000000001', true);
do $$
declare
  fixture jsonb := public.get_organization_activity(995000001, 30);
  forever jsonb := public.get_organization_activity(995000001, null);
  platform jsonb := public.get_organization_activity(null, null);
  sample bigint := (select id from public.organizations where id <> 995000001 order by id limit 1);
  sample_activity jsonb;
begin
  if (fixture->'counts'->>'customer')::int <> 1 then raise exception 'Period filter wrong: %', fixture->'counts'; end if;
  if (forever->'counts'->>'customer')::int <> 2 then raise exception 'Always must count every customer'; end if;
  if (fixture->>'activeDays')::int <> 1 then raise exception 'Active days wrong'; end if;
  if jsonb_array_length(fixture->'weekly') <> 8 then raise exception 'Weekly trend must have 8 weeks'; end if;
  if fixture->'team'->0->>'name' <> 'Activity Owner' or fixture->'team'->0->'roles'->>0 <> 'owner' then
    raise exception 'Team list wrong: %', fixture->'team';
  end if;
  if fixture ? 'adoption' and fixture->'adoption' <> 'null'::jsonb then raise exception 'Adoption only for the platform'; end if;
  if (platform->'adoption'->>'organizations')::int <> (select count(*) from public.organizations where status <> 'archived') then
    raise exception 'Platform organization count wrong';
  end if;
  if (platform->'counts'->>'order')::int is distinct from nullif((select count(*) from public.orders), 0)::int then
    raise exception 'Platform order count wrong';
  end if;

  if sample is not null then
    sample_activity := public.get_organization_activity(sample, null);
    if coalesce((sample_activity->'counts'->>'payment')::int, 0) <> (select count(*) from public.payments where organization_id = sample) then
      raise exception 'Payments count does not match';
    end if;
    if (sample_activity->>'cupEquivalent')::numeric <> (select coalesce(sum(equivalent_cup), 0) from public.payments where organization_id = sample) then
      raise exception 'CUP equivalent does not match';
    end if;
  end if;

  begin
    perform public.get_organization_activity(995000001, 0);
    raise exception 'Invalid period accepted';
  exception when invalid_parameter_value then null;
  end;
  if (select (item->>'activeDays30')::int from jsonb_array_elements(public.get_platform_usage()) item
      where (item->>'organizationId')::bigint = 995000001) <> 1 then
    raise exception 'Usage list 30-day figure does not match the card';
  end if;
end $$;

rollback;
