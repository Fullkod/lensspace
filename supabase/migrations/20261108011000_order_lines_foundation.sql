-- LEN0006 phase 1: pair level ("lines") for quotations and orders.
-- A line is one pair of glasses: its patient (who wears them), its prescription and its
-- concepts. orders.customer_id stays the holder (payer, WhatsApp recipient); totals and
-- cup_equivalent on the parent stay the sum of its lines, so payments, cashbox and the
-- delivery guard are untouched. Every existing quotation/order becomes line 1.
-- Transitional: items and jobs inserted without a line (current RPCs) go to line 1, which
-- is created from the parent when missing; the multi-pair RPCs pass the line explicitly.

create table public.quotation_lines (
  id bigint generated always as identity primary key,
  quotation_id bigint not null,
  organization_id bigint not null,
  branch_id bigint not null,
  line_number smallint not null check (line_number between 1 and 10),
  patient_customer_id bigint not null,
  prescription_revision_id bigint references public.prescription_revisions(id),
  totals jsonb not null default '{}'::jsonb,
  cup_equivalent numeric not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint quotation_lines_number_key unique (quotation_id, line_number),
  constraint quotation_lines_id_organization_branch_key unique (id, organization_id, branch_id),
  constraint quotation_lines_quotation_fkey foreign key (quotation_id, organization_id, branch_id)
    references public.quotations(id, organization_id, branch_id) on delete cascade,
  constraint quotation_lines_patient_fkey foreign key (patient_customer_id, organization_id, branch_id)
    references public.customers(id, organization_id, branch_id)
);

create table public.order_lines (
  id bigint generated always as identity primary key,
  order_id bigint not null,
  organization_id bigint not null,
  branch_id bigint not null,
  line_number smallint not null check (line_number between 1 and 10),
  patient_customer_id bigint not null,
  prescription_revision_id bigint references public.prescription_revisions(id),
  totals jsonb not null,
  cup_equivalent numeric not null,
  created_at timestamptz not null default now(),
  constraint order_lines_number_key unique (order_id, line_number),
  constraint order_lines_id_organization_branch_key unique (id, organization_id, branch_id),
  constraint order_lines_order_fkey foreign key (order_id, organization_id, branch_id)
    references public.orders(id, organization_id, branch_id),
  constraint order_lines_patient_fkey foreign key (patient_customer_id, organization_id, branch_id)
    references public.customers(id, organization_id, branch_id)
);

create index quotation_lines_patient_idx on public.quotation_lines (patient_customer_id);
create index quotation_lines_revision_idx on public.quotation_lines (prescription_revision_id) where prescription_revision_id is not null;
create index order_lines_patient_idx on public.order_lines (patient_customer_id);
create index order_lines_revision_idx on public.order_lines (prescription_revision_id) where prescription_revision_id is not null;

alter table public.quotation_lines enable row level security;
alter table public.order_lines enable row level security;

-- Same visibility as the concepts: through the parent (whose own RLS scopes seller/branch).
create policy quotation_lines_select on public.quotation_lines for select to authenticated
using (exists (select 1 from public.quotations quotation where quotation.id = quotation_lines.quotation_id));
create policy quotation_lines_insert on public.quotation_lines for insert to authenticated
with check (exists (select 1 from public.quotations quotation where quotation.id = quotation_lines.quotation_id and quotation.status <> 'accepted'));
create policy quotation_lines_update on public.quotation_lines for update to authenticated
using (exists (select 1 from public.quotations quotation where quotation.id = quotation_lines.quotation_id and quotation.status <> 'accepted'))
with check (exists (select 1 from public.quotations quotation where quotation.id = quotation_lines.quotation_id and quotation.status <> 'accepted'));
create policy quotation_lines_delete on public.quotation_lines for delete to authenticated
using (exists (select 1 from public.quotations quotation where quotation.id = quotation_lines.quotation_id and quotation.status <> 'accepted'));

create policy order_lines_select on public.order_lines for select to authenticated
using (exists (select 1 from public.orders sale_order where sale_order.id = order_lines.order_id));
create policy order_lines_insert on public.order_lines for insert to authenticated
with check (exists (select 1 from public.orders sale_order where sale_order.id = order_lines.order_id));

revoke all on public.quotation_lines, public.order_lines from anon;
grant select, insert, update, delete on public.quotation_lines to authenticated;
grant select, insert on public.order_lines to authenticated;

-- The accepted pair snapshot is immutable, like order_items.
create trigger order_lines_immutable
before update or delete on public.order_lines
for each row execute function private.reject_immutable_order_change();

-- Line columns on concepts and jobs.
alter table public.quotation_items add column quotation_line_id bigint;
alter table public.order_items add column order_line_id bigint;
alter table public.production_jobs add column order_line_id bigint;

alter table public.quotation_items add constraint quotation_items_line_fkey
  foreign key (quotation_line_id, organization_id, branch_id)
  references public.quotation_lines(id, organization_id, branch_id) on delete cascade;
alter table public.order_items add constraint order_items_line_fkey
  foreign key (order_line_id, organization_id, branch_id)
  references public.order_lines(id, organization_id, branch_id);
alter table public.production_jobs add constraint production_jobs_line_fkey
  foreign key (order_line_id, organization_id, branch_id)
  references public.order_lines(id, organization_id, branch_id);

create index quotation_items_line_idx on public.quotation_items (quotation_line_id, organization_id, branch_id);
create index order_items_line_idx on public.order_items (order_line_id, organization_id, branch_id);
create index production_jobs_line_idx on public.production_jobs (order_line_id, organization_id, branch_id);

-- Line 1 of a quotation/order built from the parent (single-pair: patient = holder).
create function private.ensure_first_quotation_line(target_quotation_id bigint)
returns bigint
language plpgsql
set search_path to ''
as $$
declare
  line_id bigint;
begin
  insert into public.quotation_lines (quotation_id, organization_id, branch_id, line_number, patient_customer_id, prescription_revision_id, totals, cup_equivalent, warnings)
  select quotation.id, quotation.organization_id, quotation.branch_id, 1, quotation.customer_id, quotation.prescription_revision_id, quotation.totals, quotation.cup_equivalent, quotation.warnings
  from public.quotations quotation where quotation.id = target_quotation_id
  on conflict (quotation_id, line_number) do update
    set patient_customer_id = excluded.patient_customer_id,
        prescription_revision_id = excluded.prescription_revision_id,
        totals = excluded.totals,
        cup_equivalent = excluded.cup_equivalent,
        warnings = excluded.warnings
  returning id into line_id;
  return line_id;
end;
$$;

create function private.ensure_first_order_line(target_order_id bigint)
returns bigint
language plpgsql
set search_path to ''
as $$
declare
  line_id bigint;
begin
  select id into line_id from public.order_lines where order_id = target_order_id and line_number = 1;
  if line_id is null then
    insert into public.order_lines (order_id, organization_id, branch_id, line_number, patient_customer_id, prescription_revision_id, totals, cup_equivalent)
    select sale_order.id, sale_order.organization_id, sale_order.branch_id, 1, sale_order.customer_id, sale_order.prescription_revision_id, sale_order.totals, sale_order.cup_equivalent
    from public.orders sale_order where sale_order.id = target_order_id
    returning id into line_id;
  end if;
  return line_id;
end;
$$;

-- Transitional defaults for callers that do not send a line (single-pair path).
-- A legacy quotation save re-inserts every item, so line 1 is refreshed from the
-- quotation each time (holder as patient, its prescription and totals).
create function private.default_quotation_item_line()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.quotation_line_id is null then
    if (select count(*) from public.quotation_lines where quotation_id = new.quotation_id) > 1 then
      raise exception using errcode = '23502', message = 'Indica el par del concepto.';
    end if;
    new.quotation_line_id := private.ensure_first_quotation_line(new.quotation_id);
  end if;
  return new;
end;
$$;

create function private.default_order_item_line()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.order_line_id is null then
    if (select count(*) from public.order_lines where order_id = new.order_id) > 1 then
      raise exception using errcode = '23502', message = 'Indica el par del concepto.';
    end if;
    new.order_line_id := private.ensure_first_order_line(new.order_id);
  end if;
  return new;
end;
$$;

-- Reworks keep the line of the job they repeat; new jobs default to line 1.
create function private.default_production_job_line()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.order_line_id is null then
    if new.original_job_id is not null then
      select order_line_id into new.order_line_id from public.production_jobs where id = new.original_job_id;
    end if;
    if new.order_line_id is null then
      if (select count(*) from public.order_lines where order_id = new.order_id) > 1 then
        raise exception using errcode = '23502', message = 'Indica el par del trabajo.';
      end if;
      new.order_line_id := private.ensure_first_order_line(new.order_id);
    end if;
  end if;
  return new;
end;
$$;

create trigger quotation_items_default_line before insert on public.quotation_items
for each row execute function private.default_quotation_item_line();
create trigger order_items_default_line before insert on public.order_items
for each row execute function private.default_order_item_line();
create trigger production_jobs_default_line before insert on public.production_jobs
for each row execute function private.default_production_job_line();

-- Backfill: line 1 for every quotation and order; concepts and jobs point to it.
insert into public.quotation_lines (quotation_id, organization_id, branch_id, line_number, patient_customer_id, prescription_revision_id, totals, cup_equivalent, warnings)
select id, organization_id, branch_id, 1, customer_id, prescription_revision_id, totals, cup_equivalent, warnings
from public.quotations;

insert into public.order_lines (order_id, organization_id, branch_id, line_number, patient_customer_id, prescription_revision_id, totals, cup_equivalent)
select id, organization_id, branch_id, 1, customer_id, prescription_revision_id, totals, cup_equivalent
from public.orders;

update public.quotation_items item
set quotation_line_id = line.id
from public.quotation_lines line
where line.quotation_id = item.quotation_id and line.line_number = 1;

alter table public.order_items disable trigger order_items_immutable;
update public.order_items item
set order_line_id = line.id
from public.order_lines line
where line.order_id = item.order_id and line.line_number = 1;
alter table public.order_items enable trigger order_items_immutable;

update public.production_jobs job
set order_line_id = line.id
from public.order_lines line
where line.order_id = job.order_id and line.line_number = 1;

alter table public.quotation_items alter column quotation_line_id set not null;
alter table public.order_items alter column order_line_id set not null;
alter table public.production_jobs alter column order_line_id set not null;
