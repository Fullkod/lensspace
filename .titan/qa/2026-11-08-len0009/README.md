# QA LEN0009 phase 1 — retail optician accounts and prices

Date: 2026-11-08 · Playwright MCP on `localhost:3000/wholesale`, owner of «Óptica Javier Prueba» (org 2).

| Check | Result |
|-------|--------|
| Empty state, «Nueva óptica» (390 px) | OK |
| Discount 95 % rejected in the form («El descuento va de 0 a 90 %.») | OK |
| Create «Óptica Sol (QA LEN0009)», 12,5 %, 30 days, terms | OK, toast, list badge (`accounts-list-390.png`) |
| Fixed price 40 USD (Monofocal Anti Blue) and 2500 CUP (Armadura sola) | OK in DB, `changed_by` = owner (`account-prices-390.png`) |
| Remove a fixed price; edit 40 → 42,50 (comma decimal) | OK |
| Archive → «Ver archivadas (1)» → restore | OK |
| Edit discount to 10 % | OK |
| Duplicate active name (different case) | Rejected: «Ya existe una óptica activa…» (only console error: the expected 409) |
| Desktop 1366 px, menu «Ópticas minoristas» under Gestión | OK (`accounts-desktop.png`) |

The QA account «Óptica Sol (QA LEN0009)» stays active in org 2 (10 %, 42,50 USD fixed on
item 15) for the next phases. Seller/other-org isolation is covered by
`supabase/tests/commercial_accounts.sql`.

## LEN0010 phase 4 — commercial orders UI (2026-11-08, 390 px)

| Check | Result |
|-------|--------|
| `/wholesale-orders` → «Nuevo pedido» (branch, account, rate 930) | Order `JAV-2026-000015` (id 83) opened |
| «Agregar trabajo» → «Nuevo paciente» Ana QA Uno → Monofocal Anti Blue + Armadura sola | Picker shows account prices (42,5 USD fixed, rest −10 %); total 45,40 USD (`commercial-order-job1-390.png`) |
| Second job, new patient Luis QA Dos, Progresivo Blanco 22,5 USD | Total 67,90 USD |
| «Cerrar y mandar a fabricar» | Status «Cerrado · en fabricación», closed by Javier |
| Production panel → montaje «Todos los pares» to Javier (taller propio) | 2 jobs; 0 WhatsApp dispatches |
| «Marcar listo», deliver job 1 only, then the rest | Partial then full delivery on credit, «Pendiente 67,90 USD» (`commercial-deliver-dialog-390.png`, `commercial-delivered-390.png`) |
| List «Por cobrar» | Shows the order and «Pendiente de cobro: 67,90 USD» (`commercial-orders-list-390.png`) |
| Equipo → «Pedidos a ópticas: permiso especial» | Lists the branch seller with its switch (not toggled: real account) |

Dev server note: the long-running `next dev` (≈40 h) had a broken worker pool («Jest worker
encountered 2 child process exceptions») that made the new dynamic route return 500; a
restart fixed it.

## LEN0010 phase 5 — collections (2026-11-08, 390 px)

| Check | Result |
|-------|--------|
| Order detail «Cobrar» → `/wholesale-orders?optica=5&cobrar=1` opens «Cobrar a la óptica» | OK, no hydration error after fixing the auto-open (`collection-dialog-390.png`) |
| 30 USD, FIFO proposal fills JAV-2026-000015 with 30 | Payment 30 USD at 930 in Javier's cashbox (id 114), `collection_id` set, order «Pago parcial», 0 WhatsApp |
| «Cobros de Óptica Sol» lists the collection with note and order split | OK (`collection-done-390.png`) |
| Split, overpayment, retry, auto-close when paid, seller isolation | `supabase/tests/commercial_orders.sql` |
