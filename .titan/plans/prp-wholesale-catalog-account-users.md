# PRP — Wholesale catalog, prices per optician and retail optician users

> **Status**: IMPLEMENTADO 2026-11-09 (commit `514be14`). Migrations, web and the invitation function are in production. Real-account walkthrough pending.
> **Date**: 2026-11-09
> **Project**: LensSpace
> **Tasknic**: not created yet. Extends LEN0009 + LEN0010 (`prp-retail-optician-commercial-orders.md`).

---

## Objective

Wholesale gets its own product catalog, separate from the retail one. Each retail optician
sees that catalog at its own prices. A job no longer asks for a patient. An optician can
have a user of its own who only adds jobs at the prices already set for it.

## Why

| Problem | Solution |
|---------|----------|
| The job form requires a patient the owner does not want to type. | Hide the field and use a hidden patient named after the optician. |
| Wholesale and retail products are different and cannot mix, but there is one catalog. | `catalog_items.sales_channel`: retail or wholesale, never both. |
| Setting prices per optician is item by item through a dropdown. | One screen with every product and an editable price, base prices that apply by default, and «copy from another optician». |
| Staff must type every job the optician sends. | A restricted user for the optician who adds their own jobs. |

## What

### Success criteria

- [x] Adding a job asks for no patient. The job is stored under a hidden patient named after the optician, and the name follows a rename of the optician.
- [x] The retail catalog, retail sales and their pricing never show or accept wholesale products, and wholesale orders never show or accept retail products.
- [x] The owner creates, edits and deactivates wholesale products in their own screen.
- [x] A new optician can order at once at the wholesale base prices, without any setup.
- [x] In one screen the owner sees every wholesale product for an optician: base price, price for that optician, offered or not. Only the differences are stored.
- [x] The owner can copy prices from another optician in one action.
- [x] A product not offered to an optician does not appear on its jobs and the server refuses it.
- [x] The owner invites a user tied to one optician. That user only sees «Mis trabajos»: add a job, their prices, the jobs of their own optician with their status, and what the optician owes.
- [x] That user cannot change prices (the server refuses `lineAdjustments`) and cannot read other opticians, retail customers or orders, the catalog tables, payment detail, cashbox or production.
- [x] A seller with the special permission adds jobs for every optician, sees what each owes, collects and delivers. A regression test covers it (the code already allows it).
- [ ] Retail sales, family orders, payments, production and WhatsApp behave as today. Works at 390 px. Lint, typecheck and rollback SQL tests pass. *(Regression, lint, typecheck and build pass. Screens were captured at 430 px, not checked at 390 px.)*

### Behaviour

1. **Ópticas minoristas → Catálogo para ópticas** (owner): list of wholesale products with name, category and base price.
2. **Ficha de la óptica → Precios**: a table with one row per wholesale product and an editable price. Empty means base price. Buttons: «Copiar precios de otra óptica». The general % stays as an optional adjustment. The fixed price wins, as today.
3. **Agregar trabajo**: prescription and concepts only, with the optician's prices already applied. Nobody types a price per job unless an authorized staff member adjusts one, as today.
4. **Equipo → Invitar**: new role «Usuario de óptica», with the optician and the branch that receives its jobs.
5. **That user's app**: a single screen. On the first job the server opens the optician's order, at the organization's USD rate, and later jobs join the open order. Once the owner closes it, the next job opens a new one.

---

## Context

### Data model

```sql
alter table catalog_items add column sales_channel text not null default 'retail'
  check (sales_channel in ('retail', 'wholesale'));
-- wholesale items always belong to one organization (organization_id is not null)

alter table commercial_account_prices
  alter column sale_price drop not null,  -- null: base price, row only hides the product
  alter column currency drop not null,
  add column is_offered boolean not null default true;

alter table customers add column is_account_patient boolean not null default false;
-- unique (commercial_account_id, branch_id) where is_account_patient

alter table organization_memberships add column commercial_account_id bigint;
-- role adds 'account_user'; account_user requires branch_id and commercial_account_id
```

Rejected: a full copy of the catalog per optician. A new product would have to be added to
every copy and prices would drift. One catalog plus per-optician differences looks the same
to the user.

### Touch points

- `add_commercial_order_line`: staff still send `patientCustomerId`; the form gets the hidden patient from `ensure_commercial_order_patient`. Channel and not-offered checks live in `calculate_sale_price`. `add_my_account_job` resolves the patient itself and refuses any `lineAdjustments`.
- `get_commercial_price_list`: wholesale items only, honoring `is_offered`.
- `calculate_catalog_price`, `apply_account_prices`: channel check. Their role checks must accept `account_user` when pricing their own account.
- Retail readers to filter: `catalog/page.tsx`, `sales/page.tsx`, `wholesale/page.tsx`.
- `create_prescription_revision`: allow `account_user` only on their account's hidden patient. Do not widen `can_read_branch_clinical_data`.
- `invite-organization-member`, `add_organization_member`, `OrganizationTeamManager`, role labels, `layout.tsx` navigation, `isProviderOnly`/`requireCommercialRole` redirect.
- `private.next_order_number`, `orders.primary_seller_id`: the auto-opened order records the user as creator. It grants them nothing because `can_access_seller_sale` requires the seller role.
- New SECURITY DEFINER readers for the user's screen, returning only prices and job status.

### Facts

- `order_lines.patient_customer_id` and `prescriptions.customer_id` are NOT NULL, hence the hidden patient.
- The current catalog is 13 global items (`organization_id` null). No production organization has wholesale orders except the QA one in «Óptica Javier Prueba».
- `can_access_seller_sale` must stay untouched (see `2026-11-09-special-permission-branch-orders.md`).

---

## Blueprint

1. **Job without patient**: hidden patient, optional parameter, form without the field. Can ship alone.
2. **Wholesale catalog**: column, channel isolation, owner screen.
3. **Prices per optician**: table screen, not-offered products, copy from another optician.
4. **Optician user, backend**: role, invitation, access helpers, readers, RPC restrictions, isolation tests.
5. **Optician user, UI**: invitation option, navigation, «Mis trabajos» at 390 px.
6. **Docs and QA**: `BUSINESS_LOGIC.md`, manual, Playwright evidence in `.titan/qa/`.

## Decisions (Roberto, 2026-11-09)

1. The optician's order opens by itself on the first job, at the organization's USD rate.
2. The optician's user sees its jobs, their status and what the optician owes (balance per order and total). It does not see the payment detail.
3. The optician's user cannot remove a job once added.
4. An optician can have several users, and each optician's jobs enter through one branch.

## Out of scope

Importing prices from Excel, price lists shared between groups of opticians, WhatsApp to the
optician, a payment detail view for the optician's user.

## Implementation status (2026-11-09)

- In production: migrations `20261109130000`, `20261109140000`, `20261109150000`, web (commit `514be14`) and the `invite-organization-member` function.
- Verified: rollback SQL tests (new and regression), typecheck, lint, build, and the real components rendered with mocked data.
- Not verified: the full flow with real logged-in users (create a product, invite, the optician's user adds a job).
- Pending: the saved `manual_documents` row does not include this feature; the default text in `clientDocsInput.ts` does. No wholesale products exist yet, so jobs show nothing to pick until the owner creates them.
- User guide: `_materiales/LensSpace/guias/lensspace-guia-opticas-minoristas.pdf`.

## Learnings

- `add_commercial_order_line` is a thin wrapper over `private.insert_commercial_line`, so the optician's user never needs `private.lock_commercial_order`, which also guards delivery, close and removal.
- `calculate_catalog_price` and `apply_account_prices` check owner/seller. Rather than add the role, they accept `private.in_commercial_rpc()`, otherwise the user could read retail prices directly.
- The optician's screen is `/account-jobs`. On a phone, «Lo que debes» sits inside the collapsed «Resumen» of the page header.
- `create_my_account_prescription` wraps `create_prescription_revision` as definer, so `can_read_branch_clinical_data` stayed untouched. The optician's user cannot attach the prescription image.
- `list_accessible_production_jobs` and similar readers join profiles: see `2026-11-09-special-permission-branch-orders.md`.
- SQL tests: the RPC flag stays on for the rest of the transaction. Clear it before asserting a refusal.
- Old tests mixed one catalog item in retail and account pricing. Fixtures now declare the channel.
