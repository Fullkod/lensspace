# PRP LEN0009 + LEN0010 — Retail opticians: accounts, prices and accumulative commercial orders

> **Status**: APROBADO 2026-11-08 (Roberto, with adjustments A3/A4 below) — EN PROGRESO
> **Date**: 2026-11-08
> **Project**: LensSpace
> **Tasknic**: LEN0009 (accounts and prices), LEN0010 (accumulative orders, delivery, debt). Builds on LEN0006.

---

## Objective

An organization can also sell **wholesale** to other opticians ("ópticas minoristas")
that have no LensSpace user. Each retail optician is a **commercial account** with its
own data, payment terms and price rules (a general % discount plus fixed prices per
item). Staff open a **commercial order** for an account and add prescription jobs over
several days. Only the owner closes the order to send it to production. The order then
goes ready → delivered and can be delivered on credit. Collections go into the normal
cashbox and are applied to one or several orders, and the owner sees the debt per
account.

## Why

| Problem | Solution |
|---------|----------|
| Javier also supplies other opticians. Today he can only sell to a final customer. Recording an optician as a "customer" mixes their patients with his own, and he can't give that optician special prices. | `commercial_accounts` (no user) with price rules. Their patients are kept apart from the branch's customers. |
| A retail optician sends jobs a few at a time during the week and pays at the end or later. Today an order is fixed at acceptance (quotation → immutable snapshot), holds at most 10 pairs, and can't be delivered with a balance. | A commercial order stays **open** while lines are added (each line priced and frozen when added). It is **closed** by the owner and can be delivered with a pending balance. |
| There is no view of "who owes me and how much". | Debt per account (sum of the open balances of its orders) and the account's commercial history. |

**Business value**: one tool for both businesses (retail shop and wholesale lab). No
separate notebook for wholesale jobs and debts, and wholesale jobs still use the same
production, providers and cashbox.

## What

### Success criteria
- [ ] The owner registers a retail optician (name, contact, phone, address, payment terms, notes) **without creating a user**, then edits or archives it. *(LEN0009)*
- [ ] The owner sets a general % discount and fixed prices per catalog item for that account. A line priced for account A gets A's prices; account B and retail sales are unaffected. *(LEN0009)*
- [ ] A seller or the owner opens a commercial order for an account and adds prescription lines on different days. Each line records who added it and when, and its price is frozen at that moment. *(LEN0010)*
- [ ] Only the owner closes the order (it then goes to production) and only the owner reopens it, with a reason. While closed, lines can't be added or removed. Every close, reopen and line removal leaves an audit trail. *(LEN0010)*
- [ ] The order can be marked ready for pickup and then delivered whole or line by line (records who delivered each line), **with or without** a pending balance. *(LEN0010)*
- [ ] The owner can grant a seller the exceptional permission to see every commercial order of the branch, change its status and record collections; without it a seller only sees their own. *(LEN0010)*
- [ ] A collection from an account is recorded once, in the receiver's cashbox, and split across one or several of its orders (oldest first by default). Cashbox closures are unchanged. *(LEN0010)*
- [ ] The owner sees the list of accounts with a pending balance, and per account the history of orders, deliveries and payments. *(LEN0009 + LEN0010)*
- [ ] Retail sales, family orders, payments, production and every existing message behave exactly as today. Commercial orders send no WhatsApp in v1.
- [ ] RLS: sellers only see their own commercial orders. Account prices and debts are owner-only. Providers see the job and the prescription, never the account, prices or payments. Rollback SQL tests cover pricing, lifecycle, multi-order payment and isolation.
- [ ] Works at 390 px. `npm run lint`, `npm run typecheck`, `npm run build` and `supabase db lint` pass.

### Expected behaviour (happy path)

1. **Ópticas** (new owner screen under Ventas): "Nueva óptica" → name, contact person,
   phone, address, payment terms (free text + optional days of credit), notes. Tab
   **Precios**: "Descuento general 15 %" + "Precios fijos" (pick a catalog item →
   price and currency). The catalog price is shown next to each one.
2. **Pedidos a ópticas** → "Nuevo pedido" → pick the account → the order is created
   **open** (`OJV-2026-000020`, "Abierto · 0 trabajos"). One exchange rate per order,
   frozen at creation, as in retail.
3. "Agregar trabajo" → patient (search the account's patients or "Nuevo paciente": name
   only), prescription, concepts → price preview with the account's prices → "Agregar".
   The line is frozen (number, patient, prescription, concepts, prices, "agregado por
   Ana · 8 nov 10:20"). The order total grows. Two days later the same seller (or the
   owner, see assumption A3) adds more lines to the same open order. A line can be removed while the order is open and has no production job,
   with a reason.
4. Owner: "Cerrar y mandar a fabricar" → status **Cerrado** (closed by, at). Production
   assignment works per line exactly like LEN0006 ("Asignar a todos los trabajos").
   If a job was forgotten: "Reabrir" (owner, reason) → open → add line → close again.
   Lines already in production stay untouched.
5. When the production is ready, "Marcar listo para recoger" → **Listo**. Then
   "Entregar" → **Entregado** (delivered by, at). If there is a balance, the dialog
   says "Queda pendiente 120,00 USD a cuenta de Óptica Sol" and lets it go on credit.
6. **Cobrar a la óptica** (from the account): amount and currency → the system proposes
   an allocation to the oldest open balances first, editable per order → "Registrar".
   One payment row per order is inserted in the receiver's cashbox, grouped by one
   collection id. When an order's balance reaches zero and it is delivered, it becomes
   **Pagado / cerrado**.
7. **Ópticas** list shows each account's pending balance (USD, each order at its own
   rate). The account page shows its orders, deliveries and collections.

---

## Context

### Current model (verified 2026-11-08)

| Piece | Today | Where |
|-------|-------|-------|
| Order origin | Always from an accepted quotation: `orders.quotation_id` NOT NULL unique, `accept_quotation` snapshots `order_lines` + `order_items` + `order_confirmations`, all immutable. | `20261108020000_multi_line_quotations.sql` |
| Lines | `order_lines` 1–10 (`line_number` check), `patient_customer_id` NOT NULL, per-line totals. `orders.totals` / `cup_equivalent` = sum. | `20261108011000_order_lines_foundation.sql` |
| Statuses | `commercial_status` accepted → delivered → closed. `payment_status` unpaid/partial/paid. `guard_order_commercial_transition` blocks delivery with a balance. | `20260913155559` |
| Payments | `payments` per order, cash, CUP/USD at the order rate, `cashbox_id` of the receiver. `private.prepare_cash_payment` blocks overpayment and closed orders. | `20261107021257` |
| Pricing | `calculate_catalog_price` (per line since LEN0006) → catalog `sale_price` or `catalog_item_overrides` (per organization, unused), graduation surcharges, `line_adjustments` with reason. | `20261108020000` |
| Production | Per line: `assign_production_jobs(order, type, provider, line_ids[])`. The snapshot has no patient identity. | `20261108040000` |
| Notifications | Triggers on order insert, payment insert and delivery → WhatsApp to `orders.customer_id`. | `20260920224027`, `20261106231220` |
| Visibility | Sellers only see their own orders (`primary_seller_id`). Customers are shared per branch. | `can_write_seller_sale`, RLS |

### Alternatives considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A. Same `orders` table with `order_kind = 'commercial'`** | Production per line, payments, cashbox, closures, history and providers reused as-is. One order number series. | `quotation_id` and `customer_id` become nullable for that kind. Guards and readers gain a branch on the kind. | **Recommended** |
| B. Separate `commercial_orders` / lines / payments tables | No risk to retail. | Duplicates production assignment, cashbox, closures and provider views. Two ledgers to reconcile. | Rejected |
| C. Retail optician = a `customers` row + one quotation per batch | Zero schema work. | Mixes their patients with the shop's own, gives no special prices, can't accumulate, can't deliver on credit, and has no debt view. | Rejected |

### Data model (sketch — final SQL in each phase)

```sql
-- LEN0009: retail optician without a user. Organization-level, like the catalog.
create table public.commercial_accounts (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  contact_name text, phone text, email text, address text,
  payment_terms text check (payment_terms is null or char_length(payment_terms) <= 300),
  credit_days smallint check (credit_days is null or credit_days between 0 and 365),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 90),
  notes text,
  created_by uuid not null, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create table public.commercial_account_prices (           -- fixed price per item
  account_id bigint not null, organization_id bigint not null,
  catalog_item_id bigint not null references public.catalog_items(id),
  sale_price numeric(12,2) not null check (sale_price >= 0),
  currency text not null check (currency in ('CUP','USD')),
  changed_by uuid not null, changed_at timestamptz not null default now(),
  primary key (account_id, catalog_item_id),
  foreign key (account_id, organization_id) references public.commercial_accounts(id, organization_id) on delete cascade
);

-- Patients of a retail optician stay apart from the shop's customers.
alter table public.customers add column commercial_account_id bigint;   -- null = own customer

-- LEN0010: orders gain a kind and the account.
alter table public.orders
  add column order_kind text not null default 'retail' check (order_kind in ('retail','commercial')),
  add column commercial_account_id bigint,
  add column closed_by uuid, add column closed_at timestamptz,
  add column ready_at timestamptz, add column ready_by uuid,
  alter column quotation_id drop not null,
  alter column customer_id drop not null;
-- check: retail ⇒ quotation_id and customer_id not null, account null;
--        commercial ⇒ account not null, quotation_id and customer_id null.
-- commercial_status gains 'open', 'confirmed', 'ready' (only for commercial orders):
--   commercial: open ⇄ confirmed → ready → delivered → closed
--   retail:     accepted → delivered → closed   (unchanged)
alter table public.order_lines
  add column added_by uuid, add column added_at timestamptz,
  add column removed_at timestamptz, add column removed_by uuid, add column removal_reason text,
  add column delivered_at timestamptz, add column delivered_by uuid;   -- partial delivery (A4)
alter table public.organization_memberships
  add column can_manage_commercial_orders boolean not null default false;  -- exception (A3)
-- line_number limit: 10 for retail, 200 for commercial (check per kind via trigger).
alter table public.payments add column collection_id uuid;   -- groups a multi-order collection
```

Rules:
- **Pricing**: `private.price_for_account(account, item)` = account fixed price if it
  exists. Otherwise catalog/override price × (1 − discount %). Graduation surcharges
  get the % discount but are not replaced by the fixed price. Manual line adjustments
  with a reason still work. The applied rule is stored in the line snapshot
  (`priceSource: account_fixed | account_discount | catalog`).
- **Lines are immutable once added** (same trigger family as `order_items`). "Removing"
  a line is a soft delete (`removed_*`) that is only allowed while the order is `open`
  and the line has no production job. Totals are recomputed from non-removed lines.
- **Close / reopen**: owner only (`private.is_org_owner`). Reopening needs a reason of at
  least 5 characters and is allowed from `confirmed` only. Each transition writes an
  `audit_events` row (actor, reason, line count, total).
- **Delivery guard**: the "no balance" rule stays for retail. Commercial orders may be
  delivered with a balance. The order becomes `closed` automatically when it is
  delivered **and** paid (retail keeps its current manual close).
- **Payments**: `record_account_collection(account, amount, currency, allocations jsonb,
  request_id)` inserts one `payments` row per allocated order, all sharing
  `collection_id`, through `prepare_cash_payment` (rate per order, overpayment guard).
  Cashbox and closures are untouched because they already sum `payments`. Retry-safe
  with `client_request_id`.
- **Notifications**: the existing triggers skip `order_kind = 'commercial'`. No
  WhatsApp in v1 (see decision D5).
- **Money in USD**: every amount is shown in USD at each order's frozen rate. Stored
  currency unchanged (`2026-11-08-money-shown-in-usd`).
- **Analytics**: retail KPIs keep counting retail orders only. The owner dashboard adds
  "Ventas a ópticas" and "Por cobrar a ópticas". The cashbox shows every payment, as
  today.

### Proposed architecture (feature-first)

```
supabase/migrations/
  <ts>_commercial_accounts.sql          # accounts, prices, customers.commercial_account_id, RLS, pricing fn
  <ts>_commercial_orders_foundation.sql # orders kind/account, statuses, line audit columns, guards, notification skip
  <ts>_commercial_order_rpcs.sql        # open, add/remove line, close, reopen, ready, deliver
  <ts>_account_collections.sql          # payments.collection_id, record_account_collection, debt readers
supabase/tests/commercial_accounts.sql  # rollback-only
supabase/tests/commercial_orders.sql    # rollback-only
src/features/wholesale/                 # new feature (accounts, prices, commercial orders, collections)
  components/ AccountsList, AccountForm, AccountPrices, CommercialOrderDetail,
              AddJobDialog (reuses PairEditor pieces), CollectionDialog, AccountStatement
  services/   actions.ts, queries.ts
  types/
src/app/(main)/wholesale/               # /wholesale (accounts), /wholesale/[accountId], orders inside
src/features/production/                # badge "Óptica Sol" for the owner only; providers see nothing new
```

No new dependencies.

### Assumptions (stated, change them if wrong)

- **A1**: accounts and prices are organization-level. Each commercial order belongs to
  one branch (stock, cashbox and production are per branch).
- **A2**: "borrador" and "abierto" are one status (`open`). "En preparación" is derived
  from production, not stored. "Pendiente de pago / pagado" is the existing
  `payment_status`.
- **A3 (approved + exception)**: a commercial order is visible to its creator
  (`primary_seller_id`) and to the owner. As an **exceptional** permission, the owner
  can mark a seller with `organization_memberships.can_manage_commercial_orders`: that
  seller sees every commercial order of their branch, adds lines, changes their status
  (close, reopen, ready, deliver) and records collections. Accounts and prices stay
  owner-only. Granting/revoking the permission is audited.
- **A4 (changed)**: delivery can be the whole order or **line by line**. Each line has
  `delivered_at` / `delivered_by`; the order becomes `delivered` when every
  non-removed line is delivered. Partial deliveries are allowed in `confirmed` or
  `ready`, with or without balance.
- **A5**: the account's patients get a `customers` row (needed for prescriptions), with
  the account's phone and WhatsApp off, hidden from the branch's customer list.

### Decisions (Roberto, 2026-11-08)

1. D1 — Lines are prescription jobs only (patient + prescription, go to production). No loose products.
2. D2 — Prices: general % per account + fixed price per item. The fixed price wins.
3. D3 — Collection: delivery on credit allowed. Collections enter the receiver's cashbox and are applied to one or several orders. Debt is shown per account.
4. D4 — Seller and owner create and add lines. Only the owner closes (to production) and reopens, with a reason and an audit trail.
5. D5 — No WhatsApp for commercial orders in v1 (confirmed).
6. D6 — Up to 200 lines per commercial order; retail stays at 10 (confirmed).
7. D7 — Exceptional seller permission to manage every commercial order of the branch (see A3).
8. D8 — Partial delivery per line allowed (see A4).

### Out of scope

Retail optician users or a portal, loose product lines, invoices or
statements in PDF, credit limits that block new orders, interest or due-date alerts,
returns or credit notes, WhatsApp to the account, moving a line between orders.

---

## Blueprint (Assembly Line)

> Phases only. Subtasks are generated when entering each phase.

### Phase 1: Business logic and commercial accounts (LEN0009)
**Objective**: `BUSINESS_LOGIC.md` section "Venta a ópticas minoristas". `commercial_accounts` + `commercial_account_prices` with RLS (owner writes, owner reads prices). `customers.commercial_account_id` (hidden from the branch customer list). Owner screen for listing, creating, editing and archiving accounts and their prices.
**Validation**: `supabase/tests/commercial_accounts.sql` (owner CRUD, seller can't read prices, cross-org isolation); Playwright at 390 px; lint and typecheck.

### Phase 2: Account pricing
**Objective**: `calculate_catalog_price` takes an optional account → fixed price, else % discount, surcharges discounted, `priceSource` in the snapshot. Retail path unchanged.
**Validation**: SQL test: same item priced for A (fixed), B (discount) and retail (catalog). Retail result identical to before for every existing catalog item.

### Phase 3: Commercial order foundation and lifecycle (LEN0010)
**Objective**: `order_kind`, nullable quotation/customer with checks, new statuses and transition guard, line audit columns and soft removal, kind-aware line limit, notification triggers skip commercial. RPCs: open, add line, remove line, close, reopen, ready, deliver whole or selected lines (with balance allowed), auto-close when every line is delivered and the order is paid. Exceptional seller permission (A3) in the access helper and the team screen.
**Validation**: `supabase/tests/commercial_orders.sql`: accumulate lines over "days" (fixtures), seller can't close, owner reopens with reason, closed order rejects add/remove, line with a job can't be removed, delivery with balance OK for commercial and still blocked for retail, no notification attempt created. Existing retail orders unchanged.

### Phase 4: Commercial orders UI and production
**Objective**: account → orders list and detail (status, lines with "agregado por", totals in USD), "Agregar trabajo" reusing the pair editor with account prices, close, reopen, ready and deliver dialogs. Production assignment per line works for commercial orders. Providers see "Trabajo N" only.
**Validation**: Playwright e2e on «Óptica Javier Prueba»: open → 2 lines on different sessions → close → assign → ready → deliver with balance; 390 px and desktop; provider view checked.

### Phase 5: Collections and debt
**Objective**: `payments.collection_id`, `record_account_collection` (FIFO proposal, editable allocation, retry-safe), account statement (orders, deliveries, collections), "Por cobrar" list, dashboard figures.
**Validation**: SQL test: one collection split across 3 orders (CUP and USD), overpayment rejected, retry returns the same collection, cashbox closure totals include it. UI e2e: collect → balances and cashbox correct.

### Phase 6: Readers, types and documentation
**Objective**: orders inbox, search, history, organization activity and KPIs aware of the kind; `database.types.ts` regenerated; manual (plain Cuban Spanish); memory entry; Tasknic closing comments.
**Validation**:
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] `supabase db lint` and advisors clean
- [ ] Success criteria met

---

## Learnings (Self-Annealing)

> Grows with every error found during implementation.

### 2026-11-08: Phase 1 — accounts and prices shipped to the database
- **Done**: `20261108170000_commercial_accounts.sql` (pushed with the CLI because of the price `for delete` policy): `commercial_accounts`, `commercial_account_prices` (item must be global or the org's own, stamp forced by trigger), `customers.commercial_account_id` with a guard trigger (only the owner links until LEN0010 adds the patient RPC). Writes are direct table writes with column grants, like `catalog_item_overrides`.
- **Tests**: `supabase/tests/commercial_accounts.sql` passed before (with the migration) and after the push, rolled back; advisors show nothing new.
- **UI**: `/wholesale` «Ópticas minoristas» (owner + `optical_sales`): list, create/edit, archive/restore, prices dialog. Branch customer readers (customers, prescriptions, sales pickers, duplicate check) filter `commercial_account_id is null`.
- **Decision in code**: sellers can't read accounts yet (discount is price data). LEN0010 adds a names-only reader for sellers.
- **Browser QA** (Playwright, 390 px + desktop): `.titan/qa/2026-11-08-len0009/`. QA account «Óptica Sol (QA LEN0009)» (id 5, org 2) kept for the next phases.

### 2026-11-08: Phase 2 — account pricing
- **Done**: `20261108180000_commercial_account_pricing.sql`. `private.apply_account_prices(pricing, org, account, rate)` (SECURITY DEFINER: sellers get account prices without reading the owner-only table) rewrites the catalog engine result: fixed price → `account_fixed`, else discount → `account_discount`; surcharges discounted; each line keeps `catalogAmount/catalogCurrency`. `calculate_sale_price` gained `target_account_id default null` (drop + create; body identical to `20260921015206`, verified by md5 of the live source), so manual adjustments and the 10 % owner rule measure against the account price.
- **Tests**: `supabase/tests/commercial_account_pricing.sql` + LEN0006 `multi_pair_orders.sql` (retail unchanged) passed before and after the push. Smoke on org 2: retail 50 USD + 3000 CUP → QA account 42,50 USD (fixed) + 2700 CUP (−10 %).
- **Aplicar en**: phase 3 add-line RPC calls `calculate_sale_price(…, adjustments, account)` per line.

### 2026-11-08: Phase 3 — commercial order foundation and lifecycle
- **Done**: `20261108190000_commercial_orders.sql`. `orders.order_kind` + `commercial_account_id`, `closed_*`, `ready_*`, `client_request_id`; `quotation_id`/`customer_id` nullable with `orders_kind_shape_check`; statuses `open/confirmed/ready` for commercial only. `order_lines` gains `added_*`, `removed_*`, `delivered_*`, `client_request_id`; line limit 200. `organization_memberships.can_manage_commercial_orders` + `set_commercial_orders_permission` (owner, audited) + policy `orders_select_commercial_manager`. RPCs: `list_commercial_accounts_for_orders`, `open_commercial_order`, `create_commercial_patient`, `add_commercial_order_line`, `remove_commercial_order_line`, `close_/reopen_commercial_order`, `mark_commercial_order_ready`, `deliver_commercial_order_lines` (whole or by line, credit allowed). Notification triggers on orders now `when (new.order_kind = 'retail')`; `notify_payment_received` skips commercial; `refresh_order_payment_status` closes a delivered commercial order once paid.
- **Pattern**: every commercial write goes through SECURITY DEFINER RPCs that set `lensspace.commercial_rpc = on` (transaction-local). Triggers refuse direct writes on commercial orders/lines/items unless that flag is on or the write is nested in another trigger (`pg_trigger_depth() > 1`, e.g. the payment status refresh). `order_lines_immutable` now allows only the removal/delivery stamps, and only from the RPCs.
- **Error**: in a single-transaction SQL test the flag stays on after the first RPC, so "direct write refused" checks passed silently. **Fix**: the test clears it (`set_config('lensspace.commercial_rpc', '', true)`) before each direct-write check, as a new PostgREST request would. **Aplicar en**: any test of a transaction-local flag.
- **Tests**: `supabase/tests/commercial_orders.sql` (retry-safe open/add, account prices, foreign patient, direct writes refused, seller without permission can't see/close, owner grants permission, closed refuses lines, reopen with reason, soft removal restores totals, partial and full delivery on credit, no reopen after delivery, cross-org, no WhatsApp dispatch, 8 audit events) + regression `multi_pair_orders`, `production_per_pair`, `cashbox_closures`, `phase6_history_analytics_notifications`, phases 1–2 tests: all passed before and after the push.
- **Pre-existing**: `supabase/tests/production_provider_workflows.sql` fails on production with or without this migration («Par no encontrado en este pedido.»): it predates LEN0006 pairs. Not touched.
- **Pending for phase 4**: advisors ask for composite indexes on the new FKs and flag two permissive SELECT policies on `orders` (merge them); `assign_production_jobs` uses `can_write_seller_sale` (a permitted seller on another seller's commercial order is refused) and must refuse open commercial orders; `notify_order_ready` must not be offered for commercial orders; retail readers inner-join `customers`, so commercial orders don't show in `/orders` until phase 6.

---

## Gotchas

- [ ] `orders.quotation_id` / `customer_id` NOT NULL: every reader that joins `customers` on `orders.customer_id` (inbox, detail, notifications, optometrist summary, activity) needs a left join or a kind branch.
- [ ] Dry runs that insert `orders` or `payments` fire WhatsApp triggers: the notification skip must ship **before** any commercial insert, and tests stay rollback-only (PRP LEN0006 learnings).
- [ ] `order_lines.line_number` check is 1–10: replace it with a kind-aware check before allowing more than 10 commercial lines.
- [ ] `prepare_cash_payment` rejects `commercial_status = 'closed'`. A commercial order closes only once it is fully paid, so this is fine, but it must not reject `open`/`confirmed`/`ready`.
- [ ] `guard_order_commercial_transition` hard-codes the retail transitions. Branch on `order_kind` and keep the retail messages identical.
- [ ] The Supabase MCP auto-declines destructive SQL: use the CLI for migrations that drop or replace constraints (`reference/2026-11-07-supabase-mcp-destructive-sql.md`).
- [ ] The transitional `default_*_line` triggers from LEN0006 put lineless inserts on line 1. Commercial RPCs always pass the line explicitly.
- [ ] Every view works on mobile. Account prices are a list of cards, not a wide table.

## Anti-patterns

- Do NOT create a second payments ledger or cashbox for wholesale.
- Do NOT model a retail optician as a `customers` row or give it a user.
- Do NOT let account prices touch `catalog_items` or `catalog_item_overrides`.
- Do NOT expose account, prices or payments to providers or to other sellers.
- Do NOT change retail messages, totals, statuses or screens.
- Do NOT add dependencies or ignore TypeScript errors.

---

*Approved 2026-11-08. Implementation in progress.*
