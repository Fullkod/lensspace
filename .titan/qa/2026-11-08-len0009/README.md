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
