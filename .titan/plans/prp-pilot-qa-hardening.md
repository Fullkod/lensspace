# PRP — Pilot QA hardening (Cuba pilot readiness)

Status: product decisions resolved 2026-10-02 (see "Decisions (resolved)"); implementation pending, starting with Phase 1
Date: 2026-10-02
Authorization: requested by the product owner — a general pilot-readiness test run as the specialists who will use the system, following `BUSINESS_LOGIC.md` and `.titan/memory/`, recording every defect in a plan so it can be fixed in order. Top priority: a concise sale with zero friction, including a shop where the owner (jefe) does everything alone.
Evidence: `.titan/qa/2026-10-02-pilot-qa/` (index in its `README.md`).

## Goal

Make LensSpace safe and frictionless for the Cuba pilot:

1. No data-integrity defect can be triggered by normal use on an intermittent link. That covers duplicate payments, lost orders, wrong attribution and wrong clinical dates.
2. A single-user organization (owner only) can complete the whole cycle alone: sale → production → delivery → cashbox closure.
3. The sale flow is as short as possible on desktop and mobile.
4. Screens show fresh data after mutations without full reloads, and the app survives connection drops.

## Scope and test method

**Method.** Six parallel test areas, each run by a tester agent and then re-checked by a verifier agent against the live code and the remote Supabase DB (function definitions, grants, rows). The areas were solo owner, multi-role, sales friction, admin/platform, performance/network and refresh/cache code audit. Browser automation used Playwright against the dev server on `:3000`. A production build was measured on a scratch copy at `:3100`, which has since been stopped, and the repo was not modified. Network conditions were emulated through CDP: 600 ms latency, 40 KB/s down and 20 KB/s up, offline windows, and lost responses (`route.fetch()` then `abort()`, so the server commits but the client never sees the answer). Viewports were desktop and 390x844.

**Users.**
- Real accounts (passwords are not recorded here): `admin@visionstudio.com` (superadmin), `javier@visionstudio.com` (owner, Óptica Javier) and `claudiarr1993@gmail.com` (lens provider, Óptica Javier).
- Throwaway QA accounts on `.test` addresses were created through superadmin onboarding (see *Test data created*).

**Organizations created.** `QA Piloto Solo 2026-10-02` (solo-owner scenario), `QA Piloto Admin 2026-10-02` and `QA Piloto Admin B 2026-10-02` (platform and isolation scenarios).

**Covered.**
- Onboarding.
- Owner first-run.
- Catalog: base, tenant items and overrides.
- Full and shortest sale on desktop and mobile.
- Prescriptions, including the original upload.
- Price adjustments.
- USD/CUP payments.
- Delivery.
- Production with and without providers, plus incident and rework.
- Notifications with consent OFF.
- Cashbox closures, including complementary ones.
- Dashboard and nav counters.
- Cross-tenant isolation using REST, RPC and storage.
- Provider isolation.
- Subscription states: trial, expired, suspended and renewed.
- Module toggles.
- Support sessions.
- Team invite and deactivate.
- Auth edge cases.
- Concurrency: two tabs, overpayment races and double delivery.
- Bursts and double-clicks.
- Offline, hung and lost responses.
- Timezone (America/Havana at 21:30).
- Production-build bytes, requests and TTFB.
- Supabase advisors.

**Not covered.** See *Coverage gaps*. The main gaps are the seller and mounter accounts, a real WhatsApp send and Vercel-region TTFB.

## Current status (2026-10-03, after Phase 6)

- **Done:** Phases 1–6 complete (QA-52 deferred post-pilot by plan; QA-37 closed by decision; QA-60 reviewed). Extra: elTOQUE rate button, retry-safe customers, owner reset link, dialog stacking fix, and the proxy moved to `src/proxy.ts` (it never ran from the root; see QA-59).
- **Waiting on the product owner:** ~~elTOQUE token~~ (stored 2026-11-06); ~~Vercel region (QA-31)~~ (functions run in yul1, checked 2026-11-06); leaked-password protection (QA-60) needs the Supabase Pro plan (org on Free).
- **Pilot kickoff with Javier: 2026-11-07** — plan `.titan/plans/meeting-javier-pilot-2026-11-07.md`, handout `docs/clients/optica-javier/`.
- **Pre-pilot production run (2026-11-06):** full flow green in Óptica Javier Prueba, 9 WhatsApps sent; see `.titan/qa/2026-11-06-pre-pilot/`.
- **Next:** a production build + Vercel deploy check once the region is set. The superadmin should open `/manual` and press 'Guardar manual' once to publish the reviewed text.
- **Deferred:** QA-36 supabase-js bundle, QA-52 recommended deposit, jobs history flag, provider jobs offline snapshot, `/catalog` column trimming.
- **Final check (2026-10-04):** production build OK (landing static, proxy active). Smoke test on `next start`: 24 pages × 4 roles (anon, owner desktop/mobile, provider mobile, superadmin), 0 console/page errors, redirects correct; owner TTFB ~0.5–1 s, superadmin dashboard ~2.5 s (platform usage aggregate; watch on Vercel). End-to-end one-person sale as Javier: new customer + prescription → quote → accept → full cash payment → lens and mounting in the in-house workshop (7 clicks in /production) → delivered, JAV-2026-000002, timeline complete, 3 WhatsApp attempts recorded as not sent (no consent). Fix found: the order production panel still said 'Listo para recoger' after delivery → now 'Entregado al cliente'. Test order JAV-2026-000002 / customer 'QA PILOTO Venta final 0404' left in Óptica Javier with the product owner's consent.
- **QA data cleaned (2026-10-03):** see *Test data created → Cleanup*. Only Óptica Javier remains, with its pre-QA customer and JAV-2026-000001.

## Executive summary

**Verdict: NOT READY for the pilot as-is. It becomes ready once Phase 1 ships, plus the cheap offline items QA-28 and QA-30.** Selling works. The shortest sale is 6 clicks with 0 fields and about 4.8 s. A full sale with a new customer and prescription is 11–16 clicks on one screen. Totals and USD/CUP equivalents were correct in every run, and tenant and provider isolation held under every probe. But:

1. **A solo owner cannot run the shop alone (blockers).**
   - Production stops at 'Entregado al proveedor', because the owner cannot record provider stages or assign work to himself (QA-01).
   - The owner can receive cash but cannot close his own cashbox (QA-02).
   - Both only worked after the owner invited his own email as Cristalero, Montador and Vendedor. Even with that workaround, production stayed stuck.
2. **Flaky links create unrecoverable data.**
   - A payment whose response is lost, followed by a retry, is stored twice. Payments are immutable. This was reproduced in 4 independent areas (QA-03).
   - A lost 'Cliente acepta' response creates the order but leaves the seller on 'Cotización pendiente no encontrada.' (QA-04).
3. **Features that are silently dead.**
   - No prescription original can ever be uploaded: an EXECUTE grant is missing, and `prescription_files` has 0 rows (QA-05).
   - Catalog overrides always return 403 (QA-06).
   - 'Pedido listo' WhatsApp fires on the first lens reception, before review or mounting, and is never re-sent after a rework (QA-08).
4. **Connection drops lose the app.** Any navigation while offline lands on the Chrome error page. There is no `loading.tsx`, `error.tsx` or offline handling (QA-28). Raw messages such as 'TypeError: Failed to fetch' and English RLS errors reach users (QA-30).
5. **Staleness.** The sidebar counters (Pedidos/Producción) never update without a hard reload, and they count superseded incident jobs (QA-24, QA-25).

**Update 2026-10-02 (controlled WhatsApp send):** WhatsApp delivery works; both messages reached the product owner's phone. However, OpenWA answers HTTP 500 after sending, so every message is recorded as failed (QA-61, high). QA-37 is closed by a product decision.

**Counts (60 consolidated items from the test run, before QA-61 and QA-37):** 2 blocker · 8 high · 27 medium · 23 low. 56 are confirmed and 4 plausible. They come from 105 raw tester findings across 6 areas. One was refuted and listed in the appendix.

## Findings table

Effort: S ≤ half a day · M 1–2 days · L > 2 days. Area keys: SOLO = solo owner, MR = multi-role, SALES = sales friction, ADM = admin/platform, PERF = performance/network, RC = refresh/cache code audit.

| ID | Title | Severity | Category | Area (source IDs) | Status | Effort |
|----|-------|----------|----------|-------------------|--------|--------|
| QA-01 | Owner/seller cannot record provider stages or self-assign; solo owner cannot finish production or use mounting | blocker | bug | SOLO-01, MR-02 | done 2026-10-02 | M |
| QA-02 | Owner can receive cash but cannot close his own cashbox | blocker | bug | SOLO-02 | done 2026-10-02 | S |
| QA-03 | Payments not idempotent: lost response + retry, or a burst, creates duplicate immutable payments | high | data-integrity | SOLO-04, MR-01, SALES-01, SALES-10, PERF-02, RC-01, RC-02 | done 2026-10-02 (customer key pending; mitigated by QA-19) | M |
| QA-04 | `accept_quotation` not idempotent: lost response strands the seller, order exists unseen | high | data-integrity | SOLO-08, SALES-02, RC-03 | done 2026-10-02 | S |
| QA-05 | Prescription original upload/download broken for every role (missing EXECUTE grant) | high | bug | SOLO-03, ADM-01 | done 2026-10-02 | S |
| QA-06 | Tenant catalog overrides cannot be saved (403 on upsert) | high | bug | SOLO-05, SALES-03 | done 2026-10-02 | S |
| QA-07 | `/sales` shows base prices and disabled items, ignoring overrides | medium | data-integrity | SOLO-18, SALES-06 | done 2026-10-02 | S |
| QA-08 | 'Pedido listo' WhatsApp fires on first lens reception and is never re-sent after rework | high | data-integrity | MR-03 | done 2026-10-02 | M |
| QA-09 | `/production` crashes to 'This page couldn't load' when the post-mutation refetch fails | high | bug | RC-04 | done 2026-10-02 | S |
| QA-10 | Delivery event attributed to 'Sistema' (no `delivered_by`) | medium | data-integrity | SOLO-09, MR-09 | done 2026-10-02 | S |
| QA-11 | Client 'today' in UTC: prescription date defaults to tomorrow after 20:00 Havana | medium | data-integrity | SALES-14, RC-13 | done 2026-10-02 | S |
| QA-12 | Sale customer picker: no search, capped at 200 customers / 200 revisions | high | friction | SALES-04, SOLO-17, PERF-03, RC-12 | done 2026-10-02 | M |
| QA-13 | Production assignment only from `/production`, order chosen by number only, no auto provider | medium | friction | MR-12, MR-11 (selector), RC-15 (label) | done 2026-10-02 | M |
| QA-14 | Delivery not tied to production; no 'Listo para recoger' or production strip in order detail | medium | missing-feature | SOLO-10, MR-08 | done 2026-10-02 | M |
| QA-15 | Two-step save/accept, no total before saving, redundant `calculate_sale_price` round trip | medium | friction | SALES-11, PERF-12 | done 2026-10-02 | M |
| QA-16 | Mobile: total and Save/Accept buttons ~3000 px down, no sticky bar | medium | mobile | SOLO-16, SALES-12 | done 2026-10-02 | S |
| QA-17 | Sale draft lost on reload/back/tab kill; saved quotations cannot be resumed | medium | offline | SALES-07, PERF-09, RC-11 | done 2026-10-02 | S |
| QA-18 | Paying the full balance in USD leaves a CUP residue that blocks delivery | medium | bug | SALES-08 | done 2026-10-02 | S |
| QA-19 | Nueva venta blocks real homonyms and never checks duplicate phones | medium | bug | SALES-05 | done 2026-10-02 | M |
| QA-20 | Phones stored in two formats ('50000101' vs '5350000101'); duplicates missed | medium | data-integrity | SALES-13 | done 2026-10-02 | S |
| QA-21 | No pending label and no request timeout on Save/Accept/Pay | medium | friction | SALES-18 (labels), RC-10 | done 2026-10-02 | S |
| QA-22 | Rate hardcoded to 420; absurd rate accepted; native English validation | low | friction | SOLO-15, SALES-18 (rate) | done 2026-10-02 (+ elTOQUE button) | S |
| QA-23 | No password recovery (self-service or admin) | medium | missing-feature | ADM-05 | done 2026-10-02 (self-service + admin) | S |
| QA-24 | Sidebar counters never refresh after mutations or soft navigation | medium | refresh | SOLO-06, MR-04, SALES-15, PERF-04, RC-05 | done 2026-10-02 | S |
| QA-25 | Superseded incident jobs counted as active/incident forever | medium | bug | SOLO-07, MR-05 | done 2026-10-02 | S |
| QA-26 | Back/forward restores stale lists (`useState(initialX)` freezes props) | medium | refresh | RC-06 | done 2026-10-02 | S |
| QA-27 | No refetch on focus/reconnect/error: other users' changes, stale balances, renewal and module changes stay stale | medium | refresh | MR-04 (cross-user), RC-07, ADM-06 | done 2026-10-02 | S |
| QA-28 | Offline navigation lands on the Chrome error page; no `loading.tsx`/`error.tsx`/offline banner | high | offline | SOLO-12, PERF-01, RC-08, MR-10 (offline view) | done 2026-10-02 (base + offline SW) | S→M |
| QA-29 | Every click waits 0.5–3 s with no feedback; nothing streams | medium | performance | PERF-05 | done 2026-10-02 | S |
| QA-30 | Raw technical errors ('TypeError: Failed to fetch', English RLS/privilege messages) | medium | ux-copy | SOLO-11, MR-10, SALES-09, ADM-07, RC-09 | done 2026-10-02 | S |
| QA-31 | Server waterfalls (owner `/dashboard` 9 sequential round trips) and 2–3 `getUser()` per request | medium | performance | PERF-06, ADM-14 | done 2026-10-02 (region check pending) | M |
| QA-32 | Unbounded `list_accessible_orders`/jobs; customer search waterfall; `/production` loads all orders | medium | performance | PERF-07, SALES-16, RC-14, RC-15, MR-11 | done 2026-10-02 (jobs history deferred) | M |
| QA-33 | Desktop sidebar prefetches 19 routes per page view (~50 KB upload) | low | performance | PERF-08 | done 2026-10-02 | S |
| QA-34 | `/catalog` loads `select('*')` on 3 tables plus 100 revisions | low | performance | PERF-11 | partly done 2026-10-02 | S |
| QA-35 | `/orders` auto-loads first order detail (2 RPC + 2 preflights) | low | performance | PERF-13 | done 2026-10-02 | S |
| QA-36 | Full supabase-js browser client is 66.6 KB gz on every page | low | performance | PERF-10 | deferred (post-pilot) | L |
| QA-37 | Suspended org/subscription is read-only, not blocked | — | decision | ADM-03 | closed: keep read-only (decision 2026-10-02) | — |
| QA-38 | Superadmin can write tenant data and read every tenant without a support session | medium | security | ADM-04 | done 2026-10-02 | M |
| QA-39 | Invite enrolls existing accounts as ACTIVE with no consent; response reveals whether an account exists | medium | security | ADM-02 | done 2026-10-02 | M |
| QA-40 | No read-only banner, 'Nueva venta' stays enabled when expired; owner never told of expiry | medium | friction | ADM-08, ADM-09 | done 2026-10-02 | S |
| QA-41 | Rework cannot be reassigned to another provider | medium | missing-feature | MR-06 | done 2026-10-02 | S |
| QA-42 | Provider sees 'Aceptar repetición' (DB rejects it) | medium | bug | MR-07 | done 2026-10-02 | S |
| QA-43 | Mojibake in 8 DB functions and stored `notification_attempts`; unaccented messages | low | ux-copy | SOLO-19, ADM-16, MR-16 (part) | done 2026-10-03 | S |
| QA-44 | Prescription allows cylinder without axis and off-step values; two vision types with no warning | low | data-integrity | SALES-17, MR-15 | done 2026-10-03 | S |
| QA-45 | Provider mobile: lands on dashboard, stats fill the first screen, history always shown | low | mobile | MR-13 | done 2026-10-03 | S |
| QA-46 | Provider can open commercial pages with misleading empty states | low | ux-copy | MR-14 | done 2026-10-03 | S |
| QA-47 | Escape on an open select inside a dialog closes the dialog | low | bug | SOLO-20 | done 2026-10-03 | S |
| QA-48 | Timeline polish: duplicate incident rows, no cost owner, 'Cobrado 0 %', consent reason hidden, date hydration mismatch | low | ux-copy | MR-16, SOLO-19 (UI) | done 2026-10-03 | S |
| QA-49 | `auth.getUser()` + `user!.id` in write handlers can leave buttons stuck offline | low | bug | RC-17 | done 2026-10-03 | S |
| QA-50 | Order prefix not derived from name; owner cannot edit it before the first order | low | missing-feature | SOLO-13 | done 2026-10-03 | M |
| QA-51 | Onboarding success message never visible; invalid branch-code pattern regex | low | ux-copy | SOLO-14, ADM-17 | done 2026-10-03 | S |
| QA-52 | Recommended/minimum deposit not implemented | low | missing-feature | SALES-19 | deferred post-pilot | M |
| QA-53 | Base catalog create/price/availability changes not audited | low | data-integrity | ADM-13 | done 2026-10-03 | S |
| QA-54 | Admin: no audit history, notes or last-renewal; filter ignores subscription state | low | missing-feature | ADM-10 | done 2026-10-03 | M |
| QA-55 | `last_renewed_on` overwritten on every save while active | low | data-integrity | ADM-11 | done 2026-10-03 | S |
| QA-56 | Starting a support session silently closes the previous one with no audit | low | data-integrity | ADM-12 | done 2026-10-03 | S |
| QA-57 | Module dependency rules not reflected in admin UI | low | friction | ADM-15 | done 2026-10-03 | S |
| QA-58 | Deactivated/invited member shows as 'Usuario' | low | bug | ADM-18 | done 2026-10-03 | S |
| QA-59 | Session expiry drops the deep link; invite error is generic | low | friction | ADM-19 | done 2026-10-03 | S |
| QA-60 | Advisors: leaked-password protection off; DEFINER RPC exposed | low | security | ADM-20 | reviewed 2026-10-02 (leaked-password setting pending) | S |
| QA-61 | WhatsApp is delivered but OpenWA answers HTTP 500, so it is recorded as failed (false negative) | high | data-integrity | controlled send 2026-10-02 | done 2026-11-05 | S–M |

---

## Phase 1 — Blockers and data integrity

### QA-01 Solo owner cannot finish production (blocker, M)
- **Problem:** owner and seller roles may only do pending→ready_to_send→dispatched and completed→received(→reviewed). They cannot record in_production/in_mounting or completed on the provider's behalf, which contradicts BUSINESS_LOGIC: 'El vendedor también podrá actualizar estados operativos en su nombre, quedando registrado quién hizo realmente el cambio'.
  - Assignment requires an active provider membership. An org with no providers therefore cannot assign at all ('No hay cristaleros activos').
  - An owner who self-invites as provider is still resolved as owner.
  - Mounting is unusable without a mounter account.
- **Evidence:** `solo-owner/09-production-assign-no-provider.png`, `11-production-stuck-self-provider.png`. RPC 42501 'Esta transición no corresponde a tu rol o al estado actual del trabajo.' and 23514 'El proveedor no esta activo con el rol requerido en la organizacion.' QAS jobs 10 (dispatched) and 11 (pending) are stuck. Javier's `completed` probe was rejected too.
- **Root cause:**
  - `private.transition_production_job` (`supabase/migrations/20260921020911_align_provider_production_transitions.sql:22-55`) restricts the owner/seller branch.
  - `private.production_actor_role` orders owner=1, so an owner who is also a provider is never treated as a provider.
  - `private.assign_production_job` (`20260913165913_*.sql:157-165`) requires an active lens or mounting provider membership.
  - The UI mirrors this: `src/features/production/components/ProductionWorkspace.tsx:40-48`, where `nextTransition` uses the optical map only.
- **Fix:**
  - Add a new migration that lets owner/seller also perform provider transitions (dispatched|pending→in_production/in_mounting, then →completed). Insert the event with the real `actor_id = auth.uid()`, the real role, and a note 'En nombre de <proveedor>'.
  - Let `assign_production_job` accept an owner/seller of the same org as the target. This covers the in-house workshop and the solo owner.
  - UI: for optical actors, show the provider transition as a secondary button ('Marcar en fabricación (en nombre del proveedor)'), and include the current user in the provider list for owners.
- **Verify:**
  - Solo owner with no providers assigns lens + mounting to himself → verificar: both jobs reach `reviewed` from the UI.
  - Timeline → verificar: it shows the owner's name with 'en nombre de'.
  - Javier records `completed` for Claudia's job → verificar: allowed, and actor = javier.
  - Claudia → verificar: still cannot do optical transitions.

- **Done (2026-10-02):** migration `20261002153245_allow_optical_on_behalf_production_and_owner_cashbox.sql` (applied remotely) plus the production UI ('taller propio' option, auto-selected when it is the only one, and a secondary 'en nombre del proveedor' action). The dead 'También falta un proveedor activo' alert was removed. Verified as follows:
  - New org 'QA Piloto Solo B 2026-10-02' (QSB, owner only, 1 membership). Order QSB-2026-000001: the lens job went to `received` and the mounting job to `reviewed` from the UI, all events as owner.
  - JAV job 14 (Claudia): Javier `in_production` carries the note 'En nombre de Claudia Rodríguez Rodríguez' with actor = Javier. Claudia `completed` is allowed. Claudia `received`, Claudia assign and assigning a non-member are all rejected.
  - Security advisors show no new findings.
  - Evidence: `.titan/qa/2026-10-02-pilot-qa/fix-qa01-02/`.

### QA-02 Owner cannot close his own cashbox (blocker, S)
- **Problem:** an owner who receives cash gets cashboxes in his name that he can never close. The UI still shows the close form.
- **Evidence:** `solo-owner/15-cashbox-closed.png` shows 403 `{"code":"42501","message":"Solo el vendedor puede cerrar su propia caja operativa."}` for cashboxes 31 and 32. `15b-…after-self-seller.png` shows that it works only after the self-invite as Vendedor.
- **Root cause:** `private.close_seller_cashbox` checks `has_organization_role(org, array['seller'])`. Migration `20260920221232_allow_owners_to_receive_cash.sql` relaxed only `prepare_cash_payment`.
- **Fix:** add a new migration that recreates `close_seller_cashbox` with `array['seller','owner']`, keeping the `seller_id = auth.uid()` check. Apply the same relaxation to complementary closures if they use a separate path.
- **Verify:** fresh solo owner (no Vendedor membership) receives cash, then closes CUP and USD → verificar: both closures are saved and appear in history; a post-close payment → verificar: 'Posterior al cierre' and a complementary closure works.

- **Done (2026-10-02):** same migration. The QSB owner (owner role only) closed the CUP cashbox (primary, expected 500). The cashbox UI copy now reads 'Solo quien recibió el efectivo puede cerrar esta caja.'

### QA-03 Duplicate payments on retry or burst (high, M)
- **Problem:** `register_cash_payment` inserts unconditionally.
  - When the response is lost, the UI says 'No pudimos registrar el cobro. Revisa el importe e inténtalo nuevamente.' and keeps the amount filled, which invites a retry that stores a second payment.
  - A same-task burst of clicks also passes the client guard, because `pending` from `useTransition` updates only after a render.
  - Payments are immutable and there are no refunds, so a duplicate cannot be undone.
- **Evidence:**
  - Lost-response duplicates: QAS-2026-000003 payments 59/60 (2×100 CUP), JAV order 8 payments 45/46 (2×200), JAV-2026-000010 (2×500) and JAV-2026-000008 payments 32/33 (2×500).
  - Burst duplicates: JAV-2026-000008 payments 34/35/36 (3×100) and JAV-2026-000004 (3×100, 16 ms apart).
  - Screenshots `solo-owner/20-payment-lost-response.png`, `20b-payment-duplicate.png`, `refresh-cache-code/03-payment-lost-response-message.png`, `multirole/javier-offline-payment-mobile.png`.
- **Root cause:**
  - `supabase/migrations/20260913155559_cash_payments_balances_delivery_guard.sql:134` has no request key.
  - `src/features/orders/payment-errors.ts:21`: the fallback maps network errors to the amount copy.
  - `src/features/orders/components/PaymentForm.tsx:25,38-43` uses an async-state guard.
  - Callers `OrderPaymentsWorkspace.tsx:67-68` and `src/features/sales/components/AcceptedOrderPanel.tsx:36-37` do not re-sync on error.
- **Fix:**
  1. Migration: add `payments.client_request_id uuid`, a partial unique index on `(organization_id, client_request_id)`, and an optional `client_request_id` parameter on `register_cash_payment` that returns the existing row on conflict.
  2. `PaymentForm`: generate `crypto.randomUUID()` once per attempt and reuse it on retry, resetting it only after success or an amount change. Add a synchronous `useRef` in-flight guard.
  3. `payment-errors.ts`: detect network errors (no `code`, or 'Failed to fetch', 'NetworkError' or 'aborted') and show 'Sin conexión: no sabemos si el cobro llegó. Verificando…'. Then re-read `get_order_payment_summary` before re-enabling the form.
  4. Apply the same key to `save_quotation` on create and to `create_customer_with_phones`, since bursts duplicated those too.
  5. Cleanup: duplicate QA payments stay, because they are immutable. Document them as test data.
- **Verify:**
  - Lost response via Playwright, then retry → verificar: exactly 1 row in `payments`.
  - Triple synchronous click → verificar: 1 payment, 1 customer, 1 quotation.
  - Offline submit → verificar: the 'Sin conexión…' copy appears and the balance is re-read.

- **Done (2026-10-02, payments):** what changed:
  - Migration `20261002164500_make_payment_and_acceptance_retry_safe.sql` (applied manually by the product owner) adds `payments.client_request_id`, a partial unique index, and `register_cash_payment(..., payment_request_id uuid)` with a per-key advisory lock.
  - `PaymentForm` sends one id per attempt, reuses it on retry, resets it when the amount, currency or rate changes, and adds a synchronous in-flight guard.
  - Network errors show 'Sin conexión: no sabemos si el cobro llegó…' and the balance is re-read.
  - Verified on QSB-2026-000003: a lost response followed by a retry stored 1 row; a triple synchronous click sent 1 request and stored 1 row; 3 concurrent RPCs with the same key stored 1 row (the other two returned `duplicate: true`).
  - Item 4 closed: quotations use `save_sale_quotation` with a request key (see the pending items under QA-23), and migration `20261002195106_make_customer_creation_retry_safe.sql` adds a `create_customer_with_phones` overload with a required `customer_request_id` (unique `(created_by, client_request_id)`, advisory lock, early return). `/customers` and the sale's quick customer reuse the key until success or a non-network error. Verified in SQL: two calls with the same key return the same customer id.

### QA-04 Accept is not idempotent (high, S)
- **Problem:** a lost 'Cliente acepta · crear pedido' response creates the order. The retry raises 'Cotización pendiente no encontrada.', the seller never sees the order number or the payment panel, and is likely to redo the sale.
- **Evidence:** QAS-2026-000003 (quotation 38), JAV-2026-000009, and the 'Accept perdido 6999' order. Screenshots `solo-owner/19-accept-lost-response.png`, `19b-accept-retry.png`, `sales-friction/accept-lost-response-retry.png`, `refresh-cache-code/03-accept-lost-response-stuck.png`.
- **Root cause:** `supabase/migrations/20260921015206_add_sale_line_price_adjustments.sql:200-202` raises P0002 whenever status ≠ `awaiting_acceptance`. `src/features/sales/components/SalesWorkspace.tsx:338-351` shows `error.message`.
- **Fix:** `CREATE OR REPLACE accept_quotation`. After the `FOR UPDATE` select, if status = `accepted` and `can_write_seller_sale` holds, return `{orderId, orderNumber}` from `orders where quotation_id = target`. Client: on a network error, retry once automatically, which is now safe.
- **Verify:** lost response, then retry → verificar: `AcceptedOrderPanel` shows the same order number, and only 1 order is linked to the quotation.

- **Done (2026-10-02):** what changed:
  - Follow-up migration `20261002165428_fix_accept_quotation_retry_lookup.sql`. The first attempt's early return never ran, because the `quotations_update` policy (`status <> 'accepted'`) hides accepted rows from `SELECT … FOR UPDATE`. The existing order is now looked up right before raising P0002, which also covers concurrent clicks.
  - The client retries a network failure once automatically.
  - Verified: QSB quotation 42 retried returned the same order with `alreadyAccepted`. In the browser, a lost response produced 2 calls, 1 order (QSB-2026-000003) and the panel showed it.

### QA-05 Prescription originals can never be stored (high, S)
- **Problem:** every upload fails with 'permission denied for function can_access_prescription_object'. The revision is saved but the original is silently lost, which breaks the rule 'El original se preserva'.
- **Evidence:** `select count(*) from prescription_files` = 0. `has_function_privilege('authenticated', 'private.can_access_prescription_object(text,boolean)', 'execute')` = false. The failure was reproduced as the QAS and QAP owners.
- **Root cause:** `supabase/migrations/20260913144454_prescription_revisions_and_private_storage.sql:251` revokes EXECUTE and never re-grants it. The storage policies at :258/:266/:274 call the function as `authenticated`.
- **Fix:**
  - New migration: `grant execute on function private.can_access_prescription_object(text, boolean) to authenticated;` (the function is SECURITY DEFINER with a fixed search_path).
  - Add a storage test under `supabase/tests` that uploads to an owned path and is denied on a foreign path.
  - Offer an 'Adjuntar original' action on an existing revision.
- **Verify:** owner uploads a PNG and a PDF from `/sales` and `/prescriptions` → verificar: a row is added in `prescription_files` and the signed URL opens; cross-tenant upload → verificar: denied.

- **Done (2026-10-02):** migration `20261002165930_grant_prescription_object_access_check.sql`. Verified as follows:
  - The QSB owner attached a PNG from the Nueva venta prescription dialog, creating the first ever `prescription_files` row (id 1).
  - The signed URL returns 200, and a PDF upload to the owner's own path is accepted.
  - Javier reading or writing the QSB path is denied, and QSB writing to a Javier path is denied.
  - Security advisors show no new findings.
  - Not done: the 'Adjuntar original' action on an existing revision. It is a new feature and remains a Phase 2 candidate.

### QA-06 Catalog overrides return 403 (high, S)
- **Problem:** 'Personalizar … para la organización' always fails with the raw message 'permission denied for table catalog_item_overrides'. Disabling an item fails the same way. Each óptica adjusting its own prices is a core BUSINESS_LOGIC capability.
- **Evidence:** `solo-owner/04-catalog-override-error.png`, `sales-friction/catalog-override-attempt.png`. Column privileges: UPDATE is granted only on cost_amount, sale_price, currency, is_enabled, changed_by and changed_at.
- **Root cause:** `src/features/catalog/components/CatalogWorkspace.tsx:150-170` uses `.upsert(entry)` including `organization_id` and `catalog_item_id`. PostgREST's `ON CONFLICT DO UPDATE` sets every column, but those two have no UPDATE grant (`20260913152157_catalog_pricing_and_graduation_rules.sql:251-253`).
- **Fix:** if an override exists in state, `.update({...updatable}).eq('organization_id').eq('catalog_item_id')`; otherwise `.insert(entry)`. Map 42501 through QA-30.
- **Verify:** change Bifocal · Blanco 20→25 USD and disable an item → verificar: rows are persisted and a new quote prices at 25 USD.

- **Done (2026-10-02):** `CatalogWorkspace.saveOverride` updates an existing override and inserts a new one, falling back to update on 23505. Verified with the QSB owner:
  - Bifocal · Blanco 20→25 (POST 201), then →26 (PATCH 204).
  - Progresivo · Blanco disabled (POST 201).
  - The values persisted after a reload.

### QA-07 `/sales` ignores overrides and disabled items (medium, S; ship with QA-06)
- **Problem:** cards show base prices and disabled items, while the server prices with `coalesce(override.sale_price, item.sale_price)`. As a result:
  - the 10 % discount check and the 'adjusted' detection use the wrong base;
  - a disabled item fails at save with 'Uno o más artículos no están disponibles'.
- **Evidence:** code review. It cannot be reproduced until QA-06 is fixed.
- **Root cause:** `src/app/(main)/sales/page.tsx:18` selects only `catalog_items`. The client checks are in `SalesWorkspace.tsx:298-303`, and the server side is in `20260913152157_*.sql:330-343`.
- **Fix:** fetch `catalog_item_overrides` for the org in `sales/page.tsx`, merge the effective price and currency, and drop items with `is_enabled=false`, reusing the merge from `CatalogWorkspace`.
- **Verify:** with an override at 3300 → verificar: the card shows 3300, an agreed price of 3300 needs no reason, and a disabled item is hidden.

- **Done (2026-10-02):** `src/app/(main)/sales/page.tsx` loads the organization's overrides and expands base items per organization with the effective price and currency, dropping disabled ones. `SalesWorkspace` is unchanged. Verified: `/sales` shows 'Bifocal · Blanco Base: 26 USD', 'Progresivo · Blanco' is hidden, and the saved quotation totals 26 USD (10,920 CUP).

### QA-08 Premature 'Pedido listo' notification (high, M)
- **Problem:** `order_ready` is queued the moment all current jobs are received or reviewed.
  - A lens-only order with no mounting job yet triggers it at the first reception, even when that lens is later found defective.
  - The dedupe key `order_ready:<order_id>` means the legitimate 'ready' after a rework is never sent.
  - It contradicts BUSINESS_LOGIC: 'El vendedor decide cuándo notificar'.
  - With consent ON, the customer would have been told to pick up unfinished glasses.
- **Evidence:** `private.notification_dispatches` for JAV order 8: `order_ready` requested at 10:51:05, before the incident. It failed only because consent was OFF (missing_consent).
- **Root cause:** the `private.notify_order_ready` trigger on `production_job_events`, plus `queue_openwa_notification` with `source_event_key 'order_ready:'||order_id` and `ON CONFLICT DO NOTHING`.
- **Fix:**
  - Remove the automatic trigger, or restrict it to orders whose mounting job exists and is reviewed.
  - Add an explicit 'Avisar: listo para recoger' action in OrderDetail that calls a SECURITY DEFINER `queue_order_ready(order_id)`, keyed per event so it can be re-sent after a rework.
  - This action also feeds the delivery dimension (QA-14).
- **Verify:** a lens-only order received → verificar: no dispatch row; owner clicks 'Avisar' → verificar: 1 dispatch; after a rework, 'Avisar' again → verificar: a 2nd dispatch is allowed.

- **Done (2026-10-02):** what changed:
  - Migration `20261002180000_make_order_ready_notification_manual.sql`, applied and registered by the product owner. It drops the automatic trigger and adds `notify_order_ready(order_id, request_id)`, which checks permissions and the WhatsApp module and uses one dispatch key per click, so a retry is safe and a re-send after a rework is allowed.
  - The OrderDetail footer has an 'Avisar: listo para recoger' button, with copy explaining that 'Pedido listo' is manual.
  - The request-id helper moved to `src/shared/utils/request-id.ts`.
  - Verified with JAV-2026-000018 and the product owner's number:
    - lens job 16 taken to `received` → no `order_ready` dispatch;
    - 2 'Avisar' clicks → 2 `order_ready` dispatches with distinct keys;
    - full payment → `payment_received`;
    - delivery → `order_delivered`.
    - All attempts are stored `provider_http_500` (QA-61 false negative).
  - Related UI fix requested by the product owner: the production card's 'Ver receta de fabricación' now opens a dialog instead of an inline `<details>`, so expanding it no longer stretches the grid row (`ProductionJobCard.tsx`).

- **Follow-up (2026-10-02, product owner request):** WhatsApp notices now identify the shop and the sender, because customers receive them from the app's number and not the shop's. Changes:
  - Migration `20261002182801_identify_sender_in_whatsapp_notifications.sql` updates the templates with `{{store_name}}` and `{{payment_amount}}`, formats amounts as es-CU ('54 100', '16,67') via `private.format_amount_es`, and appends the signature 'Te atendió <nombre>. Si tienes dudas, escríbele al <teléfono>; este número solo envía avisos.' The phone comes from the actor's profile, else the owner's; without a phone the line is omitted. It also fixes the mojibake in the failure messages.
  - UI: the sidebar account opens 'Mi perfil' to edit the name and the contact phone (`src/shared/components/AccountProfileDialog.tsx`).
  - Verified: Javier's phone was saved from the dialog, and the new sale JAV-2026-000019 sent 'En Óptica Javier confirmamos tu pedido…' and 'Óptica Javier registró tu pago de 1 000 CUP… Saldo pendiente: 6 000 CUP', both signed with his phone.

### QA-09 `/production` crashes when the refetch fails (high, S)
- **Problem:** after a successful assign, transition, incident or rework, a failed `list_accessible_production_jobs` refetch replaces the whole route with 'This page couldn't load', even though the mutation committed.
- **Evidence:** `refresh-cache-code/03-production-refetch-failure.png`. The job was created as pending.
- **Root cause:** `src/features/production/components/ProductionWorkspace.tsx:69-73` (`if (error) throw error`) is awaited inside `startTransition` at :81/:91/:111/:121 with no try/catch. There is no `error.tsx` under `src/app`.
- **Fix:** make `refreshJobs` return a boolean and show 'Guardado, pero no pudimos actualizar la lista. Recarga cuando vuelva la señal.' Add try/catch in the transition bodies. Add `src/app/(main)/error.tsx`, shared with QA-28.
- **Verify:** abort the refetch after an assign → verificar: the page stays, the warning shows and the job exists.

- **Done (2026-10-02):** `refreshJobs` returns a boolean instead of throwing. Every mutation then shows its success copy plus 'No pudimos actualizar la lista; recarga cuando vuelva la señal.' when the reload failed. A new `src/app/(main)/error.tsx` (Next 16 `retry` prop) replaces the framework error page with 'No pudimos cargar esta pantalla' and a 'Reintentar' button, keeping the sidebar. Verified: the QSB owner assigned a job with `list_accessible_production_jobs` aborted, the page stayed, the warning showed, and job 17 exists.

### QA-10 Delivery attributed to 'Sistema' (medium, S)
- **Problem:** the timeline shows 'Pedido entregado · … · Sistema'. BUSINESS_LOGIC: 'Siempre se identifica al usuario que ejecutó la acción'.
- **Evidence:** `solo-owner/14-orders-delivered-timeline.png`. The `orders` table has no `delivered_by`.
- **Root cause:** `public.mark_order_delivered` (`20260913155559_*.sql:191-194`) sets only status and `delivered_at`. The `get_order_timeline` delivery branch (`20260921103601_translate_production_statuses_to_spanish.sql:85-86`) uses `null::uuid`.
- **Fix:** migration adding `orders.delivered_by uuid references profiles`, set to `auth.uid()` in `mark_order_delivered` and used in the timeline.
- **Verify:** deliver as javier → verificar: 'Pedido entregado · Javier …'.

- **Done (2026-10-02):** migration `20261002183635_attribute_order_delivery.sql` adds `orders.delivered_by`. It is stamped with `auth.uid()` by a BEFORE trigger, has no UPDATE grant so it cannot be spoofed, is backfilled for the 4 past deliveries from the `order_delivered` dispatch actor, and is used by `get_order_timeline`. Verified: delivering QSB-2026-000002 shows 'Pedido entregado · QA Solo B Dueño', and a direct REST update of `delivered_by` is denied.

### QA-11 Client 'today' in UTC (medium, S)
- **Problem:** at 21:30 in Havana, 'Fecha de la receta' defaults to the next day, which is wrong clinical data. The birth-date max has the same bug. The dashboard default range and `orders/format.ts` (no `timeZone`) diverge between a UTC server (Vercel) and the client, causing hydration mismatches and wrong 'hoy'/'ayer' labels.
- **Evidence:** `refresh-cache-code/05-havana-2130-prescription-date-tomorrow.png`. The script run at 21:30 Havana produced the default 2026-10-03.
- **Root cause:** `new Date().toISOString().slice(0,10)` in `src/features/prescriptions/components/PrescriptionFormFields.tsx:51`, `src/features/customers/components/CustomerFormFields.tsx:26` and `src/app/(main)/dashboard/page.tsx:15-18`. `src/features/orders/format.ts:2-4,8` passes no timeZone.
- **Fix:** add a `todayIn(tz)` helper using `Intl.DateTimeFormat('en-CA', { timeZone })` with the org timezone (default `America/Havana`), and add `timeZone` to the formatters in `format.ts` and to `dayKey`.
- **Verify:** emulate Havana 21:30 → verificar: default 2026-10-02; run SSR under TZ=UTC → verificar: no hydration warning on `/orders`.

### QA-61 WhatsApp delivered but recorded as failed (high, S–M)
- **Problem:** OpenWA *delivers* the message and then answers HTTP 500 ('Internal server error'). The Edge Function treats any non-2xx response as a failure, so every message actually sent is stored as `failed / provider_http_500`, with no `provider_message_id`. As a result:
  - The order history tells the seller the WhatsApp was not sent when the customer did receive it.
  - The message cannot be traced.
  - Any future 'retry failed' feature would send duplicates to the customer.
  - There are 6 such attempts since 2026-09-21 (`order_accepted` ×2, `payment_received` ×3, `order_ready` ×1). Most likely all of them were delivered.
- **Evidence:** controlled test on 2026-10-02 with the product owner's number (+53 5256 4206).
  - Customer 'QA PILOTO WhatsApp' (id 62, consent ON); order JAV-2026-000018 (id 27); 500 CUP deposit.
  - The phone received both messages at 07:43 Havana: 'Tu pedido JAV-2026-000018 fue confirmado…' and 'Registramos tu pago… Saldo pendiente: 54100.00 CUP.'
  - At the same instant (11:43 UTC), `notification_attempts` stored both as failed `provider_http_500`, with chatId `5352564206@c.us`. Edge logs show 2 × `POST | 502 | /functions/v1/send-whatsapp-notification`.
- **Root cause:**
  - In OpenWA (VPS): `POST /sessions/{session}/messages/send-text` sends and then fails while building its response. Candidates: Vault `vision_studio_openwa_session_id` holding the alias instead of the UUID (memory `2026-09-20-openwa-notifications.md`), or a post-send lookup in that OpenWA version. Check the OpenWA logs at 11:43 UTC.
  - In our code: `supabase/functions/send-whatsapp-notification/index.ts` around `const sent = response.ok && raw.success !== false` maps every 5xx to a definitive `failed`.
- **Fix:**
  1. Fix OpenWA so a successful send returns 2xx and a `messageId`, starting with the session UUID check.
  2. Harden the Edge Function: a 5xx/timeout after the request reached OpenWA is ambiguous. Record it as `failed` with `failure_code 'provider_unconfirmed'`, or add an `outcome 'unconfirmed'` if the check constraint allows it, plus a Spanish history label such as 'WhatsApp enviado sin confirmación del proveedor'. Never offer an automatic retry for it.
  3. Keep the raw provider body (truncated) when it is not JSON.
- **Status (2026-10-02): PENDING on the VPS (product owner).** Our side is done; the OpenWA fix stays open until the product owner checks the Vault session id and the OpenWA logs.
- **Done (2026-10-02, our side):** the Edge Function records a 5xx answer as `failure_code 'provider_unconfirmed'` (non-JSON bodies kept, truncated) and `get_order_timeline` labels it 'WhatsApp enviado sin confirmación del proveedor' (migration `20261002195414`). The 6 historical `provider_http_500` attempts keep their old code. Still pending: the OpenWA fix on the VPS (session UUID in Vault).
- **Done (2026-11-05, OpenWA side):** the old OpenWA session broke and the product owner brought up a new one (same base URL and API key). Vault `vision_studio_openwa_session_id` now holds the new session UUID `05523cac-0c21-4c16-a092-4830337516b7` (alias `robert-us`, sender +1 575 263 9686). Verified from SQL: `GET /sessions/<id>` → 200 `ready`; `send-text` to `5353077035@c.us` → **201** `{messageId,timestamp}`, received on the phone. No 5xx, so the Edge Function will now store `sent` with `provider_message_id`. The product owner waived the in-app end-to-end re-test. The 5xx → `provider_unconfirmed` handling stays as a safety net. **QA-61 closed.**
- **Copy polish (low):** the payment message should state the amount paid and format money as '54 100,00 CUP' (es-CU grouping) instead of '54100.00'.
- **Verify:** continue JAV-2026-000018 → verificar:
  - the next notification is stored `sent` with a `provider_message_id` and arrives once;
  - 'Pedido listo' (manual after QA-08) and 'Pedido entregado' arrive once each.
  - JAV-2026-000018 was deliberately left without production and delivery, so `order_ready:27` and `order_delivered:27` are unused for this re-test.

- **Done (2026-10-02):** `src/shared/utils/dates.ts` adds `todayIn`, `daysAgoIn` and `BUSINESS_TIME_ZONE = 'America/Havana'`. They are used by the prescription date default, the birth-date max, the dashboard default range, and the `orders/format.ts` formatters plus 'hoy'/'ayer'. The onboarding form's subscription dates (admin-only) were left unchanged. Verified: at a fixed 2026-10-03T01:30Z (21:30 Havana), 'Nueva receta' defaults to 2026-10-02 with the browser in America/Havana and in UTC.

## Phase 2 — Core sale flow friction (product owner's top priority)

Target for a solo owner on a phone:
- Existing customer: pick the customer and items, then 'Cliente acepta', pay, and send to production. That is 1 screen with no navigation.
- New customer: one dialog more.
- Today's shortest path is 6 clicks; the full path with a prescription is 11–16 clicks and 10–23 fields.

### QA-12 Searchable customer picker (high, M)
- **Problem:** `/sales` 'Cliente' is a plain list of every customer with no typing filter. It is capped at the first 200 by name, and revisions at the newest 200 per branch. Already friction with 20 customers. Past 200, customers become unreachable, which pushes sellers to create duplicates.
- **Evidence:** `09-refresh.mjs` showed customerOptionsCount=20. Code: `src/app/(main)/sales/page.tsx:32-33`, `src/features/sales/components/SalesWorkspace.tsx:392-397`.
- **Root cause:** server preload instead of query-on-demand.
- **Fix:**
  - A typeahead (≥2 chars, ~300 ms debounce, limit 20) that searches name `ilike` or normalized phone, reusing the `/customers` query, preloaded with the 10 most recent customers.
  - Load revisions only for the selected customer.
  - A 'Nueva venta' button on the `/customers` card → `/sales?clienteId=…`.
- **Verify:** seed 250 customers → verificar: 'Zoila…' is found by name and by the last 4 phone digits; the `/sales` RSC payload no longer grows with the customer count.

- **Done (2026-10-02):** `CustomerSearchPicker` searches by name or any part of a phone (≥2 chars, 300 ms debounce, 12 results, scoped to the branch) and lists the 10 most recent customers. Prescriptions load only for the selected customer (latest 20). `/sales/page.tsx` no longer preloads 200 customers and 200 revisions. Verified on desktop (by name) and at 390 px (by the phone digits '0403'). Pending: a 'Nueva venta' button on the `/customers` card with `?clienteId=`.

### QA-13 Assign production from the sale/order (medium, M)
- **Problem:** sending lenses to the lab requires going to `/production`, opening a dialog, and finding the order in a selector. The selector lists every order, including delivered ones and orders that already have a job, labelled by number only. It defaults to the newest order and the provider is not preselected. That is 6 clicks plus navigation, with a risk of the wrong order.
- **Evidence:** `multirole/javier-assign-dialog.png`.
- **Root cause:** assignment exists only in `ProductionWorkspace`. The order options come from `src/app/(main)/production/page.tsx:10-15` (all orders). The label is at `ProductionWorkspace.tsx:202`, the default `orders[0]` at :57, and `selectedProviderId` starts as `''`.
- **Fix:**
  - Add 'Enviar a cristalero / montaje' on `AcceptedOrderPanel` and `OrderDetail`, calling `assign_production_job` with the order id.
  - Auto-select the provider when exactly one is eligible. After QA-01 that includes 'Taller propio' (the owner).
  - In the dialog, filter to accepted orders without a current job of that type and label options '`JAV-…-000003 · Cliente`'.
- **Verify:** solo owner: accept → 'Enviar a taller' → verificar: 1 click creates the job for the right order; dialog → verificar: delivered orders are absent.

- **Done (2026-10-02):** what changed:
  - New `OrderProductionPanel` (production feature) shows the current lens/mounting jobs with their responsible and status. For missing job types it offers a responsible select (providers plus the user as 'taller propio', auto-selected when it is the only option) and 'Enviar'. It appears on the post-sale `AcceptedOrderPanel` and in the `/orders` detail.
  - In `/production` the assignment dialog lists only accepted orders without an active job of that type, labelled 'número · cliente', with none preselected.
  - Verified: on QSB-2026-000007 right after the sale, lens and mounting were sent with 1 tap each; the dialog lists '000006 · QA PILOTO Adjuntos' and excludes orders that already have a job.

### QA-14 Delivery tied to production / 'Listo para recoger' (medium, M — needs a product decision)
- **Problem:** an order can be delivered while lenses are pending, in incident, or still at the provider, with no warning. OrderDetail shows no production status. The delivery dimension in BUSINESS_LOGIC (no listo / listo para recoger / cliente notificado / entregado) and the 'cerrado' status are not implemented. The guard even forces delivered→closed, but nothing ever sets it.
- **Evidence:** QAS-2026-000001 was delivered while job 10 was dispatched. MR `05-orders` showed detailMentionsProduction=false.
- **Root cause:** `public.mark_order_delivered` checks only status and balance. `src/features/orders/components/OrderDetail.tsx` has no production data.
- **Fix (minimal):**
  - Add a strip 'Cristales: estado · Montaje: estado' in OrderDetail, built from the current jobs.
  - Derive 'Listo para recoger' when every current job is received or reviewed, and host the QA-08 'Avisar' button there.
  - Show a non-blocking confirm before delivering early: 'La producción no está revisada, ¿entregar igual?'.
  - Product owner decides whether 'cerrado' and 'cliente notificado' are stored states or are dropped from the model.
- **Verify:** order with pending lens → verificar: the strip shows 'Pendiente' and delivering asks for confirmation; all reviewed → verificar: 'Listo para recoger'.

- **Done (2026-10-02, product decision: warn, not block):** the order production panel shows each job's status and a 'Listo para recoger' badge when every current job is received/reviewed. 'Marcar como entregado' with unfinished or missing production opens '¿Entregar igual?' ('Volver' / 'Entregar igual'). 'Cerrado' and 'cliente notificado' remain derived and are not stored. Verified on QSB-2026-000007: fully paid, delivery showed the warning and 'Volver' kept it accepted.

### QA-15 Live total and one-step accept (medium, M)
- **Problem:** no price appears until 'Guardar cotización'. Save runs `calculate_sale_price` and then `save_quotation` sequentially, even though `save_quotation` recomputes the price. Then 'Cliente acepta' is a separate step, and every change resets the quote. The 'Organización y sucursal' select shows even with a single scope.
- **Evidence:** the save step takes 2 sequential RPCs: 417+382 ms on a fast link, 1.9 s throttled.
- **Root cause:** `src/features/sales/components/SalesWorkspace.tsx:286-336` and `QuoteSummary.tsx:227-230`.
- **Fix:**
  - Have `save_quotation` return the pricing jsonb and drop the first RPC; until then, use `Promise.all` as an interim step.
  - Show a client-side running total marked 'estimado'.
  - Make 'Cliente acepta · crear pedido' the primary action that saves and accepts when the quote is unsaved, with 'Guardar cotización' as the secondary action.
  - Hide the scope select when there is one scope.
- **Verify:** existing customer + 1 item → verificar: total visible before saving, accept in 1 click, ≤ 2 RPCs to an accepted order.

- **Done (2026-10-02, interim):** what changed:
  - A live 'Total estimado' (agreed prices per currency plus the CUP equivalent at the sale rate) shows before saving, noting that graduation surcharges are confirmed on accept.
  - 'Cliente acepta · crear pedido' is the primary action and saves when needed, then accepts. 'Guardar cotización' is secondary.
  - `calculate_sale_price` and `save_quotation` run in parallel.
  - The scope select is hidden with a single scope.
  - Verified: an existing customer plus 1 item, then 1 tap, gave the order in about 0.9 s with RPCs calculate+save (parallel) then accept.
  - Still pending: `save_quotation` returning the pricing so one RPC can be dropped.

### QA-16 Mobile sticky action bar (medium, S)
- **Problem:** at 390 px the summary and the Save/Accept buttons sit after 13–14 catalog cards and the notes field. The page is about 3019 px tall, so the seller scrolls several screens for each change.
- **Evidence:** `sales-friction/mobile-quotation.png`, `solo-owner/m-06-sale-quote.png`.
- **Root cause:** `QuoteSummary.tsx:195` is sticky only at xl. `ItemPicker.tsx:135` uses `grid-cols-1` below sm.
- **Fix:**
  - Below xl, add a fixed bottom bar using the existing tokens and safe-area padding, holding the total or item count and the primary action.
  - Use 2-column item cards on mobile, or collapsible categories.
- **Verify:** at 390x844 → verificar: total + primary action visible at every scroll position, no horizontal overflow, and the bar does not cover the last field.

- **Done (2026-10-02):** below xl a fixed bottom bar shows the total (estimated or confirmed), the item count and 'Cliente acepta', with safe-area padding and `pb-24` on the form. Item cards use 2 columns on mobile, and long names wrap. Verified at 390x844: the bar is visible, no card or page overflows horizontally, and accepting from the bar created QSB-2026-000005.

### QA-17 Persist the sale draft (medium, S)
- **Problem:** a reload, back navigation, tab eviction or the offline error page (QA-28) resets the customer, items, agreed prices, rate (back to 420) and notes. Saved-but-unaccepted quotations cannot be resumed: 11 are orphaned in org 2.
- **Evidence:** `05-lostaccept-draft.mjs`, RC `04-concurrency.mjs` and PERF `offline.mjs`.
- **Root cause:** all state is `useState` in `SalesWorkspace.tsx:63-88`.
- **Fix:**
  - Store `{scopeKey, customerId, revisionId, selected, agreedPrices, adjustmentReasons, rate, notes, quotationId}` in localStorage under `lensspace:sale-draft:<userId>:<branchId>`, inside try/catch and debounced at 500 ms.
  - On restore, validate the IDs and show the notice 'Recuperar venta en curso'. Clear the draft on accept and on 'Nueva venta'.
  - Never cache balances or payments.
- **Verify:** fill a draft and reload → verificar: restored; accept → verificar: draft cleared.

- **Done (2026-10-02):** the sale draft (customer, prescription, items, agreed prices, reasons, rate and notes) is stored in localStorage under `lensspace:sale-draft:<userId>:<org:branch>`, debounced at 500 ms, inside try/catch and with a 24 h TTL. The notes field is now controlled. On return, 'Tienes una venta sin terminar' offers 'Recuperar' / 'Descartar'; restoring drops items no longer available. The draft is cleared on accept and on 'Otra venta', and is skipped for `?clienteId` deep links. Balances and payments are never stored. Verified: rate 410, a customer, an item and a note survived a reload and were restored, the draft was gone after accepting QSB-2026-000008.

### QA-18 USD full-balance residue (medium, S — product rule)
- **Problem:** 'Cobrar saldo completo' in USD fills `floor(balance/rate)` (16.66 USD for 7000 CUP at 420) and leaves 2.80 CUP owing. 16.67 is rejected as an overpayment, so the order cannot be settled in USD alone and delivery stays blocked.
- **Evidence:** JAV-2026-000016; `sales-friction/usd-full-balance-residue-mobile.png`.
- **Root cause:** `src/features/orders/components/PaymentForm.tsx:24,34`. On the server, `prepare_cash_payment` in `20260920221232_*.sql:123` has no tolerance.
- **Fix (suggested rule):** when currency = USD and the overshoot is less than `rate × 0.01`, accept and cap `equivalent_cup` at the remaining balance. The client uses `Math.ceil` with the same tolerance.
- **Verify:** 7000 CUP at 420 paid as 'saldo completo' USD → verificar: balance 0 and delivery enabled.

- **Done (2026-10-02):** migration `20261002185730_allow_usd_rounding_on_final_payment.sql` lets a USD payment exceed the balance by less than one USD cent at the applied rate; `payment_status` becomes `paid`. In `PaymentForm`, 'Cobrar saldo completo' in USD rounds up to the cent (float-safe), the over-balance check uses the same tolerance, and the feedback reads 'salda el pedido (redondeo de X CUP)'. Verified: 7000 CUP at 420 gives 16.67 USD (7001.4 CUP), the balance is 0 and delivery is enabled.

### QA-19 Duplicate warning in Nueva venta (medium, M)
- **Problem:** an exact name match silently selects the existing customer and keeps blocking, so a real homonym can never be created from a sale. There is no phone check at all. BUSINESS_LOGIC asks to warn, not forbid.
- **Evidence:** `sales-friction/homonym-blocked.png`; customer 51 was created on an existing phone.
- **Root cause:** `SalesWorkspace.tsx:162-173` matches an exact name among the preloaded customers and returns early.
- **Fix:** extract the `/customers` duplicate query (name `ilike` + normalized phone) into a shared helper and list the matches with 'Usar este cliente' and 'Es otra persona, crear'.
- **Verify:** same name with a different phone → verificar: a warning, then confirm creates the customer; same phone → verificar: a warning appears.

- **Done (2026-10-02):** `src/features/customers/phone.ts` (`findDuplicateCustomers`) checks for the same name (ilike) or a shared canonical phone within the branch. 'Nuevo cliente' in a sale warns once, listing the matches with 'Usar este cliente'; pressing 'Crear y seleccionar' again creates the homonym. Verified: '50000403' matched 'QA PILOTO Idempotencia 2' (+53 5000 0403) and 'Usar este cliente' selected it; a same-name customer with another phone warned and was then created.
### QA-20 Canonical Cuban phone numbers (medium, S)
- **Problem:** '50000101' and '+53 5000 0101' are stored as different normalized numbers, so the duplicate check misses them. WhatsApp through OpenWA needs the country code.
- **Evidence:** customer 55 is stored as '50000101' while others are '5350000101'; `sales-friction/customers-duplicate-warning.png`.
- **Root cause:** exact `.in('normalized_phone', …)` in `src/features/customers/components/CustomerWorkspace.tsx:183-187` and `:149-155`, and a prefill that copies the raw query (`:280-281`).
- **Fix:** prefix 53 to 8-digit numbers in the shared `normalizePhone` and in the DB normalization path, and backfill in a migration.
- **Verify:** '50000101' → verificar: stored as 5350000101 and flagged as a duplicate.

- **Done (2026-10-02):** migration `20261002193033_canonical_cuban_phone_numbers.sql` changes the generated `customer_phones.normalized_phone` to prefix 53 to 8-digit numbers (PG17 `SET EXPRESSION`); all 34 rows now carry 53. `canonicalPhone` mirrors the rule on the client and is used by the `/customers` and sale duplicate checks.
### QA-21 Pending feedback and request timeout (medium, S)
- **Problem:**
  - The Save, Accept and Register payment buttons only go disabled for 1.9–2.2 s on a slow link, with the same label.
  - A hung request (25 s) silently locks the form, then blames the amount.
- **Evidence:** `refresh-cache-code/05-hung-payment-no-feedback.png`.
- **Root cause:** static labels in `QuoteSummary.tsx:229-230` and `PaymentForm.tsx:83`. `src/lib/supabase/client.ts` has no fetch timeout.
- **Fix:**
  - Add the labels 'Guardando…', 'Creando pedido…' and 'Registrando…'.
  - Give `createBrowserClient` a `global.fetch` wrapper with `AbortSignal.timeout(20000)`.
  - Treat a timeout as an unknown outcome and handle it like QA-03/QA-04. Ship the timeout only together with QA-03.
- **Verify:** 25 s delay → verificar: the label changes immediately, then after about 20 s 'Sin conexión…' appears and the balance is re-read.

- **Done (2026-10-02):** `src/lib/supabase/client.ts` wraps the browser client's fetch with `AbortSignal.timeout(20000)` (Storage uploads are exempt; requests with their own signal too). `isNetworkError` also recognises 'timed out'. Labels now read 'Guardando…' (Guardar cotización), 'Procesando…' (Cliente acepta) and 'Registrando…' (Registrar pago). Verified: with `register_cash_payment` delayed 25 s the label changed at once, after 20.5 s 'Sin conexión: no sabemos si el cobro llegó…' appeared, and the retry left exactly 1 payment (QSB-2026-000008).
### QA-22 Sensible rate default and validation (low, S)
- **Problem:** the rate always defaults to a hardcoded 420, both in `/sales` and the `/catalog` simulator. 99999 is accepted silently. Empty or 0 is blocked only by the browser's native bubble, which can appear in English. A wrong rate is frozen on accept.
- **Root cause:** `SalesWorkspace.tsx:75` and `CatalogWorkspace.tsx:73` (`useState('420')`); the rate input at `SalesWorkspace.tsx:415-429`.
- **Fix:**
  - Default to the org's latest `orders.usd_to_cup_rate`, falling back to 420, and remember it with the QA-17 draft.
  - Validate in the app (`noValidate`) with Spanish copy.
  - Ask for confirmation when the rate is more than 30 % away from the last one.
- **Verify:** sell at 410 and reopen `/sales` → verificar: 410; enter 99999 → verificar: a confirm prompt.

- **Done (2026-10-02):** `/sales` defaults the rate to the organization's latest order rate, falling back to 420, and switches it per scope. The form is `noValidate`, so a missing or ≤0 rate is rejected with Spanish copy. A non-blocking warning appears when the rate is more than 30 % away from the last one. Verified: after selling at 410, `/sales` defaulted to 410, and 999 showed the warning.
- **elTOQUE rate (2026-10-02, product owner request):** 'Actualizar con elTOQUE' under the sale rate.
  - The Edge Function `refresh-exchange-rate` calls `tasas.eltoque.com/v1/trmi` (Bearer `ELTOQUE_API_TOKEN` secret; request one at https://tasas-token.eltoque.com/) at most once per Havana day for the whole platform, caching the day in `market_exchange_rates` (service-role writes only).
  - `adopt_market_usd_rate(org)` (owner/seller with `optical_sales`) copies that value to `organizations.usd_to_cup_rate`; it takes no rate parameter, so it cannot be faked. The rate stays until the next tap; a second tap on the same day reuses it without a network call ('Usar tasa de hoy').
  - Default rate order in `/sales` and the `/catalog` simulator: business rate → last order rate → 420. The seller can still type another rate for one sale.
  - Migration `20261002194704_add_eltoque_exchange_rate.sql`. Verified: without a token the button shows 'Falta configurar el acceso a elTOQUE.'; with a seeded market row it set 455, kept it after a reload, and `/catalog` defaulted to 455. Not verified: a real elTOQUE response (no token yet). Needs: the `ELTOQUE_API_TOKEN` secret.
  - **Status (2026-11-06): token stored** as the Edge Function secret (verified 200 against elTOQUE); in-app button check pending.
  - **Status (2026-10-02): WAITING.** The product owner requested the token at tasas-token.eltoque.com (origin declared as server; elTOQUE says approval can take up to a week). When it arrives: store it as the Edge Function secret `ELTOQUE_API_TOKEN`, press 'Actualizar con elTOQUE' once and confirm the rate and `market_exchange_rates` row. Until then the button explains the missing configuration and sales default to the last order rate.

### QA-23 Password recovery (medium, S)
- **Problem:** a sole owner who forgets the password has no way back except the Supabase dashboard.
- **Root cause:** no `resetPasswordForEmail` call anywhere. `src/app/(auth)/auth/callback/page.tsx:55` already accepts the `recovery` flow.
- **Fix:**
  - Add a 'Recuperar contraseña' link on `/login` to a small form whose server action calls `resetPasswordForEmail(email, { redirectTo: origin + '/auth/callback' })` and always returns a neutral confirmation.
  - Add an 'Enviar enlace de restablecimiento' action in the superadmin org detail.
  - Check the redirect allowlist and the SMTP rate limit.
- **Verify:** request a reset for the QA owner → verificar: the email link → `/set-password` → login works; an unknown email → verificar: the same neutral message.

- **Pending items closed (2026-10-02):**
  - Migration `20261002191121_add_retry_safe_priced_quotation_save.sql` adds `save_sale_quotation`. It saves and returns `{quotationId, pricing}` in one call, and with `quotation_request_id` it reuses the quotation of an earlier attempt, backed by `quotations.client_request_id`, a unique index (seller, key) and an UPDATE grant on that column only. Verified: a lost save response followed by a retry made 2 save calls, created 1 quotation and then accepted; a normal accept is 2 RPCs.
  - The `/customers` card has a primary 'Nueva venta' link to `/sales?clienteId=…`; the page loads that customer and their prescriptions server-side and selects their branch. Verified: QSB-2026-000006 was created for the linked customer.
  - The 'Adjuntar original' action on each revision in `/prescriptions` uses a shared `uploadPrescriptionOriginal` helper that now also backs the sale and prescription forms. Verified: a PDF was added to an existing revision that already had a PNG.

## Phase 3 — Refresh and staleness

Principle for the pilot: **no polling and no Realtime**, to keep bandwidth low. Refresh after the user's own mutations, on window focus or visibility change, on the `online` event, and after an error.

- **Done (2026-10-02, self-service):** the `/login` link '¿Olvidaste tu contraseña?' leads to `/forgot-password` (`ForgotPasswordForm`). The `requestPasswordReset` server action calls `resetPasswordForEmail` with `redirectTo: <request origin>/auth/callback` (already routes `recovery` to `/set-password`) and always returns the same neutral message. Verified: an unknown email gets the neutral confirmation. Not verified: the real email link (no test mailbox). The origin must be in Supabase Auth's redirect allowlist, otherwise the Site URL is used. Pending: the superadmin 'Enviar enlace de restablecimiento' action.
- **Done (2026-10-02, admin):** the organization detail in `/organizations` lists active owners with 'Enviar enlace de restablecimiento'. The `sendOwnerPasswordReset` server action resolves the email with `platform_owner_email(user_id)` (platform admin only, owners only; migration `20261002195224`) and calls `resetPasswordForEmail`. Verified: Auth logged `user_recovery_requested` for the QA owner; it was rejected only because `@lensspace.test` cannot receive mail, which now reads 'El correo … no puede recibir mensajes.'
### QA-24 Sidebar counters stale (medium, S)
- **Problem:** 'Pedidos y cobros' and 'Producción' badges stay unchanged through accept, payment, delivery and assign, and through soft navigation. Only a hard reload updates them. This undermines the feature from commit 699a383.
- **Evidence:** RC `02-refresh.mjs` showed the badge at 5 through every step and 6 after a reload; `refresh-cache-code/02-badge-stale-after-accept.png`. The intercepted soft-navigation RSC payload contains no layout.
- **Root cause:** counters are computed in `src/app/(main)/layout.tsx:78-89` (`loadShell` → `get_navigation_counters`), and layouts are not re-rendered on soft navigation. None of these call `router.refresh()`: `SalesWorkspace.tsx:338-353`, `OrderPaymentsWorkspace.tsx:64-85`, `AcceptedOrderPanel.tsx:33-46`, `ProductionWorkspace.tsx:75-123`, `CashboxWorkspace.tsx:38-50`.
- **Fix:** call `router.refresh()` after each successful mutation, after the local state update. A lighter alternative is a client counter component that refetches `get_navigation_counters` on a `lensspace:mutated` event and on focus, throttled to once per 60 s.
- **Verify:** accept an unpaid order → verificar: the badge increments without a reload; pay in full → verificar: it decrements.
- **Done (2026-10-02):** the lighter alternative. `src/shared/lib/navigation-counters.ts` is a shared client store (`useSyncExternalStore`) used by `MainNavigation`; `refreshNavigationCounters()` (one `get_navigation_counters` RPC, deduplicated while in flight) runs after accept, payments, delivery, production assignment/transitions/incidents/reworks. A new server render of the layout (refresh) resets the store; a menu that mounts later (mobile drawer) does not. Verified: 'Pedidos y cobros' went 3 → 4 after accepting from `/sales` and back to 3 after paying in `/orders`, with no reload.

### QA-25 Superseded jobs counted (medium, S)
- **Problem:** after 'Aceptar repetición', the superseded incident job (`is_current=false`) is still counted. 'Trabajos activos' shows 3 instead of 2, and 'Con incidencia 1' stays forever, in both the sidebar and the stat cards.
- **Evidence:** QAS job 9 and JAV job 6; `solo-owner/12-production-incident-rework.png`, `multirole/claudia-after-rework-mobile.png`.
- **Root cause:** `public.get_navigation_counters` has no `is_current` filter. `ProductionWorkspace.tsx:140-160` filters active jobs and stats by status only. `list_accessible_production_jobs` does not expose `isCurrent`.
- **Fix:**
  - Add `and job.is_current` to the counters (migration) and expose `isCurrent` in the jobs RPC.
  - Filter active jobs and stats in `ProductionWorkspace`.
  - Render superseded jobs collapsed with the label 'Sustituido por repetición'.
- **Verify:** incident → rework → verificar: active = 2 and incident = 0, in both the sidebar and the stats.
- **Done (2026-10-02):** migration `20261002200721_exclude_superseded_jobs_from_counters.sql` (counters filter `is_current`; jobs RPC exposes `isCurrent`). `ProductionWorkspace` computes stats from current jobs only, and `ProductionJobCard` renders superseded jobs as a short inert card 'Sustituido por repetición'. `list_accessible_orders.hasOpenIncident` already ignored incidents with a rework. Verified in QAS: the sidebar dropped from 3 to 2, 'Con incidencia' 0, one superseded card.

### QA-26 Back/forward shows stale lists (medium, S)
- **Problem:** after paying an order in full, navigating away and pressing Back shows '3,000 · Pendiente de pago'.
- **Evidence:** `refresh-cache-code/02-after-back-navigation.png`.
- **Root cause:** `src/features/orders/components/OrderPaymentsWorkspace.tsx:24` uses `useState(initialOrders)`, and the router cache reuses the payload. `ProductionWorkspace` (`initialJobs`), `CashboxWorkspace` and `SalesWorkspace.tsx:68-69` follow the same pattern. `router.refresh()` alone will not reset those copies.
- **Fix:** add `router.refresh()` (QA-24) plus `useEffect(() => setOrders(initialOrders), [initialOrders])`, and the same for jobs.
- **Verify:** pay → navigate away → Back → verificar: 'Pagado · por entregar'.
- **Done (2026-10-02):** `useServerState` (`src/shared/hooks/use-server-state.ts`, React's adjust-state-while-rendering pattern) replaces `useState(initialX)` in orders, production and cashbox, and `RefreshOnFocus` refreshes the route on `popstate` (same cost as one link navigation). `/orders` keeps the open order on refresh and reloads its detail instead of jumping to the first one. Verified: QAS-2026-000006/8 paid → Clientes → Back shows 'Pagado · por entregar'.
- **Found and fixed while testing:** `OrderDetail` rendered `PaymentForm` and `OrderProductionPanel` as siblings with the same `key={orderId}` (Phase 2 regression, React duplicate-key error on unpaid orders); the panel now uses `production-<id>`.

### QA-27 Refetch on focus, reconnect and error (medium, S)
- **Problem:**
  - Claudia never sees a newly assigned job, and Javier never sees Claudia's transition, even after 30 s.
  - A second tab keeps a stale balance even after the server rejects its payment.
  - After the superadmin renews a subscription, the open page stays 'Solo lectura'.
  - After disabling modules, soft navigation keeps stale nav links.
- **Evidence:** MR `03-two-roles`, `refresh-cache-code/02-tabB-stale-balance-after-reject.png`, ADM `s4-states.mjs` and `s8-modules.mjs`.
- **Root cause:** there are no focus, visibility or online listeners. `OrderPaymentsWorkspace.tsx:68,80` returns without reloading on error. `canWrite` and `allowedHrefs` are SSR snapshots (`customers/page.tsx:40`, `layout.tsx:34`).
- **Fix:**
  - Add one client `RefreshOnFocus` component in the `(main)` layout that calls `router.refresh()` on visibilitychange (visible) and on `online`, throttled to once per 60 s.
  - After a payment or delivery error, reload the detail and the list.
  - On any 42501, call `router.refresh()` and show the read-only message.
- **Verify:** Claudia's tab goes to the background, Javier assigns, Claudia refocuses → verificar: the job appears; a renewal plus refocus → verificar: forms are enabled.
- **Done (2026-10-02):** `src/shared/components/RefreshOnFocus.tsx` in the `(main)` layout calls `router.refresh()` when the tab becomes visible after ≥ 60 s hidden, on `online` and on back/forward. No polling, no Realtime. A rejected payment now reloads both the detail and the list (not only on network errors). Verified: session B on `/production` showed the job assigned from session A after the connection returned (badge 2 → 3, later 4 → 5); 10 s away → no request; 61 s away → one 8.8 KB RSC refresh with the sale draft intact. Not re-verified: the renewal → refocus case (same mechanism: the layout and page re-render with fresh `canOperate`).

## Phase 4 — Performance and low-bandwidth/offline

Measured in the production build:
- Cold load is about 300 KB per app page (JS about 224 KB gz, of which supabase-js is 66.6 KB; fonts 50 KB). Warm load is 9–17 KB but still 33 requests.
- Throttled cold first contentful paint is 3.1–5.1 s and hydration takes 9–11.7 s.
- Soft navigation is cheap (1–24 KB) but takes 0.5–3 s with no feedback.
- No polling or Realtime is used anywhere, which is good.

**Cache strategy for Cuba (decision proposal):**

| Data | Strategy |
|------|----------|
| `/_next/static/*`, fonts | Browser cache already immutable. Optional SW precache (later). |
| App shell, route skeletons | `loading.tsx` + `experimental.useOffline` (prefetched shells survive drops). Optional offline fallback page via a small hand-written SW. |
| Sale draft, last rate, last route filters | localStorage per user/branch (QA-17, QA-22), try/catch. |
| Recent customer names (≤ 50), catalog items, provider's assigned jobs | Optional local snapshot (localStorage/IndexedDB) for read-only lookup while offline. Revalidate on reconnect (stale-while-revalidate). |
| Balances, payments, cashbox closures, order status, accept | **Live only.** Never cached. Writes stay online-only and become idempotent (QA-03, QA-04) with explicit 'sin conexión' feedback. |
| Full RSC/tenant data responses | Do not cache (tenant privacy, shared devices). |

### QA-28 Offline shell and error boundaries (high, S for the base and M for the optional SW)
- **Problem:** any navigation or reload while offline ends on `chrome-error://chromewebdata/`, and the page state and unsaved forms are lost. The provider has no offline view of her jobs.
- **Evidence:** `solo-owner/21-offline-navigation.png`, `performance-network/offline-sidebar-navigation-mobile.png`, `refresh-cache-code/04-offline-navigation.png`, `multirole/claudia-offline-reload-mobile.png`. Console: 'Failed to fetch RSC payload … Falling back to browser navigation'.
- **Root cause:** there is no `loading.tsx`, `error.tsx` or `global-error.tsx` under `src/app`, and `next.config.ts` is `{}`, so `experimental.useOffline` is off. There is no service worker. `src/app/manifest.ts` is metadata only.
- **Fix:**
  1. Add `src/app/(main)/loading.tsx`, a skeleton with PageHeader and a card using the UI 2.0 tokens.
  2. Add `src/app/(main)/error.tsx` ('use client', Spanish copy, 'Reintentar' → `reset()`) and `src/app/global-error.tsx`.
  3. Set `experimental: { useOffline: true }` in `next.config.ts`. Read `node_modules/next/dist/docs/01-app/02-guides/offline-support.md` first.
  4. Add an `OfflineBanner` using `useOffline()` from `next/offline` (or `navigator.onLine` plus events) with the text 'Sin conexión: tus datos siguen aquí; reintentaremos al volver la señal.'
  5. Later, via tf-add-mobile: a minimal `public/sw.js` that precaches static assets and serves an `/offline` fallback for navigations, and an optional read-only snapshot of the provider's jobs.
- **Verify:** go offline on `/customers` and tap 'Pedidos y cobros' → verificar: still in the app, banner shown, navigation completes after reconnecting; offline reload → verificar: fallback page shown (once the SW ships).

- **Done (2026-10-02, base):** what changed:
  - `next.config.ts` sets `experimental: { useOffline: true }`.
  - `src/app/(main)/loading.tsx` adds a skeleton that serves as the route shell.
  - `src/app/(main)/error.tsx` (from QA-09) and `src/app/global-error.tsx` (own html/body, inline styles, Next 16 `retry`) are in place.
  - `OfflineBanner` (`useOffline` from `next/offline`) sits in the main layout: 'Sin conexión: lo que ves sigue aquí y reintentaremos al volver la señal.'
  - Verified as Javier on dev: going offline on `/customers` and tapping 'Pedidos y cobros' kept the app with the sidebar and banner and no Chrome error page. After reconnecting the navigation finished on `/orders` by itself and the banner disappeared.
  - Pending (Phase 4, item 5): a service worker for full offline reloads and the provider jobs snapshot.
- **Done (2026-10-02, item 5 minimal):** `public/sw.js` intercepts only navigations (navigation preload on) and serves the static `public/offline.html` ('Sin conexión… Reintentar', reloads itself on `online`) when the network fails. It caches nothing else: no tenant data, RSC or API responses. Registered in production only (`ServiceWorkerRegistration` in the root layout); `next.config.ts` serves `/sw.js` with `no-cache` and a strict CSP. Verified on the prod build: controlled page → offline reload shows 'Sin conexión' → back online returns to `/dashboard`. Still pending (optional): a read-only snapshot of the provider's jobs.

### QA-29 Navigation feedback (medium, S)
- **Problem:** the time from click to URL change is 0.5–2.8 s on a fast link and 0.9–3.0 s throttled. The old page stays on screen and the active state does not move, so users tap again. TTFB equals the full response time, so nothing streams.
- **Evidence:** `performance-network/nav-fast.json`, `nav-throttle.json`.
- **Root cause:** there are no Suspense boundaries, and `src/shared/components/MainNavigation.tsx:52-55` has no pending indicator.
- **Fix:** add the `loading.tsx` from QA-28 and use `useLinkStatus` in a nav-item child to show an inline pending state.
- **Verify:** click any nav item → verificar: visual feedback in under 100 ms, then a skeleton.
- **Done (2026-10-02):** `NavIcon` in `MainNavigation` uses `useLinkStatus` and swaps the item icon for a spinning `LoaderCircle` (same slot, no layout shift). Verified on the prod build with 600 ms latency / 40 KB/s: spinner visible 100 ms after tapping 'Recetas', gone on arrival.

### QA-30 Shared friendly error mapper (medium, S)
- **Problem:** users see 'TypeError: Failed to fetch', 'permission denied for table catalog_item_overrides', 'new row violates row-level security policy for table "customers"' and the terse 'Pedido aceptado no disponible.' The payment form blames the amount when the real cause is the network.
- **Evidence:**
  - `solo-owner/17-offline-create-customer.png`, `18-offline-save-quote.png`
  - `sales-friction/offline-create-customer.png`, `offline-save-quotation.png`, `offline-payment.png`
  - `refresh-cache-code/04-offline-create-customer-message.png`, `04-concurrent-deliver-raw-error.png`
  - `multirole/claudia-offline-incident-mobile.png`
  - `admin-platform/23-offline-contract-save.png`
- **Root cause:** about 16 `error.message` renders, including `SalesWorkspace.tsx:188,319,331,344`, `ProductionWorkspace.tsx:76,85,101,110`, `CatalogWorkspace.tsx:166`, `CustomerWorkspace.tsx:240`, `CashboxWorkspace.tsx:45,47`, `OrderPaymentsWorkspace.tsx:80`, `PlatformAdminWorkspace.tsx:78,94,104` and `OrganizationTeamManager.tsx:41`. Only `payment-errors.ts` maps codes, and its fallback is wrong.
- **Fix:** add `src/shared/lib/friendly-error.ts` with `friendlyError(error, fallback)`:
  - network errors (no code, 'Failed to fetch', 'NetworkError', 'aborted', or `!navigator.onLine`) → the 'Sin conexión…' copy;
  - 42501 or RLS violations → 'La organización está en solo lectura o no tienes permiso.';
  - 40001 → 'Reintenta';
  - otherwise pass the Spanish DB message through.
  Use it at every site, and after a delivery error reload the order.
- **Verify:** `grep -rn "error.message" src/features` → verificar: it only appears inside the mapper; offline submit on each workspace → verificar: Spanish copy.

- **Done (2026-10-02):** what changed:
  - `src/shared/lib/friendly-error.ts` adds `friendlyError(error, fallback)`, `isNetworkError` and `offlineMessage`. Spanish RPC messages pass through; network errors get the 'Sin conexión…' copy; English permission/RLS errors become 'No tienes permiso… o la organización está en solo lectura.'; other technical English errors fall back to per-screen copy.
  - It is applied in admin, analytics, cashbox, catalog, customers, orders, production, sales and team. `friendlyPaymentError` and `friendlyPrescriptionError` reuse it.
  - A failed delivery reloads the order.
  - Verified offline: creating a customer and saving a quotation both show 'Sin conexión: no pudimos completar la acción. Revisa la señal e inténtalo de nuevo.'

### QA-31 Server waterfalls and duplicate auth calls (medium, M)
- **Problem:** owner `/dashboard` makes 9 sequential Supabase round trips and the provider dashboard makes 10. TTFB is 2.2–2.6 s from this machine, and `getUser()` runs 2–3 times per request. `/catalog` has 6 levels and `/sales` has 5.
- **Evidence:** `ttfb.mjs` medians in the PERF report. Superadmin `/dashboard` takes 2.27 s against 1.07 s for `/organizations`, which loads the same data in parallel.
- **Root cause:** `src/app/(main)/dashboard/page.tsx:19-53, 134-181` (await-in-loop at :180-181; owner loop :179-208; platform loader :227-263); `src/features/team/load-owned-organizations.ts:7-25`; `layout.tsx:32`.
- **Fix:**
  - Add a `getCurrentUser()` wrapped in React `cache()`, or use `auth.getClaims()` (ES256 keys allow local verification), shared by the layout and pages.
  - Use `Promise.all` for the independent queries and loops.
  - The platform dashboard should reuse `src/features/admin/load-platform-organizations.ts`.
  - Confirm the Vercel function region equals the Supabase region.
- **Verify:** owner `/dashboard` TTFB in the prod build → verificar: ≤ 1 s from this machine; auth calls per request → verificar: 1 or 0.
- **Done (2026-10-02):** `getCurrentUser()` (`src/lib/supabase/current-user.ts`) wraps `auth.getClaims()` in React `cache()`: one local ES256 verification per request shared by layout and page, no Auth round trip (RLS still verifies the JWT). Used by the `(main)` layout, all pages and `loadOwnedOrganizations`. `/dashboard` loads owned orgs, member access and KPIs in parallel, parallelizes the member-access queries and per-org checks, derives owner modules from the same memberships, and the platform view reuses `loadPlatformOrganizations`. Prod build TTFB from this machine: `/dashboard` 460–930 ms (was 2.2–2.6 s), `/orders` 450–1100, `/production` 425–940, `/sales` 465–970. Not done: Vercel region check (deploy setting).
  - Supabase region confirmed by the product owner: `ca-central-1` (Canada, Montréal). Matching Vercel function region: `yul1` (Montréal); fallback if the plan does not allow it: `iad1` (Washington, ~10–15 ms away). Product owner sets it in Vercel → Settings → Functions and redeploys.

### QA-32 Unbounded lists and search waterfall (medium, M)
- **Problem:**
  - `list_accessible_orders` returns all history, at about 330 B per order. It is refetched on every customer search, on every dashboard visit just for 4 KPIs, and after every payment or delivery.
  - Customer search is 3 sequential requests (3.8 s throttled).
  - `list_accessible_production_jobs` returns every job with its full snapshot (about 1.2 KB each).
  - `/production` selects all orders for every role, including providers.
- **Evidence:** PERF `search.mjs`, SALES `08-customers.mjs` and RC `06-search.mjs` timings.
- **Root cause:** `CustomerWorkspace.tsx:74-110`, `OrderPaymentsWorkspace.tsx:42-45,70,82`, `dashboard/page.tsx:53`, `production/page.tsx:10-23`, and RPC definitions with no WHERE or LIMIT.
- **Fix:**
  - Add a `search_customers(term, branch)` RPC that returns order counts in 1 request.
  - Give `list_accessible_orders` optional `only_open`, `since` and `limit` parameters, with `/orders` requesting open orders plus the last 30 days.
  - Compute the dashboard KPIs from `get_owner_dashboard` or an aggregate.
  - After a payment, patch only that row from the summary.
  - Add a `p_include_history` flag to the jobs RPC.
  - Skip the orders, memberships and profiles queries for provider roles on `/production`.
- **Verify:** customer search → verificar: 1 request; payload stays constant as orders grow; Claudia's `/production` → verificar: no orders query.
- **Done (2026-10-02):**
  - `/customers` embeds `orders(commercial_status)` in the customers query instead of downloading `list_accessible_orders`: a name search is 1 request (a phone search 2).
  - Migration `20261002215450_add_order_kpis.sql`: `get_order_kpis()` aggregates the 5 figures server-side for `/dashboard`.
  - Migration `20261002220316_window_accessible_orders.sql`: `list_accessible_orders(finished_since date)` keeps every open order but finished ones only from the last `FINISHED_ORDERS_DAYS` (90). `/orders` and its refreshes use it; with `?clienteId`/`?cliente` the full history loads. The 'Entregados' chip explains the window.
  - `/production`: provider-only users run 2 queries (jobs + own memberships); optical actors load only assignable orders plus those behind listed jobs, and only their organizations' providers.
  - Verified: search 1 request; dashboard KPIs match; Claudia's `/production` works.
  - Deferred: the jobs RPC still returns full history (`p_include_history`), fine at pilot volume.

### QA-33 Sidebar prefetch volume (low, S, plausible)
- **Problem:** each desktop page view issues 19 prefetch requests, each carrying the 2.6 KB auth cookie. That is about 50 KB of upload, enough to saturate a 20 KB/s uplink for about 3 s.
- **Root cause:** default viewport prefetch at `MainNavigation.tsx:52-55`.
- **Fix:** set `prefetch={false}` on the secondary links and keep it for `/sales`, `/orders` and `/customers`. Re-measure after QA-28.
- **Verify:** desktop `/cashbox` → verificar: ≤ 4 prefetch requests.
- **Done (2026-10-02):** only `/orders` (sidebar) and `/sales` ('Nueva venta') keep viewport prefetch; the rest use `prefetch={false}` plus the QA-29 spinner. Measured on a full load of `/cashbox`: 4 prefetch requests (was 19; Next 16 sends ~2 segment requests per route).

### QA-34 `/catalog` over-fetch (low, S)
- **Root cause:** `src/app/(main)/catalog/page.tsx:40-46` uses `select('*')` on 3 tables and loads 100 revisions.
- **Fix:** use explicit column lists and lazy-load the revisions when the simulator opens.
- **Verify:** the `/catalog` RSC payload shrinks, and the simulator still works.
- **Partly done (2026-10-02):** preloaded prescription revisions 100 → 30. Explicit column lists skipped: only a few timestamps/uuids, on a rarely used screen.

### QA-35 `/orders` auto-detail requests (low, S)
- **Root cause:** `OrderPaymentsWorkspace.tsx:33-36,56-62` makes 2 RPCs plus 2 preflights on every desktop visit.
- **Fix:** render the first order's summary on the server, or merge the two calls into a `get_order_detail` RPC.
- **Verify:** `/orders` desktop cold → verificar: ≤ 1 browser→Supabase call.
- **Done (2026-10-02):** `get_order_detail(order)` (migration `20261002220033`) returns summary + timeline in one call, and `get_order_production_panel(order)` (migration `20261002221216`) replaces the panel's 4 requests in 3 stages. Opening an order is now 2 calls (was 2 RPCs + 4 panel requests, each with a preflight).

### QA-36 supabase-js client bundle (low, L, plausible — defer)
- **Problem:** the client is 66.6 KB gz (auth + realtime) on every page, and Realtime is unused. It is cached immutably after the first visit.
- **Fix (post-pilot):** move mutations to Server Actions, which also get retry under `useOffline`, and keep the browser client only for storage uploads.

## Phase 5 — Remaining medium and low

### QA-37 Suspended = blocked (closed — decision 2026-10-02: suspended stays read-only; no change)
- **Problem:** a suspended org or subscription behaves like read-only, and owners still see customers and KPIs. BUSINESS_LOGIC: 'Suspendida: acceso bloqueado'. Note that memory `.titan/memory/reference/2026-09-13-project-status.md:33` says 'remain visible but read-only'; that memory note must be marked superseded once this is fixed.
- **Evidence:** `admin-platform/13-suspended-customers.png`, `14-suspended-dashboard.png`.
- **Root cause:** read helpers such as `private.can_read_branch_clinical_data`, `can_access_seller_sale`, `has_commercial_catalog_access` and `can_access_production_job` ignore status. `layout.tsx:76-133` never reads it.
- **Fix:** add `private.is_organization_accessible(org)` and AND it into the read helpers, keeping the admin bypass. In the layout, render a blocked screen 'Acceso suspendido, contacta a LensSpace'.
- **Verify:** suspend the QA org → verificar: the owner sees the blocked screen and REST reads return 0 rows.

### QA-38 Superadmin operational writes (medium, M)
- **Problem:** with no support session, the superadmin created customer #54 in the QAP org (`created_by` = admin) and can browse every tenant's orders, cashbox and prescriptions. Support sessions grant and record nothing. This goes against BUSINESS_LOGIC: the superadmin is not an operational role.
- **Root cause:** `private.can_operate_in_organization`, `can_write_branch_clinical_data` and `can_read_branch_clinical_data` short-circuit on `is_platform_admin()`. `layout.tsx:88-94` only hides the nav.
- **Fix:**
  - Remove the admin bypass from the write helpers.
  - Gate admin reads on `private.has_active_support_session(org)`.
  - Redirect admins away from tenant-only routes.
  - Clean up customer #54.
- **Verify:** admin RPC create customer with no session → verificar: denied; with a session → verificar: allowed and audited.
- **Done (2026-10-02, decision: reads only with a session, never operational writes):** migration `20261002225313_restrict_platform_admin_tenant_access.sql`.
  - `private.has_platform_support_session(org)`: platform admin with an open, unexpired session of their own for that org.
  - `can_operate_in_organization` and `can_write_branch_clinical_data` no longer bypass for the admin, so no sales, payments, customers, prescriptions or production writes, even with a session.
  - `can_read_branch_clinical_data`, `can_access_seller_sale` and tenant `has_commercial_catalog_access` require the support session; `can_manage_commercial_catalog` lets the admin manage only the base catalog (`organization_id is null`).
  - `get_platform_usage` became SECURITY DEFINER (it checks the role) so the panel keeps its counters.
  - Verified in SQL as admin (rolled back): no session → 0 customers/orders visible, base catalog 14 items, usage for 5 orgs; with a QAP session → only QAP's 5 customers; creating a customer → denied. The `/organizations` panel still shows usage counts.
  - Pending cleanup: customer #54 created by the admin in QAP.

### QA-39 Invite consent and enumeration (medium, M)
- **Problem:** inviting an existing confirmed account adds it as ACTIVE immediately, with no consent. Owner B suddenly saw '2 organizaciones'. The response status ('active' vs 'invited') reveals whether the account exists. Provider reuse across tenants is intended, but the missing consent is not.
- **Evidence:** `admin-platform/19-owner-b-enrolled-elsewhere.png`; membership 41.
- **Root cause:** `supabase/functions/invite-organization-member/index.ts:114-124,168,182`.
- **Fix:**
  - Always use `invited` and activate on acceptance, via an `accept_organization_invitation` RPC plus a dashboard banner 'Te invitaron a X: Aceptar'.
  - Return a uniform response.
- **Verify:** inviting an existing user → verificar: status `invited` until accepted; the response is identical for known and unknown emails.
- **Done (2026-10-02):** the Edge Function always creates `invited` and returns `{ membershipId, status: 'invited' }` for every email (deployed). New accounts still activate when they confirm the invitation email (existing auth trigger); existing accounts see 'Te invitaron a X · Aceptar / Rechazar' on the dashboard (`PendingInvitations`, RPCs `list_my_pending_invitations` and `respond_to_organization_invitation`, audited; migration `20261002232553_invitation_consent.sql`). `manage_organization_member` can no longer turn an invited member active. The owner's toast reads 'Invitación enviada. La persona se unirá cuando la acepte.' Verified: QAS invited the existing QSB owner → membership 46 `invited` → banner → 'Rechazar' → `inactive` and the banner disappears; re-inviting works.

### QA-40 Subscription state visible to the owner (medium, S)
- **Problem:** when expired, there is no banner and 'Nueva venta' stays in the nav. `/sales` buttons stay enabled, and only the save is disabled, with no explanation. Owners are never told when the trial ends.
- **Evidence:** `admin-platform/10-qa-owner-dashboard.png`, `11-expired-customers.png`, `12-expired-dashboard.png`.
- **Root cause:** `layout.tsx:35` (`canCreateSale` ignores operability). There are no tenant-side subscription reads.
- **Fix:**
  - Add `subscriptions(status, expires_on)` to the layout's organizations query (`layout.tsx:107`), after confirming RLS lets owners read it.
  - Show a banner when the subscription is expired.
  - Show 'Prueba hasta 17 oct' in `SidebarAccount`, with a warning when 5 or fewer days remain.
  - Hide 'Nueva venta' when the org cannot operate.
- **Verify:** expired → verificar: banner shown and no 'Nueva venta'; trial with 3 days left → verificar: warning shown.
- **Done (2026-10-02):** `get_my_subscription_notices()` (migration `20261002223933`) returns per membership organization whether it can operate; owners also get status, expiry and days left. The layout loads it in its parallel batch and renders `SubscriptionBanner`: red 'X está en solo lectura: la suscripción venció el 1 oct… Contacta a LensSpace para renovar.' (non-owners: 'Consulta con el dueño de la óptica.'), amber 'La prueba de X vence en 3 días (5 oct)' for owners at ≤ 5 days. 'Nueva venta' (sidebar, mobile drawer, header +) hides when no organization can operate. Verified with QAP temporarily expired and QAB at 3 days (dates restored).

### QA-41 Reassign a rework (medium, S)
- **Problem:** 'Las repeticiones … pueden reasignarse' is not possible. The rework copies the original provider, and a new assignment fails with 409 'El pedido ya tiene un trabajo activo de ese tipo.'
- **Root cause:** `private.create_production_rework` has no provider parameter, and the unique index `production_jobs_one_current_type_idx` blocks a second job.
- **Fix:** add an optional `new_provider_id` parameter, validated like an assignment, and a provider select in the 'Aceptar repetición' dialog.
- **Verify:** a rework assigned to another provider → verificar: allowed and linked through `original_job_id`.
- **Done (2026-10-02):** migration `20261002223547_reassign_production_rework.sql` adds `create_production_rework(incident, new_provider_id)` (validated like an assignment; the 1-argument version delegates). 'Aceptar repetición' opens a dialog 'Responsable de la repetición' defaulting to the original provider. Verified: JAV-2026-000016 incident → rework job 23 assigned to Javier (taller propio), `original_job_id = 15`.

### QA-42 Provider sees 'Aceptar repetición' (medium, S)
- **Root cause:** `src/features/production/components/ProductionJobCard.tsx:41` has no role check.
- **Fix:** add a `canAuthorizeRework` prop, passed from `ProductionWorkspace` (around :185), and show 'Pendiente de decisión de la óptica' to providers.
- **Verify:** Claudia on an incident → verificar: no button is shown.
- **Done (2026-10-02):** `canAuthorizeRework` (= optical actor). Verified: Claudia sees 'Pendiente de decisión de la óptica' and no button on the JAV-2026-000016 incident.
- **Related UI fixes (2026-10-02, product owner feedback):** the shared `Dialog` and the mobile drawer now render through a portal in `<body>`; opened from the sticky sidebar ('Mi perfil') they were trapped in its stacking context and page fields/selects painted over them. On-behalf production actions show the short label ('Iniciar fabricación') with 'en nombre del proveedor' in the tooltip/accessible name, and 'Marcar listo para enviar' became 'Listo para enviar'.

### QA-43 Mojibake and missing accents in DB messages (low, S)
- **Problem:**
  - 8 functions contain double-encoded literals: `calculate_catalog_price`, `create_prescription_revision`, `guard_order_commercial_transition`, `reject_immutable_order_change`, `next_order_number`, `prepare_openwa_notification`, `get_automatic_notification_payload` and `complete_automatic_notification_dispatch`.
  - Stored `notification_attempts.failure_message` rows read 'El cliente no autorizÃ³ mensajerÃ­a.'
  - Several messages lack accents: 'no esta activo … organizacion', 'Repeticion vinculada a incidencia.', 'Debes iniciar sesion'.
- **Root cause:** the deployed versions were applied with the wrong client encoding (the files are correct). This is the same class of bug as `20260920233125` and `20260913224717_repair_catalog_utf8_text.sql`.
- **Fix:**
  - One migration that recreates the 8 functions, applied through the CLI as UTF-8.
  - Repair the stored rows with `convert_from(convert_to(msg,'LATIN1'),'UTF8') where msg like '%Ã%'`.
  - Add the missing accents.
  - Add a test asserting no `prosrc` contains 'Ã'.
- **Verify:** `select count(*) from pg_proc where prosrc like '%Ã%'` → verificar: 0.
- **Done (2026-10-03):** `20261003012754_repair_function_text_encoding` rebuilds every public/private function containing 'Ã' (folding each 'Ã'+byte back with `chr()`, immune to client encoding) and repairs 71 `notification_attempts.failure_message` rows (immutability trigger lifted only for the repair). Also accented 'producción' and 'válida'. Guard: `supabase/tests/function_text_encoding.sql`. Verified: 0 functions and 0 rows with 'Ã'.

### QA-44 Prescription validation and vision-type advisory (low, S)
- **Problem:** cylinder -1.00 with no axis and sphere -2.13 are accepted. Two vision types in one quote raise no warning, and the provider snapshot reads 'Bifocal · Anti Blue · Monofocal · Anti Blue'.
- **Evidence:** `sales-friction/rx-after-cyl-no-axis.png`, `multirole/javier-quote.png`.
- **Root cause:** `src/features/prescriptions/prescription-validation.ts:78-95`, and `src/features/sales/components/ItemPicker.tsx` has no per-category cardinality.
- **Fix:**
  - Validate 'Indica el eje del ojo X' and 0.25 steps.
  - Make the vision_type group single-select, or show a non-blocking warning in `QuoteSummary`.
- **Verify:** cylinder with no axis → verificar: Spanish error; two vision types → verificar: replaced, or a warning shown.
- **Done (2026-10-03):** `validatePrescriptionForm`: sphere/cylinder/addition in 0.25 steps, integer axis, and 'Indica el eje del ojo …: tiene cilindro.' when a cylinder has no axis. Vision type is single-select in `SalesWorkspace.toggle` (a new one replaces the previous). Verified in /sales: two vision-type clicks leave one selected.

### QA-45 Provider mobile ergonomics (low, S)
- **Problem:** the provider lands on `/dashboard`, 4 stat cards take about 650 px, received and superseded jobs are always listed, her own name repeats on every card, and there is no 'Repetición' badge.
- **Evidence:** `multirole/claudia-dashboard-mobile.png`, `claudia-production-mobile.png`.
- **Root cause:** login redirect, `ProductionWorkspace.tsx:156-161` and `ProductionJobCard.tsx:31`.
- **Fix:** redirect provider-only users to `/production`, use compact stats on mobile, default the filter to active jobs, hide the provider name for providers, and show a 'Repetición de …' badge.
- **Verify:** Claudia logs in on 390x844 → verificar: lands on `/production` with the first actionable card above the fold.
- **Done (2026-10-03):** Provider-only users are redirected from `/dashboard` to `/production` unless they have a pending invitation (`getAccessSummary`/`isProviderOnly` in `src/lib/supabase/access.ts`). Providers see 2 stat cards (activos, con incidencia); the job filter defaults to 'Trabajos activos' (history via 'Todos, con historial' or the 'Ver historial' empty state); the provider name is hidden for providers; reworks show a 'Repetición' badge; card dates use `formatBusinessDate` (Havana). Verified: Claudia on 390x844 lands on /production with 2 cards.

### QA-46 Provider commercial pages (low, S)
- **Problem:** `/orders`, `/customers`, `/sales`, `/cashbox`, `/catalog` and `/prescriptions` render 200 for a provider, with CTAs such as 'Nueva venta'. RLS returns 0 rows, so nothing leaks.
- **Evidence:** `multirole/claudia-probe-orders.png`, `claudia-probe-customers.png`, `claudia-probe-catalog.png`.
- **Fix:** add a server helper `requireCommercialRole()` that calls `redirect('/production')`.
- **Verify:** Claudia opens `/orders` → verificar: redirected to `/production`.
- **Done (2026-10-03):** `requireCommercialRole()` on /orders, /customers, /sales, /cashbox, /catalog and /prescriptions. Verified: Claudia opening /orders or /catalog ends on /production.

### QA-47 Escape closes the dialog behind a select (low, S)
- **Root cause:** `src/shared/components/FormSelect.tsx:40-43` and `src/shared/ui/dialog.tsx:40-41` both listen on window.
- **Fix:** register the FormSelect listener in capture phase and call `stopImmediatePropagation()` when the select is open.
- **Verify:** Escape on an open select inside 'Asignar trabajo' → verificar: only the listbox closes.
- **Done (2026-10-03):** FormSelect listens only while open, in capture phase, and stops propagation. Verified in 'Asignar producción': first Escape closes the listbox only, second closes the dialog.

### QA-48 Timeline and copy polish (low, S)
- **Problem:**
  - The incident shows twice ('Incidencia reportada' and 'Incidencia de producción') with no 'Costo: Cristalero'.
  - 'Cobrado 0 %' is shown for 100 of 54,600.
  - A missing-consent outcome reads only 'Intento de WhatsApp fallido'.
  - A hydration warning comes from `toLocaleDateString('es-CU')` (`ProductionJobCard.tsx:31`).
- **Root cause:** `get_order_timeline` and `OrderDetail.tsx:61`.
- **Fix:**
  - Merge the incident rows and add the responsibility.
  - Show '<1 %' for small fractions.
  - Use failure_code-based copy: 'WhatsApp no enviado: el cliente no autorizó mensajes'.
  - Format dates with an explicit timeZone (shared with QA-11).
- **Verify:** timeline after an incident with consent OFF → verificar: one incident row with the cost owner and a readable reason.
- **Done (2026-10-03):** `20261003013616_polish_order_timeline`: the job's 'incident' status event is no longer listed (one 'Incidencia de producción' row) and its detail ends with 'Costo: Óptica/Cristalero/Montador/Cliente'; failed WhatsApp attempts use failure_code copy ('WhatsApp no enviado: el cliente no autorizó mensajes' / '… el módulo no está activo'). 'Cobrado' shows '<1 %' for tiny fractions. Dates: `formatBusinessDate` and explicit timeZone in admin views. Verified on JAV-2026-000016.

### QA-49 `getUser()` then `user!.id` in handlers (low, S, plausible)
- **Root cause:** `CatalogWorkspace.tsx:153,161,218,228`, `PrescriptionWorkspace.tsx:171,181` and `SalesWorkspace.tsx:246,258`.
- **Fix:** pass the user id from the server page, or use `getSession()`, guard against null, and wrap the handlers in try/finally.
- **Verify:** offline catalog save → verificar: the button re-enables with friendly copy.
- **Done (2026-10-03):** `CatalogWorkspace` gets `currentUserId` from the server page (no `getUser()`/`user!.id` in handlers); the prescription upload uses the local session. The other files listed no longer had the pattern.

### QA-50 Order prefix (low, M)
- **Problem:** the prefix is typed manually at onboarding instead of being derived from the first 3 normalized letters of the name. The owner cannot change it before the first order (BUSINESS_LOGIC).
- **Root cause:** `src/features/admin/components/OrganizationOnboardingForm.tsx:105`; no owner UI exists.
- **Fix:** prefill the prefix from the name, and add an owner setting through an RPC that updates the prefix only while the org has no orders.
- **Verify:** typing a name → verificar: prefix prefilled; owner edits it before the first order → verificar: saved; after the first order → verificar: locked.
- **Done (2026-10-03):** Onboarding suggests the prefix from the name (skipping a leading 'Óptica'/articles: 'Óptica Prueba Norte' → PRU) until edited. Owners get 'Prefijo de pedidos' on /team (`OrderPrefixSetting`): editable until the first order (existing RLS + `protect_organization_order_prefix` trigger, now with Spanish copy), duplicate → friendly error. Verified: JAV shows 'fijo desde el primer pedido'.

### QA-51 Onboarding feedback and pattern (low, S)
- **Problem:** the success Alert unmounts when the dialog closes. `pattern="[A-Za-z0-9_-]{1,16}"` is invalid under the `v` flag, so the browser ignores it. Only 'Ventas ópticas' is pre-checked.
- **Root cause:** `OrganizationOnboardingForm.tsx:93-97,107`, with the dialog closed from `PlatformAdminWorkspace.tsx:194`.
- **Fix:** show a toast in `PlatformAdminWorkspace` after `onCreated`, use `pattern="[\-A-Za-z0-9_]{1,16}"`, and consider pre-checking all modules for trial.
- **Verify:** create an org → verificar: toast visible and no console regex error.
- **Done (2026-10-03):** Success is a toast in `PlatformAdminWorkspace` (`onCreated(message)`), branch-code pattern `[\-A-Za-z0-9_]{1,16}`, and Ventas ópticas + Caja + Producción are pre-checked (one-person shop).

### QA-52 Recommended deposit (low, M — defer)
- **Problem:** BUSINESS_LOGIC.md:106 defines a recommended or minimum deposit, but there is no schema or UI for it.
- **Fix (post-pilot):** add `organizations.recommended_deposit_percent`, prefill the first payment with it, and log a timeline exception when the seller skips it.
- **Status (2026-10-03):** deferred post-pilot as planned (needs a product decision on the percentage).

### QA-53 Base catalog audit (low, S)
- **Root cause:** `CatalogWorkspace.tsx:184-241` writes `catalog_items` directly, and nothing writes an audit event.
- **Fix:** add an AFTER INSERT/UPDATE trigger for rows with `organization_id is null` that writes `audit_events` with the old and new price and active state.
- **Verify:** edit a base item → verificar: an audit row is written.
- **Done (2026-10-03):** `catalog_items_audit_base` AFTER INSERT/UPDATE trigger writes `catalog.base_item_created/changed` with old/new price, currency and active state for rows with `organization_id is null` (migration `20261003014630`).

### QA-54 Admin history, notes and subscription filter (low, M)
- **Fix:**
  - Add a `target_notes` parameter and a textarea.
  - Show `last_renewed_on` read-only.
  - Add a subscription badge and filters (Prueba/Vencida/Por vencer).
  - Add an 'Historial' tab from `audit_events` with a limit of 20.
- **Root cause:** `PlatformAdminWorkspace.tsx:46` filters on org status only. `update_platform_organization` has no notes parameter.
- **Done (2026-10-03):** Organization cards show a subscription badge (Prueba / Al día / Por vencer ≤5 días / Vencida / Suspendida) with a matching filter; the detail shows 'Última renovación' read-only and an 'Historial' (last 20 `audit_events`, loaded only when the dialog opens). Notes were not added: the mandatory change reason already records the why.

### QA-55 `last_renewed_on` overwritten (low, S)
- **Root cause:** `update_platform_organization` sets `current_date` whenever the status is active.
- **Fix:** update the date only when `expires_on` increases or the status changes to active.
- **Verify:** an amount-only edit → verificar: the date is unchanged.
- **Done (2026-10-03):** `last_renewed_on` changes only when the subscription becomes active or `expires_on` increases. Verified in a rolled-back transaction: an amount-only edit kept the date.

### QA-56 Support session auto-close audit (low, S)
- **Root cause:** `begin_platform_support_session` updates the previous open session without calling `write_platform_audit`.
- **Fix:** use `update … returning`, then `perform write_platform_audit('support.session_ended', …, 'Cerrada al iniciar otra asistencia')`.
- **Verify:** start A, then start B → verificar: an end event is written for A.
- **Done (2026-10-03):** Auto-closed sessions write `support.session_ended` ('Cerrada al iniciar otra asistencia'). Verified in a rolled-back transaction: starting B after A wrote one end event.

### QA-57 Module dependency UI (low, S)
- **Root cause:** `PlatformAdminWorkspace.tsx:57-60` (`toggleModule`).
- **Fix:** turning off `optical_sales` also turns off cashbox, production and whatsapp, and turning one of those on enables `optical_sales`.
- **Verify:** no 'Faltan dependencias…' error is reachable from the UI.
- **Done (2026-10-03):** Turning off Ventas ópticas turns off Caja/Producción/WhatsApp; turning one of those on enables Ventas ópticas; the help text says so. Verified in the admin dialog.

### QA-58 Inactive member name (low, S)
- **Root cause:** the `profiles_select_self_or_related` policy requires `theirs.status = 'active'`.
- **Fix:** let owners read profiles of invited and inactive members of their org.
- **Verify:** deactivate Claudia → verificar: her name is shown with an 'Inactivo' badge.
- **Done (2026-10-03):** `profiles_select_self_or_related` lets owners read invited/inactive members of their organizations. Verified: no 'Usuario' fallback on Javier's team.

### QA-59 Deep link and invite error copy (low, S)
- **Root cause:** `src/lib/supabase/proxy.ts:6` (`protectedPrefixes = ['/dashboard']`), `layout.tsx:33` (`redirect('/login')` with no next), and invite `index.ts:152`.
- **Fix:** protect every `(main)` route with `?next=`, and map `email_address_invalid` to 'El correo no es válido.'
- **Verify:** session expires on `/orders` and the user logs in again → verificar: lands back on `/orders`.
- **Done (2026-10-03):** Root cause was bigger: `proxy.ts` sat in the repo root, but with `src/` Next 16 only loads `src/proxy.ts`, so the proxy (session refresh, `/login` → `/dashboard` when signed in, `?next=`) never ran. Moved to `src/proxy.ts`, protected every signed-in prefix and kept the query string in `next`; `safeNextPath` also rejects '/\\'. Invite: `email_address_invalid` → 'El correo no es válido o no acepta mensajes…' (function redeployed). Verified: /orders?view=finished signed out → login → back on /orders?view=finished.

### QA-60 Advisors (low, S, plausible)
- **Fix:** enable leaked-password protection, which may require a paid plan. Document why `manage_organization_member` is SECURITY DEFINER. Index FKs later.
- **Verify:** `get_advisors` → verificar: no WARN items, or the remaining ones are documented.
- **Reviewed (2026-10-02):** remaining WARNs are documented, not bugs:
  - SECURITY DEFINER RPCs callable by `authenticated` (8): `adopt_market_usd_rate`, `get_my_subscription_notices`, `get_platform_usage`, `list_my_pending_invitations`, `manage_organization_member`, `notify_order_ready`, `platform_owner_email`, `respond_to_organization_invitation`. Each checks `auth.uid()` and the role/ownership internally and needs rows RLS would hide (subscriptions, other members, auth emails, aggregate usage). Moving them behind `private.` wrappers would only silence the linter.
  - Leaked-password protection: Supabase Dashboard → Authentication → Providers/Policies → 'Prevent use of leaked passwords' (may require a paid plan). Product owner action.

## Phase 6 — Product owner requests (2026-10-02)

Requested during Phase 5. Done 2026-10-03.

### QA-62 Profile page (medium, M)
- **Request:** a real profile where each user changes their name and other personal data, and their password.
- **Today:** only the 'Mi perfil' dialog in the sidebar (`AccountProfileDialog`: display name and contact phone). Password changes exist only through recovery (`/forgot-password` → `/set-password`).
- **Proposal:** a `/profile` route (`(main)` group) with personal data (name, phone; email read-only) and 'Cambiar contraseña' (current password re-check, then `auth.updateUser({ password })`, Spanish errors, rate-limit aware). Link it from `SidebarAccount`; keep the dialog or replace it with the link.
- **Verify:** change name → sidebar and WhatsApp signature update; change password → old one fails, new one works; wrong current password → Spanish error.
- **Done (2026-10-03):** `/profile` (`src/app/(main)/profile/page.tsx`, `src/features/account/components/`): name and contact phone (email read-only) and 'Cambiar contraseña' (re-checks the current password with `signInWithPassword`, then `updateUser`; Spanish errors for invalid_credentials, same_password, weak_password, rate limit, offline). The sidebar name is now a link to `/profile` (the 'Mi perfil' dialog was removed). Verified with the QA solo account: name change shows in the sidebar; wrong current password → 'La contraseña actual no es correcta.'; after the change the old password fails and the new one works; password restored afterwards.

### QA-63 Landing recognizes a signed-in user (medium, S)
- **Request:** when already signed in, the landing must let the user go to the dashboard without logging in again.
- **Today:** `/` (landing) always shows the public CTA to `/login`.
- **Proposal:** read the session on the landing (`getCurrentUser()`; the page stays fast) and swap the header/hero CTA to 'Ir a mi panel' → `/dashboard`; `/login` redirects to `/dashboard` when a session exists. Keep the landing cacheable for anonymous visitors if possible (check the Next 16 docs before choosing dynamic vs a small client check).
- **Verify:** signed in → landing shows 'Ir a mi panel' and opens the dashboard with no login; signed out → normal CTA; `/login` while signed in → dashboard.
- **Done (2026-10-03):** The landing stays static (no supabase-js in its bundle): `AccessLink` checks that the Supabase session cookie exists and swaps the 4 access CTAs to 'Ir a mi panel' → `/dashboard`. `/login` while signed in → `/dashboard` via the proxy (works since the QA-59 proxy fix). Verified signed in and signed out.

### QA-64 User manual: superadmin edits, everyone reads (medium, M)
- **Request:** only the superadmin can edit the user manual. Everyone else only reads it as pages and can download the PDF.
- **Today:** `src/app/manual/page.tsx` → `authorizeManualEditor()` lets platform admins **and owners** open the editor (`ClientDocsGenerator`); sellers and providers are redirected to `/dashboard`.
- **Proposal:** split the route: a read-only manual view (sections as pages with navigation, 'Descargar PDF' via the existing print view) for every signed-in role, and the editor only for `current_user_is_platform_admin`. Enforce edit permission where the manual content is saved (server), not only in the UI. Show 'Manual del sistema' in the nav for all roles.
- **Verify:** seller/provider/owner → read-only pages + PDF, no edit controls, save attempts rejected; superadmin → editor.

---
- **Done (2026-10-03):** Manual content is now persisted: table `manual_documents` (RLS: every authenticated user reads; only `private.is_platform_admin()` inserts/updates; `updated_by` set by trigger). `/manual`: superadmin gets the editor with 'Guardar manual' (publish), 'Descartar cambios' and an unsaved-changes notice; every other signed-in role gets `ManualReader` (section pages with previous/next, 'Descargar PDF', 'Volver al panel'); owners also read the administration variant. `/manual/print` renders the saved content from the server (no localStorage) and forces the operative variant for roles without admin access. 'Manual del sistema' is in the menu for every role. Verified: Claudia reads with no editor and her print is 'Manual operativo' even with `?audience=admin`; admin sees the editor; SQL as provider → RLS 42501 on write, read OK; as admin → write OK (rolled back). Until the superadmin saves once, everyone sees the bundled default content.

## Test data created

**Cleanup (2026-10-03): everything below was deleted** by a one-off SQL block run by the product owner in the SQL Editor (the MCP declines DELETE), after a rolled-back dry run. Removed: orgs 3–6 (QAP, QAS, QAB, QSB) with all their rows; in Óptica Javier every 'QA PILOTO' customer (20), orders JAV-2026-000002..000019 and their quotations, payments, empty cashboxes, production jobs/events/incidents, notification attempts and `private.notification_dispatches`; base catalog item 27; the 4 `@lensspace.test` auth users; Javier's test phone; the 2 QSB prescription files in Storage. Immutability triggers were disabled only inside that transaction. Kept: customer 20 'Claudia Rodríguez Rodríguez', JAV-2026-000001 (2 payments, 1 cashbox), users admin/Javier/Robert/Claudia; the JAV counter was reset to 1 (next order JAV-2026-000002). Verified afterwards: 1 org, 1 customer, 1 order, 0 storage objects, no disabled triggers. The throwaway accounts listed below no longer exist.

All on the remote Supabase project. Real users' passwords are deliberately not recorded. Every QA customer has `messaging_consent = false` and fake numbers +53 5000 0xxx, and no real WhatsApp was sent.

- **2026-10-02 (pending items + Phase 3):** QAS orders QAS-2026-000005..8 (Monofocal · Blanco, paid; 000006..8 with an in-house lens job), customer 'QA PILOTO Clave Cliente'. - **2026-10-02 (Phase 5):** QAS → QSB-owner invitation (membership 46, declined → `inactive`); incident 5 on JAV-2026-000016 and rework job 23 (Javier, taller propio); QAP/QAB subscription dates were changed for the test and restored (QAP 2026-10-02…2026-11-02, QAB trial until 2026-10-17).

The seeded `market_exchange_rates` row (455 CUP) and the QAS rate adopted from it were deleted by the product owner on 2026-10-02 (verified: 0 market rows, 0 organizations with an adopted rate).

**Organizations**

| Org | id | Prefix | Notes |
|-----|----|--------|-------|
| QA Piloto Solo 2026-10-02 | 4 | QAS | Branch 'Principal' (6), America/Havana, trial until 2026-10-17, all 6 modules |
| QA Piloto Admin 2026-10-02 | 3 | QAP | Branch 'Principal' (5). Now active 2026-10-02..2026-11-02, 30 USD quarterly; modules optical_sales, cashbox, production, analytics |
| QA Piloto Admin B 2026-10-02 | 5 | QAB | Trial 2026-10-02..2026-10-17, optical_sales only |

**Throwaway QA accounts (`.test`, safe to record)**

| Email | Password | Role |
|-------|----------|------|
| qa.solo.20261002@lensspace.test | QaSolo!2026-Piloto | Owner of org 4. Also workaround memberships in org 4: Cristalero/laboratorio, Montador and Vendedor. **Remove these after QA-01 and QA-02** |
| qa.admin.20261002@lensspace.test | QaPiloto*2026! | Owner of org 3 |
| qa.adminb.20261002@lensspace.test | QaPilotoB*2026! | Owner of org 5. Also lens_provider membership 41 in org 3 (now inactive; created through the QA-39 test) |

A failed invite to `qa.seller.20261002@lensspace.test` left no auth user.

**Org 4 (QAS)**
- Tenant catalog item 26 'QA Armadura metálica'.
- Customers 47, 58, 60 and 'QA PILOTO Solo Cliente 2 Movil'.
- Prescriptions 12/rev 15 and rev 17.
- QAS-2026-000001 (delivered; jobs 9 superseded, 10 dispatched, 11 pending).
- QAS-2026-000002 (partial, includes a post-close 500 CUP).
- QAS-2026-000003 (partial; **duplicate payments 59/60**).
- QAS-2026-000004 (mobile, partial).
- Cashboxes 31 (USD) and 32 (CUP) closed, including a complementary closure of 500 CUP; payments 59/60 are unclosed.

**Org 3 (QAP)**
- Customers 30, 32, 44, 45, and **54 'QA PILOTO creado por superadmin' (created_by = admin; delete it as part of QA-38)**.
- Prescription 14/rev 17.
- Audit events for the contract and support tests.

**Platform**
- Base catalog item 27 'QA PILOTO base 2026-10-02 (no usar)', now `is_active=false`.

**Óptica Javier (org 2), created as javier — real tenant, QA rows prefixed 'QA PILOTO'**
- Customers: 21, 23–25 (burst duplicates), 26, 28, 29, 51, 55 (phone '50000101'), 56, 'QA PILOTO MR 104551', the RC01–RC04 customers, 'Sin red 0412', 'Accept perdido 6999', 'Venta mobile 109' and 'Venta slow 110'.
- Orders JAV-2026-000002 through 000017. Among them:
  - 000003 (order 8, duplicate payment 46, delivered; jobs 6 superseded and 8 received, assigned to Claudia);
  - 000004 (3×100 burst);
  - 000006 (paid and delivered);
  - 000008 (500+500 and 100×3 duplicates; lens job pending, assigned to Claudia);
  - 000009 (unpaid, from the lost accept);
  - 000010 (2×500 duplicate);
  - 000016 (2.80 CUP residue).
- 11 orphaned `awaiting_acceptance` quotations.
- No cashbox closed and no catalog or org settings changed.
- **The duplicate payments are immutable; the product owner must decide whether to keep them as test noise or add a correction flow.** The pilot should ideally start on a clean org, or with these QA rows filtered out of the KPIs.

Scripts live in the session scratchpad (`solo-owner/`, `multirole/`, `sales-friction/`, `admin-platform/`, `perf-network/`, `refresh-cache-code/`), not in the repo.

## Coverage gaps

- **Seller and mounter accounts:** there was no seller password and Supabase rejects `.test` invites, so seller-only limits were not exercised in the UI. Those limits are the 10 % discount cap, branch scope, and what sellers see when expired, suspended or with a module off. Mounter transitions are untested.
- **Real WhatsApp send:** not attempted. All dispatches failed with missing_consent by design, and no OpenWA traffic was generated.
- **Production timings from Vercel:** measured only from this machine to the Supabase MIA edge, and the region co-location was not confirmed. Dev-server numbers include StrictMode double effects.
- **Price change between quotation and acceptance:** blocked by QA-06. QA-07 was verified by code only.
- **Graduation and compatibility warnings:** those tables are empty.
- **Owner's consolidated review of other sellers' cashboxes:** a solo org has only one person, so this did not apply.
- **Superadmin assisted access with real historical tenant data, expiry and suspension on Óptica Javier:** deliberately not done, to avoid touching the real tenant.
- **Long idle JWT expiry:** simulated by clearing cookies.
- **Real low-end phone multi-tap:** simulated with a same-task synthetic burst.
- **Code-only findings:** QA-07, QA-49 and part of QA-12 come from code reading and were not reproduced.
- **Hydration warning:** the cause in QA-48 was not isolated.

## Phases and verification gate

1. Phase 1 (QA-01..11) → verificar: re-run the solo-owner end-to-end and the lost-response and burst scripts against the dev server, then run `npm run lint && npm run typecheck && npm run build`.
2. Phase 2 (QA-12..23) → verificar: measure the shortest and full sale click counts on 390x844. Targets: shortest ≤ 5 clicks, no navigation to send to production, and the total always visible.
3. Phase 3 (QA-24..27) → verificar: two-context script with javier and claudia, where counters and lists update on focus and after mutations with no hard reload.
4. Phase 4 (QA-28..36) → verificar: prod build throttled. No chrome-error on offline navigation, Spanish copy for every offline submit, and owner `/dashboard` TTFB ≤ 1 s.
5. Phase 5 → verificar: per-item checks above.

All UI work follows `docs/design/` (UI 2.0) and is mobile-first. DB changes are new migrations, with RLS kept on and helpers granted explicitly (QA-05 is the lesson).

## Decisions (resolved by the product owner, 2026-10-02)

- **QA-08:** 'Pedido listo' is manual only. Remove the automatic `order_ready` trigger and add the explicit 'Avisar: listo para recoger' action, which can be re-sent after a rework.
- **QA-14:** delivering before production is reviewed shows a non-blocking warning, not a hard block. Whether 'cerrado' and 'cliente notificado' become stored states is still open; keep the minimal derived approach.
- **QA-18:** round up. 'Cobrar saldo completo' in USD uses the amount rounded up to the cent, and the server accepts that overshoot of under 1 cent of USD, capping the CUP equivalent at the remaining balance. Any remainder can always be paid in CUP.
- **QA-03:** the pilot starts on a clean organization, so the duplicate QA payments in Óptica Javier stay as historical test data.
- **QA-37:** suspended means everything is blocked for operations, but data stays readable (read-only). That is the current behavior, so no change. `BUSINESS_LOGIC.md` was aligned and the 2026-09-13 memory note stays valid.
- **Phase 4:** the cache strategy table is approved. No caching of tenant RSC data. Balances, payments, cashbox and order status are always live. Sale drafts and an optional snapshot of providers' jobs are cached locally.

## Appendix — Refuted and merged items

- **RC-16 (refuted):** 'Payment form can target the newly clicked order while the previous balance is shown'. `select()` runs `loadDetail` inside the same `useTransition` whose `pending` disables `PaymentForm`, and the form is keyed by `summary.orderId`, so a submit cannot fire during the load. Optional hardening: `setSummary(null)` on select.
- **SALES-10:** classified by the verifier as a duplicate of SALES-01 and merged into QA-03; its synchronous ref guard is part of that fix.
- **ADM-01 / SOLO-03:** the tester rated it a blocker and it was downgraded to high, because the prescription revision is still saved and the sale continues.
- **SOLO s5 'new order missing from /orders after soft nav':** a tester false negative (full vs short order number); page bodies are fresh.
- **SOLO first offline run** (customer 58): the CDP throttling session overrode setOffline, so it was not a product defect; it was redone.
