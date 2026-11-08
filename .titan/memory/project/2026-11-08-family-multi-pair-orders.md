# Family orders: several pairs, one payment (LEN0006)

Date: 2026-11-08

Decision (product owner, validated with Javier): one order can hold 1–10 pairs of glasses
for different patients, with one number, one rate, one balance and one payment ledger.
Plan and learnings: `.titan/plans/prp-family-multi-pair-orders.md`.

- Model: `quotation_lines` / `order_lines` (line_number, patient_customer_id,
  prescription_revision_id, totals, cup_equivalent). Items and `production_jobs` point to
  a line (`order_line_id`, NOT NULL). Pre-existing orders were backfilled as line 1.
  `orders.prescription_revision_id` is kept for compatibility only; readers use the line.
- Sale: `save_multi_line_quotation` / `accept_quotation` price each pair separately
  (`calculate_sale_price` per pair). `save_sale_quotation` is the single-pair wrapper.
- Production: unique current job per (order_line_id, job_type);
  `assign_production_jobs(order, type, provider, line_ids[])` for one or all pairs; the
  3-argument `assign_production_job` only works on single-pair orders. Snapshot carries
  lineNumber/lineCount and never the patient.
- Transitional `BEFORE INSERT` triggers put line-less items/jobs on line 1 and refuse
  multi-pair orders ("Indica el par…"); drop them when no caller relies on them.
- WhatsApp: one message per event to the holder; `{{pairs_summary}}` adds "Pares: N" only
  with 2+ pairs; never patient names.
- `{{balance}}` in messages is always in USD at the sale's frozen rate, rounded up to the
  cent (owner decision 2026-11-08). The app keeps showing the balance in the sale currency.
- Tests: `supabase/tests/multi_pair_orders.sql`, `supabase/tests/production_per_pair.sql`
  (run inside a transaction on production via the Management API, ending in rollback).
