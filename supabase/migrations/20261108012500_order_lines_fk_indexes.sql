-- LEN0006 phase 1 follow-up: cover the composite foreign keys of the pair tables
-- (performance advisor 0001). The single-column patient indexes are replaced.
create index quotation_lines_parent_fk_idx on public.quotation_lines (quotation_id, organization_id, branch_id);
create index order_lines_parent_fk_idx on public.order_lines (order_id, organization_id, branch_id);
create index quotation_lines_patient_fk_idx on public.quotation_lines (patient_customer_id, organization_id, branch_id);
create index order_lines_patient_fk_idx on public.order_lines (patient_customer_id, organization_id, branch_id);

drop index public.quotation_lines_patient_idx;
drop index public.order_lines_patient_idx;
