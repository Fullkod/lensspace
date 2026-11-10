# Wholesale catalog, prices per optician and optician users

Date: 2026-11-09

Decision (Roberto, 2026-11-09). Plan and details: `.titan/plans/prp-wholesale-catalog-account-users.md`.
Business rules: «Venta a ópticas minoristas» in `BUSINESS_LOGIC.md`. Supersedes the patient and
price parts of `2026-11-08-retail-optician-commercial-orders.md`.

- **No patient on a job**: one hidden `customers` row per optician and branch
  (`is_account_patient`), named after the optician, kept in sync by a trigger.
- **Two catalogs**: `catalog_items.sales_channel` is `retail` or `wholesale`, insert-only.
  `calculate_sale_price` refuses the wrong channel. Commercial orders can only use wholesale items.
- **Prices**: base price on the wholesale item. `commercial_account_prices` only stores differences
  (another price, or `is_offered = false`), saved as a whole with `save_commercial_account_prices`.
  Rejected: a full catalog copy per optician, new products and prices would drift.
- **Optician user**: role `account_user` with `branch_id` and `commercial_account_id`. Screen
  `/account-jobs`. It sees jobs, status and what it owes, not payment detail.
- **Security rule**: `account_user` must never pass `private.lock_commercial_order` nor enter
  owner/seller role lists. Its only RPCs are `get_my_account_portal`, `add_my_account_job` and
  `create_my_account_prescription`. Pricing accepts it only inside those RPCs, through
  `private.in_commercial_rpc()`.
- The `lensspace.commercial_rpc` flag lasts the transaction: SQL tests must clear it before
  asserting that a direct call is refused.
- Test: `supabase/tests/retail_optician_users.sql`, `wholesale_catalog.sql`,
  `commercial_job_without_patient.sql`.
- `supabase functions deploy` refuses to run from an agent without the user's explicit OK.
