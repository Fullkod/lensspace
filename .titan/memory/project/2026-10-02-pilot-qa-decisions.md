# Pilot QA decisions and readiness

Date: 2026-10-02

Plan: `.titan/plans/prp-pilot-qa-hardening.md` (61 items; evidence in
`.titan/qa/2026-10-02-pilot-qa/`). Verdict: not pilot-ready until Phase 1
(QA-01..QA-11) plus QA-28/QA-30 ship. WhatsApp delivery works, but OpenWA
answers HTTP 500 after sending, so attempts are stored as failed (QA-61).

## Product owner decisions

- "Pedido listo" WhatsApp is manual only (explicit action, re-sendable after
  rework); the automatic `order_ready` trigger goes away (QA-08).
- Delivering before production is reviewed shows a non-blocking warning (QA-14).
- USD full-balance payments round up to the cent; the server tolerates that
  sub-cent overshoot and caps the CUP equivalent; any remainder can be paid in CUP (QA-18).
- The pilot starts on a clean organization; QA duplicate payments in Óptica Javier
  stay as test history (QA-03).
- Suspended subscription = all operations blocked, data read-only (current
  behavior kept; BUSINESS_LOGIC.md aligned) (QA-37).
- Cache strategy approved: never cache tenant RSC data, balances, payments,
  cashbox or order status; cache static assets, sale drafts and an optional
  provider jobs snapshot locally.
- Business USD→CUP rate comes from elTOQUE on demand: a button fetches it (one
  elTOQUE call per Havana day for the whole platform, cached in
  `market_exchange_rates`) and the organization keeps it until the next tap.
  Scraping eltoque.com is not viable (Cloudflare challenge); the official API needs
  the `ELTOQUE_API_TOKEN` Edge Function secret. Default order: business rate →
  last order rate → 420; a sale can still override it.
  **Status 2026-10-02: waiting for the elTOQUE token** (requested by the product
  owner; approval may take up to a week). Then set the `ELTOQUE_API_TOKEN` secret.
  **Update 2026-11-06: token received and stored** as the Supabase Edge Function secret
  `ELTOQUE_API_TOKEN` (not a Vercel env var: only `refresh-exchange-rate` reads it). Direct
  call to `tasas.eltoque.com/v1/trmi` answered 200 (USD 930). Pending: press 'Actualizar con
  elTOQUE' once in the app and check the `market_exchange_rates` row.
- Supabase project region: `ca-central-1` (Montréal). Vercel functions should run in
  `yul1` (Montréal), or `iad1` if the Vercel plan does not offer it (QA-31).
- OpenWA false negative (QA-61): closed 2026-11-05. New OpenWA session UUID in Vault;
  send-text answers 201 with `messageId` (see `2026-09-20-openwa-notifications.md`).
- WhatsApp messages carry the shop name, the sender's name and phone (QA-08 follow-up).
- Superadmin (QA-38): never operational writes in a tenant; reading a tenant's
  operational data requires an open, audited support session for that organization
  (`private.has_platform_support_session`). Base catalog and platform admin unchanged.
- Invitations (QA-39): always `invited`; new accounts activate by confirming the
  email, existing accounts accept/decline on the dashboard. Owners cannot activate
  an invited member; the invite response never reveals whether an account exists.
- Phase 6 done 2026-10-03: `/profile` with password change (re-checks the current
  password) replaces the sidebar dialog (QA-62); the static landing swaps its CTAs
  to 'Ir a mi panel' from the session cookie (QA-63); the manual is persisted in
  `manual_documents` (superadmin writes by RLS, everyone reads; owners also see the
  administration variant; PDF from the saved text) (QA-64).
- Phase 5 low items done 2026-10-03 (QA-52 recommended deposit deferred post-pilot).

## Test accounts and data

- QA orgs: "QA Piloto Solo 2026-10-02" (QAS), "QA Piloto Admin 2026-10-02" (QAP),
  "QA Piloto Admin B" (QAB); owners `qa.*.20261002@lensspace.test` (passwords in the plan).
- Customers named "QA PILOTO ..." with consent OFF, except "QA PILOTO WhatsApp"
  (consent ON, product owner's controlled number) on JAV-2026-000018, kept open
  for the OpenWA re-test.
- QA data cleaned 2026-10-03: only Óptica Javier remains (pre-QA customer and
  JAV-2026-000001; next order JAV-2026-000002); QA orgs 3–6 and the `@lensspace.test`
  accounts are gone. Cleaning tenant data needs disabling the immutability triggers
  inside one transaction and also deleting `private.notification_dispatches`; the
  Supabase MCP declines DELETE, so the product owner runs it in the SQL Editor.
