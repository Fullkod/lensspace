# Retail opticians: accounts, prices and accumulative commercial orders (LEN0009 + LEN0010)

Date: 2026-11-08

Superseded in part on 2026-11-09 by `2026-11-09-wholesale-catalog-account-users.md`: jobs no longer ask
for a patient, wholesale has its own catalog, and opticians can have their own users. The exceptional
seller permission now covers every order of the branch (`2026-11-09-special-permission-branch-orders.md`).

Decision (Roberto, 2026-11-08): the organization also sells wholesale to other opticians
that have no LensSpace user. Plan, decisions and learnings:
`.titan/plans/prp-retail-optician-commercial-orders.md`. Business rules: «Venta a ópticas
minoristas» in `BUSINESS_LOGIC.md`.

- Accounts: `commercial_accounts` (owner-only, organization-level) + `commercial_account_prices`
  (fixed price per catalog item). Price rule: fixed price, else the general discount on the
  retail price; surcharges get the discount. `calculate_sale_price(…, target_account_id)`.
- Patients of an account are `customers` with `commercial_account_id`; every branch
  customer reader filters `commercial_account_id is null`.
- Commercial orders live in `orders` with `order_kind = 'commercial'` (no quotation, no
  customer): open ⇄ confirmed → ready → delivered → closed (delivered + paid). Jobs are
  `order_lines` added over days (max 200), frozen when added, soft-removed with reason.
  Delivery whole or per line, on credit. No WhatsApp.
- Writes only through SECURITY DEFINER RPCs that set `lensspace.commercial_rpc`; triggers
  refuse direct writes on commercial orders/lines/items.
- Owner closes/reopens; exceptional seller permission
  `organization_memberships.can_manage_commercial_orders` (Equipo) lets a seller see, change
  status and collect every commercial order of the branch.
- Collections: `record_account_collection` splits one amount across the account's orders as
  normal payments (receiver's cashbox, `payments.collection_id`).
- Screens: `/wholesale` (accounts, prices, debt; owner) and `/wholesale-orders` (+ `/[id]`)
  for owner and sellers. Owner dashboard keeps all sales and adds `wholesaleSalesUsd` /
  `wholesaleOutstandingUsd`; the «Pedidos y cobros» counter is retail only.
- QA data in «Óptica Javier Prueba»: account «Óptica Sol (QA LEN0009)», order
  JAV-2026-000015 (`.titan/qa/2026-11-08-len0009/`).
