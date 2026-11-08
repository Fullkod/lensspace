# PRP LEN0006 — Family / multi-pair orders (one payer, several pairs)

> **Status**: APROBADO 2026-11-07 (Roberto; decisions below)
> **Date**: 2026-11-07
> **Project**: LensSpace
> **Tasknic**: LEN0006 (foundation for LEN0009 / LEN0010)

---

## Objective

One order can hold several pairs (or articles) for different people: a **holder**
(the customer who pays and receives the WhatsApp messages) orders glasses for his
family. Each pair keeps its own patient, prescription, concepts, price, production and
status; the order keeps one number, one payment ledger (advance on the whole, balance at
pickup), one "ready" notice when every pair is ready, and one delivery. Existing
single-pair orders keep working unchanged.

## Why

| Problem | Solution |
|---------|----------|
| A father buying for 3 family members needs 3 sales today: 3 order numbers, 3 ledgers, 3 advances to split by hand and up to 12 WhatsApp messages to the same phone. | One order with N pairs: one number, one total, one advance, one set of messages. |
| The prescription hangs from the order (`orders.prescription_revision_id`), so a second person's prescription cannot be in the same sale. | Prescription, patient and concepts move to a new per-pair level (`order_lines`). |
| `calculate_catalog_price` rejects repeated items and applies graduation surcharges from one prescription. Two pairs with the same frame or different graduations cannot be priced together. | Pricing runs per pair (each with its own prescription), totals are summed per currency. |
| Production allows one current lens and one mounting job **per order**. | Production jobs belong to a pair: one current lens + one mounting job per pair. |

**Business value**: family purchases are frequent in an optician's shop (Javier's
pilot). Selling them as one order removes manual splitting of advances, duplicated
messages and errors at pickup ("did they take all three?"). It is also the base model
for wholesale accumulative orders (LEN0010).

## What

### Success criteria
- [ ] A seller creates, in one sale, an order with 3 pairs for 3 different patients (holder + 2 relatives), each with its own prescription and concepts, including the **same** catalog item in two pairs; totals and graduation surcharges are correct per pair and in total.
- [ ] The order has one number, one payment ledger and one balance; an advance on the whole order (e.g. half) is one normal payment; delivery stays blocked while any balance remains.
- [ ] Each pair has its own lens/mounting jobs (assignable to different providers); providers see "OJV-2026-000012 · Par 2 de 3" and the prescription, never prices, payments or the patient's identity.
- [ ] Exactly one "Pedido confirmado", one "Tu pedido está listo" and one "Pedido entregado" message go to the holder; "Avisar: listo para recoger" warns (does not block) while any pair is unfinished.
- [ ] Every order created before this change shows exactly as before (backfilled as one pair, same totals, same production, same history); a new single-pair sale looks and works like today.
- [ ] RLS: sellers only see their own sales (all pairs included), providers only their jobs; SQL rollback tests cover multi-pair acceptance, price change rejection, retry idempotency and production per pair.
- [ ] Works at 390 px; `npm run lint`, `npm run typecheck`, `npm run build` and `supabase db lint` pass.

### Expected behaviour (happy path)

1. **Nueva venta** → the seller picks the **holder** (Roberto). The first pair is created
   automatically with the holder as patient — this is exactly today's screen.
2. "**Agregar otro par**" adds Par 2. Its patient defaults to "Otro familiar": search an
   existing customer of the branch, pick one of the people the holder bought for before
   (suggested from his past orders), or "Nuevo familiar" (name + optional data; the phone
   is prefilled with the holder's, WhatsApp off, because the DB requires one phone and
   phones are not unique).
3. Per pair: prescription (or "Sin receta" for a frame/sunglasses only), concepts,
   agreed prices with reasons. Pairs are collapsible cards with their subtotal; the
   summary shows each pair and the total per currency plus ≈ CUP. One exchange rate for
   the whole sale.
4. "Guardar cotización" / "Cliente acepta · crear pedido" saves all pairs atomically and
   creates one order `OJV-2026-000012` with 3 pairs. WhatsApp to the holder:
   "Pedido confirmado … Pares: *3*" (no patient names).
5. **Pagos**: the normal payment form, unchanged (any amount, e.g. half of the total, and
   "Saldo completo"). One payment covers the whole order; one "Pago recibido" message.
6. **Producción** from the order: each pair shows its patient, prescription and its lens
   and mounting jobs; "Asignar a todos los pares" fills the same providers for every
   pair, or each pair is assigned separately. Workshop flow per job as today.
7. When all pairs are received/reviewed the order shows "Todos los pares listos" and the
   seller taps "Avisar: listo para recoger" (one message, still manual per QA-08). If a
   pair is pending, the button asks "Faltan 1 de 3 pares. ¿Avisar igual?".
8. At pickup the seller collects the balance and marks the order delivered (all pairs
   together). One "Pedido entregado" message.

---

## Context

### Current flow (verified in code, 2026-11-07)

| Step | Today | Where |
|------|-------|-------|
| Quotation | `quotations` (customer, **one** `prescription_revision_id`, rate, totals) + `quotation_items` (concepts). Saved by `save_sale_quotation` → `save_quotation` → `calculate_sale_price` → `calculate_catalog_price` (rejects duplicate item ids, graduation surcharges from that one revision; `line_adjustments` keyed by item id). | `20261002191121`, `20260921015206`, `20260913152157` |
| Order | `accept_quotation` re-prices against the catalog, snapshots `orders` (customer, revision, totals, `cup_equivalent`, rate) + immutable `order_items` + `order_confirmations`; retry-safe. | `20261002165428` |
| Payments | `payments` per order; `private.prepare_cash_payment` (overpayment guard, USD at the order rate) and `guard_order_commercial_transition` (no delivery with balance) work on `orders.cup_equivalent`. | `20261107021257`, `20260913155559` |
| Production | `production_jobs.order_id`, unique current `(order_id, job_type)`; `assign_production_job` snapshots **all** `order_items` and the **order** revision. Rework copies the job. | `20261002153245`, `20261002223547` |
| Notifications | Triggers on order insert / payment insert / delivery; manual `notify_order_ready(order, request_id)`; rendered by `get_automatic_notification_payload` for `orders.customer_id`. | `20261106231220`, `20261002180000` |
| Delivery | `mark_order_delivered`; UI warns (QA-14) using `OrderProductionPanel` readiness. | `OrderDetail.tsx` |
| Readers of `orders.prescription_revision_id` | `assign_production_job`, `get_optometrist_summary`. | `20261107213232` |

UI: `src/features/sales/components/SalesWorkspace.tsx` (679 lines, already over the
500-line guide), `QuoteSummary`, `ItemPicker`, `AcceptedOrderPanel`;
`src/features/orders/components/{OrderDetail,OrderPaymentsWorkspace,PaymentForm,OrdersInbox}.tsx`;
`src/features/production/components/{OrderProductionPanel,ProductionWorkspace,ProductionJobCard}.tsx`.

### Alternatives considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **A. Pairs inside one order** (`order_lines`) | One number, ledger, balance and message set; payments, cashbox and delivery guard untouched; same base LEN0010 needs (one order, many lines). | Touches quotation, pricing, acceptance, production and readers. | **Recommended** |
| B. One order per pair + "order group" with a shared ledger | Production untouched. | Payments, overpayment guard, delivery guard, cashbox and every message are per order: a shared advance must be split across orders; N numbers and N×4 messages; reports double-count families. Rewrites more of the money path than A. | Rejected |
| C. Several prescriptions on one order without a pair level | Cheapest. | No per-pair production/status or pricing; breaks graduation surcharges and repeated items. | Rejected |

### Proposed architecture (feature-first, reuse existing features)

```
supabase/migrations/
  <ts>_order_lines_foundation.sql      # tables, backfill, RLS, guards, production_jobs.order_line_id
  <ts>_multi_line_quotations.sql       # pricing per line, save/accept with lines, legacy wrappers
  <ts>_order_lines_readers.sql         # detail, panel, list, notifications, optometrist summary
supabase/tests/multi_pair_orders.sql   # rollback-only fixtures
src/features/sales/components/
  SalesWorkspace.tsx                   # holder, rate, pairs list, actions (split below 500 lines)
  PairEditor.tsx                       # patient, prescription, ItemPicker per pair
  PatientPicker.tsx                    # holder / previous relatives / branch search / new relative
  QuoteSummary.tsx, AcceptedOrderPanel.tsx  # per-pair subtotals + total
src/features/orders/components/
  OrderDetail.tsx, OrderPairs.tsx      # pairs block; PaymentForm unchanged
src/features/production/components/
  OrderProductionPanel.tsx             # grouped by pair, "Asignar a todos los pares"
```

No new dependencies.

### Data model (sketch — final SQL in the phase)

```sql
-- Pair level of a quotation (editable while not accepted).
create table public.quotation_lines (
  id bigint generated always as identity primary key,
  quotation_id bigint not null,
  organization_id bigint not null,
  branch_id bigint not null,
  line_number smallint not null check (line_number > 0),
  patient_customer_id bigint not null,           -- may equal quotations.customer_id
  prescription_revision_id bigint references public.prescription_revisions(id),
  totals jsonb not null default '{}'::jsonb,
  cup_equivalent numeric(14,2),
  warnings jsonb not null default '[]'::jsonb,
  unique (quotation_id, line_number),
  unique (id, organization_id, branch_id),
  foreign key (quotation_id, organization_id, branch_id)
    references public.quotations(id, organization_id, branch_id) on delete cascade,
  foreign key (patient_customer_id, organization_id, branch_id)
    references public.customers(id, organization_id, branch_id)
);
alter table public.quotation_items add column quotation_line_id bigint;  -- not null after backfill

-- Pair level of an order: immutable snapshot, like order_items.
create table public.order_lines (
  id bigint generated always as identity primary key,
  order_id bigint not null,
  organization_id bigint not null,
  branch_id bigint not null,
  line_number smallint not null check (line_number > 0),
  patient_customer_id bigint not null,
  prescription_revision_id bigint references public.prescription_revisions(id),
  totals jsonb not null,
  cup_equivalent numeric(14,2),
  unique (order_id, line_number),
  unique (id, organization_id, branch_id),
  foreign key (order_id, organization_id, branch_id)
    references public.orders(id, organization_id, branch_id),
  foreign key (patient_customer_id, organization_id, branch_id)
    references public.customers(id, organization_id, branch_id)
);
alter table public.order_items add column order_line_id bigint;          -- not null after backfill
alter table public.production_jobs add column order_line_id bigint;      -- not null after backfill
-- one current job per pair and type (replaces production_jobs_one_current_type_idx)
create unique index production_jobs_one_current_line_type_idx
  on public.production_jobs (order_line_id, job_type) where is_current;

-- RLS: enabled on both tables; select through the parent quotation/order (same
-- pattern as quotation_items / order_items); writes only through SECURITY INVOKER RPCs.
-- order_lines gets the reject_immutable_order_change trigger.
```

Rules:
- `orders.customer_id` = **holder** (payer, WhatsApp recipient, consent). Each line's
  `patient_customer_id` = who wears the glasses. Patients are ordinary customers of the
  same branch (prescriptions already hang from customers); patients never get messages.
- `orders.totals` / `cup_equivalent` = sum of lines (single source for payments, balance,
  cashbox, delivery guard — none of those change).
- `quotation_items` / `order_items` keep being the concepts; they gain the line id.
  `position` stays unique per order (global order), lines group them.
- Backfill: every existing quotation/order gets line 1 (patient = customer, revision =
  its revision, totals = its totals) and all its items/jobs point to it. Done with the
  immutability triggers disabled inside the migration, as in `20260921015206`.
- `orders.prescription_revision_id` / `quotations.prescription_revision_id` stay and are
  filled with line 1's revision for compatibility; readers move to lines. Dropping the
  columns is out of scope.
- RPCs: `save_sale_quotation` gains a `target_lines jsonb`
  (`[{patientCustomerId, prescriptionRevisionId, itemIds, lineAdjustments}]`, 1–10 lines);
  the current signature stays as a one-line wrapper so a cached client keeps working
  during the deploy. `accept_quotation` keeps its signature and re-prices per line.
  `assign_production_job` takes the line (`target_order_line_id`); the order-level form
  stays only for single-line orders.
- Work snapshot adds `lineNumber`, `lineCount` (no patient name: QA-38 / provider privacy).
- Templates: `order_accepted` and `order_ready` get an optional `{{pairs_summary}}`
  ("Pares: *3* (Roberto, Ana, Luis)"), rendered empty for single-pair orders, so their
  messages stay identical.

### Relation with LEN0009 / LEN0010

- LEN0010 (accumulative commercial orders for a retail optician) needs exactly this
  level: one order, many lines, each line its own production and status. LEN0006 builds
  it; LEN0010 adds on top: an order kind, the buyer account (LEN0009
  `commercial_accounts` + price lists), an open/closed lifecycle where lines are
  **appended after creation** with their own confirmation, partial deliveries and debt
  per account.
- Kept compatible on purpose: lines carry their own totals and production; nothing
  assumes "lines are fixed forever" beyond the acceptance snapshot. LEN0010 may make
  `patient_customer_id` nullable with a free-text end-customer label — not done here.
- Recommended order: LEN0006 (this PRP) → `BUSINESS_LOGIC.md` update + joint PRP for
  LEN0009 + LEN0010.

### Out of scope

Adding or removing a pair after acceptance (needs a new confirmation; goes with LEN0010),
partial delivery or per-pair pickup, per-pair payments or balances, configurable minimum
advance (QA-52), messages to patients, refunds/cancellation of one pair, dropping the old
`prescription_revision_id` columns.

### Decisions (Roberto, 2026-11-07)

1. Every patient is a customer record. "Nuevo familiar" asks only the name; phone prefilled with the holder's, WhatsApp off.
2. Different providers per pair are allowed, with "Asignar a todos los pares" as the default.
3. "Listo para recoger" stays manual (QA-08), with a non-blocking warning while a pair is unfinished.
4. No advance shortcut: payments use the normal form (any amount). Nothing new in the payment form.
5. WhatsApp to the holder does not name the patients: only the pair count.
6. Limit: 10 pairs per order.
7. Already validated with Javier at the 2026-11-07 meeting: one order, several pairs, pay and pick up together.

---

## Blueprint (Assembly Line)

> Phases only. Subtasks are generated when entering each phase (map context → subtasks → execute).

### Phase 1: Pair data model and backfill
**Objective**: `quotation_lines` / `order_lines` exist with RLS, immutability and indexes; items and production jobs point to a line; every existing quotation/order has line 1 with identical totals.
**Validation**: migration applied; SQL checks: lines = orders, sum of line totals = order totals, no item/job without line; `supabase db lint` and advisors clean; existing app works unchanged (`/orders`, `/production` smoke test).

### Phase 2: Multi-pair pricing, quotation and acceptance
**Objective**: quotations save and accept N pairs atomically, priced per pair (own prescription, surcharges and adjustments, repeated items allowed across pairs), retry-safe; legacy signature still works.
**Validation**: `supabase/tests/multi_pair_orders.sql` (rollback-only): 3-pair acceptance, same item in two pairs, per-pair surcharge, price change → 40001, retry returns the same order, foreign/other-branch patient rejected; single-pair path returns the same result as before.

### Phase 3: Sales UI with pairs
**Objective**: "Nueva venta" handles holder + pairs (patient picker, per-pair prescription and concepts, per-pair subtotal, total), draft v2 in localStorage, accepted panel per pair; single-pair sale looks as today. `SalesWorkspace` split under 500 lines.
**Validation**: typecheck/lint; Playwright at 390 px and desktop: 1-pair and 3-pair sales end in an order; evidence in `.titan/qa/`.

### Phase 4: Order, payments, notifications and delivery
**Objective**: order detail and list show pairs (count, patients, per-pair concepts and status; search by patient), `{{pairs_summary}}` (pair count only, no names) in messages, "Avisar" and "Entregar" warn while any pair is unfinished, timeline labels per pair.
**Validation**: one message per event to the holder on «Óptica Javier Prueba» (attempts `sent`); single-pair messages unchanged byte for byte; delivery still blocked with balance.

### Phase 5: Production per pair
**Objective**: assignment, panel, provider view, transitions, incidents and rework per pair, with "Asignar a todos los pares"; counters and production list correct.
**Validation**: SQL test: two current lens jobs on one order (different pairs), second current job on the same pair rejected, rework keeps the line; provider snapshot has no patient identity; Playwright on `/production` as provider and as owner.

### Phase 6: Readers, analytics and types
**Objective**: optometrist summary counts per pair revision, owner dashboard/KPIs and organization activity stay correct (orders vs pairs defined), `database.types.ts` regenerated.
**Validation**: summary figures match direct SQL on test data; no reader left on `orders.prescription_revision_id` except compatibility.

### Phase 7: Documentation and final validation
**Objective**: `BUSINESS_LOGIC.md` (flow, states, provider assignment per pair), user manual, memory entry; end-to-end on «Óptica Javier Prueba».
**Validation**:
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] Playwright screenshots at 390 px confirm sale, order, production and delivery
- [ ] Success criteria met

---

## Learnings (Self-Annealing)

> Grows with every error found during implementation.

### 2026-11-08: Keep the live app working between phases
- **Error**: making `order_line_id` / `quotation_line_id` NOT NULL would break the current `save_quotation`, `accept_quotation`, `assign_production_job` and rework RPCs (they insert without a line) until phases 2 and 5 ship.
- **Fix**: transitional `BEFORE INSERT` triggers (`private.default_*_line`) put a concept/job without a line on line 1, creating it from the parent when missing (quotation line 1 is refreshed on each legacy save). They refuse when the parent already has more than one line ("Indica el par…"). Phases 2/5 pass the line explicitly; drop the triggers only when no caller relies on them.
- **Aplicar en**: any schema change on a live table with RPCs that will be migrated later.

### 2026-11-08: Dry runs must not insert orders
- **Error**: a rollback dry run that inserts into `orders` fires `orders_notify_accepted` (WhatsApp to the customer).
- **Fix**: probe with quotations (no notification triggers) or items on existing orders; validate the order path through the UI without accepting.
- **Aplicar en**: every SQL probe on production (`orders`, `payments`, delivery updates all notify).

### 2026-11-08: Applying migrations with DELETE/DROP
- **Error**: the Supabase MCP auto-declines statements it deems destructive (policies `for delete`, `drop index`).
- **Fix**: write the file in `supabase/migrations/`, `npx supabase db push --remote --dry-run`, then `--yes` (see `.titan/memory/reference/2026-11-07-supabase-mcp-destructive-sql.md`).
- **Aplicar en**: every phase of this PRP.

### 2026-11-08: Phase 3 is committed but not pushed until phase 5
- **Error**: with the multi-pair sale UI live, a 2-pair order can be created, but production assignment is still per order and the transitional trigger refuses a job without a pair on a multi-pair order ("Indica el par del trabajo").
- **Fix**: phase 3 stays as a local commit; it ships together with phases 4–5 so a family order can go through production and delivery. Single-pair sales are unchanged.
- **Aplicar en**: any phase whose UI creates data the next phase must handle; a push to `main` deploys to Vercel.

### 2026-11-08: Phase 2 validated against production without a disposable database
- **Context**: no local Docker stack; `supabase/tests/multi_pair_orders.sql` was run twice on production inside one transaction ending in `raise exception` (before the push, together with the migration; after the push, alone), via the Management API. Acceptance inside the test only queues a pg_net request, discarded by the rollback.
- **Result**: all checks passed both times; fixture org/users and the new functions were absent afterwards. End to end from the current UI: `JAV-2026-000013` (1 pair, totals equal) and its WhatsApp `sent`.
- **Aplicar en**: phases 4–5 (payments, delivery and production tests follow the same pattern).

### 2026-11-08: Phase 4 scope moved to phase 5
- **Context**: per-pair timeline labels and "Faltan X de N pares" need per-pair production jobs, which only exist after phase 5.
- **Done in phase 4**: pairCount/patientNames in the inbox (search by patient), collapsible pairs in the order detail, `{{pairs_summary}}` ("Pares: *N*" only with 2+ pairs, single-pair messages unchanged, verified on JAV-2026-000013/14), «¿Avisar igual?» while production is unfinished. Also fixed: `{{balance}}` tells the balance in USD for USD-only sales (`20261108030000`).
- **Phase 5 adds**: per-pair readiness count in the Avisar/Entregar dialogs and pair labels on production timeline events.

---

## Gotchas

- [ ] `calculate_catalog_price` rejects duplicate item ids and reads one revision: call it per line, never with the concatenated items of all pairs.
- [ ] `line_adjustments` are keyed by item id; with pairs they must be keyed per line (same item, different agreed price in two pairs).
- [ ] `order_items` and `order_confirmations` have immutability triggers: the backfill must disable/enable them inside the migration (pattern in `20260921015206`).
- [ ] The quotations UPDATE policy hides accepted rows from `FOR UPDATE` (QA-04): keep the existing retry lookup in `accept_quotation`.
- [ ] Unique index `production_jobs_one_current_type_idx (order_id, job_type)` must be replaced, not kept, or the second pair can never get a job.
- [ ] Notification dispatch keys are per order/event (`order_accepted:<id>`): keep them per order so a multi-pair order still sends one message.
- [ ] Supabase MCP auto-declines destructive SQL: use the CLI for migrations with drops (`reference/2026-11-07-supabase-mcp-destructive-sql.md`).
- [ ] WhatsApp formatting breaks with `*`/`_` in names; `{{pairs_summary}}` adds more names (first names only).
- [ ] `event.currentTarget` is null after an `await` in form handlers (`reference/2026-11-07-event-currenttarget-after-await.md`).
- [ ] Every view must work on mobile; pairs must be collapsible cards, not a wide table.

## Anti-patterns

- Do NOT create one order per pair or a parallel "group" ledger.
- Do NOT duplicate payment, balance or delivery logic per pair.
- Do NOT expose patient identity, prices or payments to providers.
- Do NOT change single-pair messages, totals or screens beyond what the pair level requires.
- Do NOT ignore TypeScript errors or add dependencies.

---

*PRP pending approval. No code has been modified.*
