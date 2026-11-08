-- db lint: type the empty array literal of assign_production_jobs (body otherwise as in
-- 20261108200000_commercial_orders_ui.sql).
create or replace function public.assign_production_jobs(target_order_id bigint, job_type text, provider_id uuid, target_order_line_ids bigint[])
returns bigint[]
language plpgsql
set search_path = ''
as $$
declare
  line_id bigint;
  created bigint[] := '{}'::bigint[];
begin
  if coalesce(cardinality(target_order_line_ids), 0) not between 1 and 200
    or cardinality(target_order_line_ids) <> (select count(distinct value) from unnest(target_order_line_ids) value) then
    raise exception using errcode = '22023', message = 'Indica pares distintos del pedido.';
  end if;
  foreach line_id in array target_order_line_ids loop
    created := created || private.assign_production_job(target_order_id, job_type, provider_id, line_id);
  end loop;
  return created;
end;
$$;
