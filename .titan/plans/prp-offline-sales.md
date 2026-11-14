# PRP — Offline sales (LEN0011), then the Android APK

> **Status**: APPROVED by Roberto (2026-11-13). Phases 1-2 done (web not deployed); Phase 3 migration applied to production 2026-11-13; Phases 4-5 done (web not deployed); phone-match fix applied 2026-11-13; next: Phase 6.
> **Date**: 2026-11-13
> **Project**: LensSpace
> **Tasknic**: LEN0011 «trabajo Offline» (this plan). The Android APK follows as LEN0012 and its own plan
> (`prp-android-apk-capacitor.md`, amended below), blocked by LEN0011.
> **Reference implementation**: Kshop POS offline (`../kshop/.titan/plans/prp-pos-offline.md`).

---

## Objective

A seller with a previous session opens LensSpace with **no network at all** (airplane mode, app or tab closed),
registers a complete sale (customer, prescription, pairs, quotation accepted, cash payment), and the sale stays safe on
the device until it uploads by itself as a normal order once the connection returns.

## Why

| Problem | Solution |
|---------|----------|
| The pilot client reports that the connection is hitting them hard; today with no signal LensSpace only shows `offline.html` | The app starts with no network from the service worker and sells from data saved on the device |
| The parked APK plan loads the remote web (`server.url`), so it fails offline exactly like the browser | Offline lives in the web layer: it works in the PWA, in Chrome, on iPhone and later inside the APK |
| Kshop could package its code in the APK because it was designed for it from day one; LensSpace pages load data on the server | Only one static client route needs to work offline; the rest of the app stays as it is |

## Decisions (Roberto, 2026-11-13)

| # | Question | Answer |
|---|----------|--------|
| R1 | What hurts the client? | **No network at all**, not only a slow link |
| R2 | What must work offline? | **The seller's sale**: customer, prescription, quotation, accept, cash payment, plus consulting their own orders. Production, wholesale, cashbox closing, team and admin stay online |
| R3 | How long can a seller work without the server confirming access? | **7 days** (as Kshop) |
| R4 | Order | **Offline first**, then the APK as a wrapper with an offline cold-start go/no-go |

## What

### Success criteria

- [ ] With the phone in airplane mode and the app/tab closed, a seller who logged in before opens LensSpace and reaches
      «Venta sin conexión» (installed PWA and Chrome; APK in its own plan).
- [ ] A complete sale (new or saved customer, prescription, 1–10 pairs, cash payment in USD or CUP) is saved on the device
      **before** the screen closes, survives closing the tab/app, and uploads exactly once even if the upload is cut or
      repeated.
- [ ] An uploaded sale becomes a normal order with its real number, counts on the day it was made
      (`orders.created_at`/`accepted_at`, `payments.received_at`/`business_date`), lands in the seller's cashbox
      (post-close if that day was closed) and sends the same WhatsApp messages as an online sale (D12).
- [ ] No sale is lost to a rejection: if the upload fails (no session, permission removed, organization suspended) it is
      retained on the device with the reason visible, and logging out asks for confirmation while sales are pending.
- [ ] What did not match (price changed, prescription data, possible duplicate customer, device clock) is recorded and
      visible to owner and seller, never a reason to reject.
- [ ] Tenant isolation: a seller of organization A cannot upload sales into B (SQL test). Data saved on the device is per
      user, limited to the seller's branch scope, and cleared on logout.
- [ ] After 7 days without the server confirming the session, the device stops offering offline sales (pending ones stay).
- [ ] `npm run typecheck`, `lint`, `build` green; Playwright offline QA (`context.setOffline`) at 390 px; test on a real
      Android phone in airplane mode.

### Expected behavior (happy path)

1. Online, the app saves a snapshot for the logged-in seller: retail catalog, rates, branches they sell in, basic customer
   cards of those branches (no amounts), optometrists, and their own recent orders. It shows its age («Datos de hoy»).
2. With no network, opening LensSpace shows «Venta sin conexión» from the service worker instead of `offline.html`.
3. The seller picks a saved customer or creates one, enters the prescription, adds pairs and concepts; the total uses the
   saved catalog and the last rate.
4. They record the cash received. Saving writes the sale to the device first, then frees the screen for the next one. The
   sale shows a provisional number (`SC-<device>-<n>`).
5. When the network returns, the queue uploads in order, one sale at a time. Each becomes an order with its real number.
6. The screen lists pending, uploaded and retained sales. A pending sale can be discarded with confirmation (D9); an
   uploaded one is managed from its order as today.

**Out of scope here:** production, wholesale/commercial orders, cashbox closing, editing an existing order offline,
uploading prescription images offline, WhatsApp sending (the seller can still open a `wa.me` link, which WhatsApp queues
itself), the APK (own plan).

---

## Context

### What exists today (read in code, 2026-11-13)

| Piece | State and consequence |
|-------|-----------------------|
| `public/sw.js` | Only serves `offline.html` on failed navigations; rule «never cache tenant data, RSC or API» → it will cache only the static offline shell and `/_next/static` chunks. Tenant data goes to IndexedDB, controlled by the app, per user |
| `src/app/layout.tsx` | Root layout has no data: a route outside `(main)` can be fully static and cacheable |
| `src/app/(main)/*/page.tsx` | Server components load data with the server Supabase client: they cannot run offline, and are not touched |
| `next.config.ts` `experimental.useOffline` | Already on: retries soft navigations and Server Actions on transient drops. Does **not** cover cold start without network (Next docs `offline-support.md`) |
| `src/lib/supabase/client.ts` | Browser client with a 20 s timeout; session in cookies, readable offline |
| `src/features/sales/components/*` (~1 050 lines) | Whole sale flow in one feature: `sale-draft.ts`, `sale-pricing.ts`, `PairEditor`, `ItemPicker`, `SaleDialogs` — the offline screen reuses them through an adapter |
| `create_customer_with_phones`, `save_multi_line_quotation`, `accept_quotation`, `register_cash_payment` | Retry-safe with `*_request_id` (memory 2026-10-02). `create_prescription_revision` is **not**. `accept_quotation` recalculates prices with the current catalog |
| `payments` | Has `received_at`, `business_date`, `is_post_close`, `cashbox_id`; supplementary closures already exist (BUSINESS_LOGIC «Monedas, pagos y caja») |
| `orders.client_request_id`, `customers.client_request_id` | Exist; idempotency pattern already in the schema |

### Technical decisions

| # | Decision | Why |
|---|----------|-----|
| D1 | Static client route `/sin-conexion` outside `(main)`, precached by the service worker with the chunks its HTML references; failed navigations get it (fallback `offline.html` if not cached yet) | The only way to open with no network without rewriting the app. Cache name carries the build id so each deploy refreshes it |
| D2 | Device storage behind an `OfflineStore` interface: IndexedDB in the browser (with `navigator.storage.persist()`), native files later in the APK | Kshop learned the WebView can clear web storage; the queue must be swappable |
| D3 | One composite RPC `record_offline_sale(sale_id uuid, payload jsonb)`, one transaction per sale, idempotent by `sale_id` through a new `offline_sales` table | Chaining 5 RPCs from the device with temporary ids is fragile, and `create_prescription_revision` has no request id |
| D4 | **The server records, it does not decide**: the sale already happened and the money was received. Prices are recalculated with the current catalog; differences against the device total, possible duplicate customers (same phone in the branch) and clock skew are stored as `flags` | Same principle as Kshop D3. Rejecting a sale already paid would lose money |
| D5 | The cash payment keeps `received_at` = sale time and `business_date` = that day; if that cashbox day was closed it enters as post-close (existing supplementary closure) | Reuses the cashbox rules without new concepts |
| D6 | Real order number assigned on upload; the device shows a provisional receipt number | `order_counters` is server state |
| D7 | Device clock control: a sale time more than 10 min in the future uses upload time and is flagged | A phone with a wrong clock must not move sales between days |
| D8 | Rejection (4xx, no session, permission) **retains** the sale on the device; silence or 5xx retries later | No security hole and no lost money |
| D9 | A pending sale can be discarded only with confirmation; discarded sales are kept locally (not uploaded) for 30 days | Simpler than Kshop D12 for the first stage; revisit if owners ask for the trace |
| D10 | Snapshot and queue are keyed by user id; logout clears the snapshot, never pending sales without confirmation | Prescriptions are health data; pending money must not vanish |
| D11 | Offline access expires 7 days after the last server confirmation (R3) | Protects against removed accounts |
| D12 | On upload the existing triggers queue «pedido aceptado» and «pago recibido» as for an online sale (confirmed by Roberto 2026-11-13) | It is a normal order of a customer with a phone (unlike Kshop's anonymous counter); the receipt reaches the customer when the signal returns. Suppressing would need a flag in two notify triggers |

### Proposed architecture

```
public/sw.js                                   # shell precache + /_next/static cache-first + navigation fallback
src/app/sin-conexion/page.tsx                  # static, client-only offline desk (outside (main))
src/features/offline/
├── store/          offline-store.ts (interface), indexeddb-store.ts
├── snapshot/       capture while online, read offline, expiry
├── queue/          sale queue, sync engine (serial, retained, retries)
├── components/     OfflineDesk, OfflineSaleForm (reusing features/sales), QueueStatus, OfflineBanner
└── types.ts
supabase/migrations/<ts>_offline_sales.sql     # offline_sales + record_offline_sale (+ private helpers)
supabase/tests/offline_sales.sql
```

### Data model (draft)

```sql
create table public.offline_sales (
  id uuid primary key,                         -- generated on the device (D3)
  organization_id bigint not null references public.organizations (id),
  branch_id bigint not null,
  order_id bigint not null unique references public.orders (id),
  seller_id uuid not null references auth.users (id),
  device_id uuid not null,
  local_number text not null,                  -- provisional receipt number
  sold_at timestamptz not null,
  uploaded_at timestamptz not null default now(),
  -- [{type: 'price_mismatch' | 'possible_duplicate_customer' | 'clock_skew' | ..., ...}]
  flags jsonb not null default '[]'
);
alter table public.offline_sales enable row level security;  -- read: same scope as the order; write: only the RPC
```

---

## Estimate

40–55 engineering hours: service worker 4–6, device data and queue 6–8, offline screen 10–14, server RPC and tests 8–10,
upload/retained/owner view 6–8, QA 6–8.

---

## Blueprint

> Phases only. Subtasks are generated on entering each phase (`tf-bucle-agentico`).

### Phase 1: Start with no network — DONE (2026-11-13, not deployed)
**Objective**: `/sin-conexion` static route and service worker that precaches it with its chunks and serves it on failed
navigations; cache refreshed per deploy.
**Validation**: `next build && next start`, Playwright: load once online, go offline, open `/dashboard` cold in a new
page → the offline desk renders; `offline.html` still works before the first cache.

### Phase 2: Data on the device — DONE (2026-11-13, not deployed)
**Objective**: `OfflineStore` (IndexedDB), snapshot captured online for the logged-in seller, expiry (R3), cleared on
logout, persistent storage requested.
**Validation**: snapshot written after visiting the app online, readable offline, per user, removed on logout; size
measured with the pilot data.

### Phase 3: Server — DONE (2026-11-13, migration applied to production)
**Objective**: `offline_sales` + `record_offline_sale` (idempotent, flags, payment on the sale day, post-close), grants
and RLS.
**Validation**: SQL tests: repeat does not duplicate, price change flags and does not fail, isolation between
organizations, seller without permission refused, payment lands in the right day/cashbox, no WhatsApp attempt.

### Phase 4: Offline sale screen — DONE (2026-11-13, not deployed)
**Objective**: the seller completes a sale offline reusing `features/sales`, saved before the screen closes.
**Validation**: Playwright offline at 390 px: new customer + prescription + 2 pairs + payment saved; reload offline keeps it.

### Phase 5: Upload, retained and visibility — DONE (2026-11-13, not deployed)
**Objective**: automatic serial upload on reconnection, retained with reason, logout guard, flags visible in the order.
**Validation**: Playwright with intermittent network, lost response after save (one order only), expired session retained.

### Phase 6: Consult own orders offline and entry points
**Objective**: own recent orders readable offline; banner/entry to the offline desk when the app loses connection.
**Validation**: offline list matches the last snapshot; banner appears and disappears with connectivity.

### Phase 7: Docs, memory and final validation
**Objective**: end-user manual in plain Cuban Spanish (`clientDocsInput.ts`), memory updated, real-device test.
**Validation**:
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`
- [ ] Playwright evidence in `.titan/qa/`
- [ ] Real Android phone in airplane mode (PWA and Chrome)
- [ ] All success criteria met

---

## Learnings (Self-Annealing)

> Grows during implementation.

### 2026-11-13: Phase 1 (start with no network)
- **Pieces:** `public/sw.js` (desk cache `lensspace-shell-<hash>` built from the asset list of `/sin-conexion`, CSS
  `url()` fonts included; `/_next/static` cache-first; failed navigation → 303 to `/sin-conexion?desde=<path>`, else
  `offline.html`), `src/app/sin-conexion/page.tsx` (`force-static`), `src/features/offline/` (`OfflineDesk`,
  `useNetworkStatus`), `scripts/qa-offline.mjs`.
- **Decisions:** redirect instead of serving the desk under the requested URL, so the Next router never reconciles a
  foreign route and asks the network. The desk refreshes in the background at most every 30 min on a successful
  navigation; the old cache is deleted only after the new one is complete (`-partial` staging cache).
- **Desk uses plain `<a>`, not `next/link`,** and `navigator.onLine` events (`useOffline` only reacts to Next fetches).
- **Measured:** `node scripts/qa-offline.mjs` 6/6 on `next start` at 390 px: 18 cached entries, no RSC/API, cold start
  offline on `/dashboard` lands on the desk, reload offline needs no network, styles and fonts render. Screenshots in
  `.titan/qa/2026-11-13-offline-sales/`.
- **Not yet tested:** installed PWA and Chrome on a real Android in airplane mode; deploy refresh of the desk cache.

### 2026-11-13: Phase 2 (data on the device)
- **Pieces:** `src/features/sales/load-sale-context.ts` (scopes, retail catalog priced per organization, rates; now used
  by `/sales` and by the snapshot, so both price the same way), `src/features/offline/` (`types.ts`, `store/` with the
  `OfflineStore` interface and `indexedDbStore`, `snapshot/` capture, sync and 7-day expiry, `OfflineSnapshotSync` in
  the `(main)` layout for users with `/sales`), `src/shared/components/SignOutForm.tsx`.
- **Decisions:** the desk opens for `meta.lastUserId`, not for the cookie session (offline `getSession` with an expired
  token is unreliable). The snapshot refreshes at most every 2 h, on load, on `online` and on tab focus; capturing for
  a user deletes any other user's saved data (shared phones), never sales. Customers carry phones and prescription
  revision ids/labels only, no graduation values or amounts. Paged by 1 000 rows (`max_rows`), capped at 10 000.
- **IndexedDB writes resolve on transaction `complete`,** not on request success: a sale counts as saved only once durable.
- **Measured:** `qa-offline.mjs` 11/11 with the demo owner of «Óptica Javier Prueba» (`QA_EMAIL`/`QA_PASSWORD`):
  snapshot 3.8 KB (11 customers, 13 items, 3 optometrists), read offline, expired after 8 days, removed on sign-out.
- **Error (phase 2):** typing the shared loader with `SupabaseClient<Database>` from `@supabase/supabase-js` failed: `@supabase/ssr`
  bundles different generics. **Fix:** type it as `ReturnType<typeof createClient>` from `@/lib/supabase/client`.
  **Apply in:** any helper shared by the server and browser Supabase clients.

---

## Gotchas

- [ ] The service worker must never cache RSC payloads, API or Supabase responses; only the offline shell and hashed
      `/_next/static` files.
- [ ] A new deploy changes chunk names: the shell cached by an old worker must keep its own chunks until the new worker
      re-caches (cache per build id, delete old ones on activate).
- [ ] `getSession` offline with an expired access token: must not be treated as logout (Kshop `authUnreachable`).
- [ ] Two sellers offline can create the same customer: flag as possible duplicate, do not merge automatically.
- [ ] A late upload changes a day already closed: correct, and visible through `offline_sales.uploaded_at` and post-close.
- [ ] Uninstalling the PWA/app or clearing site data deletes pending sales: say it on the pending screen.
- [ ] Money in cents/numeric, never floating point; Spanish keyboards may type a comma (Kshop `parseDecimal`).

## Anti-patterns

- Do NOT put tenant data in the service worker cache.
- Do NOT reuse `accept_quotation`'s price-change rejection for offline sales (D4).
- Do NOT delete a queued sale until the server confirms it.
- Do NOT upload in parallel or in one big request.
- Do NOT touch production, wholesale or cashbox closing flows in this plan.

---

*PRP approved on 2026-11-13.*

### 2026-11-13: Phase 3 (server), written and dry-run tested
- **Pieces:** `supabase/migrations/20261113120000_offline_sales.sql` (`offline_sales` with select-only RLS,
  `record_offline_sale`, helpers `offline_sale_time`, `same_money_totals`, `offline_key`, `offline_new_customer`,
  `offline_new_revision`, definer `insert_offline_sale` and `stamp_offline_order`; `prepare_cash_payment` replaced with
  two changes), `supabase/tests/offline_sales.sql`.
- **How it works:** one transaction per sale reusing the online RPCs (`create_customer_with_phones`,
  `create_prescription_revision`, `save_multi_line_quotation`, `accept_quotation`, `register_cash_payment`) with stable
  keys derived from the sale id (`md5(sale_id:part)::uuid`). The payment trigger takes the sale time and skips the
  overpayment refusal **only** while `lensspace.offline_sold_at` is set (transaction-local, cleared right after; not
  settable through the API). Flags: `price_mismatch`, `overpaid`, `possible_duplicate_customer` (same phone in the
  branch, not for relatives who copy the holder's phone), `clock_skew` (> 10 min ahead), `late_upload` (> 8 days old).
- **Payload** (camelCase): `organizationId, branchId, soldAt, localNumber, deviceId, usdToCupRate, notes?,
  holder: {id} | {new: {fullName, phones[], ...}}, pairs[1..10]: {patient?: {id} | {new} (default holder),
  prescription?: {revisionId} | {new: {prescriptionDate, prescriberName, rightSphere, ...}}, itemIds, lineAdjustments?},
  payment?: {amount, currency, appliedRate?, notes?}, device: {totals, cupEquivalent}`.
- **Measured:** dry run (migration + tests in one transaction ending in `raise exception`, Management API) green for
  `offline_sales.sql` and, with the migration in place, `cashbox_closures`, `multi_pair_orders`,
  `pending_start_and_fair_payment`, `commercial_orders`, `special_permission_branch_orders`, `retail_optician_users`.
  Checked afterwards: nothing persisted.
- **Error:** `update public.orders` from the invoker RPC → `permission denied for table orders` (sellers have no UPDATE
  grant). **Fix:** definer helper `stamp_offline_order` that only touches the caller's retail order.
  **Apply in:** any RPC that must change a column the API roles cannot write.
- **Error:** a CUP payment without a rate violated `payments.applied_rate not null`. **Fix:** default 1, as
  `PaymentForm` sends online.
- **Applied** 2026-11-13 with `npx supabase db push --remote --yes` after a `--dry-run` that listed only this file
  (Roberto's OK). Re-ran `offline_sales`, `cashbox_closures`, `multi_pair_orders` against it (rolled back): green.
  Security advisors: nothing new. Performance advisor: `offline_sales_branch_id_fkey` has no single-column index
  (INFO, like 19 others in the project; the composite index leads with organization_id).

### 2026-11-13: Phase 4 (offline sale screen)
- **Pieces:** `src/features/offline/components/OfflineSaleForm.tsx` (twin of `SalesWorkspace`: same `PairEditor`,
  `ItemPicker`, `sale-pricing`), `OfflineSaleDialogs.tsx` (customer, relative, prescription; same form fields),
  `OfflinePaymentCard.tsx`, `OfflineSalesList.tsx`; `sale/payload.ts`, `sale/local-customers.ts`, `sale/save-sale.ts`.
  Shared components gained optional local-data props, unchanged online: `CustomerSearchPicker.search`,
  `PairEditor.searchCustomers`, `PrescriptionFormFields.optometristNames` → `OptometristInput.knownNames`.
- **Decisions:** customers and prescriptions created offline get negative ids and travel as `{new}`; a new prescription
  is offered only in the pair it was made for, and new customers are not searchable (each would be created once per
  pair on upload). No prescription original offline (attach later from Recetas). Payment optional; cannot exceed the
  estimated total. Provisional number `SC-<device 4>-<n>`. The form stays visible when the signal returns.
- **Measured:** `qa-offline.mjs` 15/15 (new customer, item, new prescription, 100 CUP, saved, survives an offline
  reload). The real payload replayed against production `record_offline_sale` as the demo owner, rolled back:
  order `JAV-2026-000017`, no flags, dated at sale time, payment on business day 2026-11-13. Nothing persisted.
- **Error:** a background snapshot capture that started before sign-out finished after it and wrote the data back.
  **Fix:** `syncOfflineSnapshot` saves only if `meta.lastUserId` is still the same user. **Apply in:** any async write
  of per-user device data that can outlive the session.
- **Error (phase 3 migration):** the duplicate-phone flag compared raw digits while `normalized_phone` prefixes 53 to
  8-digit numbers. **Fix:** `20261113130000_offline_sales_phone_match.sql` (written, test covers it; applied 2026-11-13 with Roberto's OK, the suite that failed on production before passes after).

### 2026-11-13: Phase 5 (upload, retained, visibility)
- **Pieces:** `queue/upload-sales.ts` (serial upload, oldest first; network/5xx/40001 → stays pending and stops the
  round; 42501/22023/P0002/other codes → retained with a Spanish reason; no session or another user's session → stays
  pending with `needsLogin`; uploaded sales kept 7 days on the device; retry and discard), `hooks/use-offline-upload.ts`
  (mount, `online`, tab focus), `OfflineSnapshotSync` now uploads first and then refreshes the saved data (forced when
  something uploaded) and shows a toast, `OfflineSalesList` with Reintentar / two-step Descartar, `SignOutForm` dialog
  when sales are waiting, `OfflineSaleNotice` in `OrderDetail` (sold/uploaded times and flags; one small read of
  `offline_sales`). Types regenerated with `supabase gen types --linked --schema public` (only additions).
- **Measured:** `QA_UPLOAD=1 qa-offline.mjs` 21/21 against production with the demo owner: the first upload's response
  was dropped after the server recorded it (Playwright `route.fetch` + `abort`), the sale stayed «Por subir», the next
  round returned the same order `JAV-2026-000017` (one order, one `offline_sales` row, dated at sale time, no flags);
  a copy aimed at an organization the user is not in was retained with the reason and discarded; sign-out asked first.
  The automatic «Pedido confirmado» WhatsApp was attempted and stopped with `missing_consent` (D12 works end to end).
- **QA data left in production (demo org «Óptica Javier Prueba»):** order `JAV-2026-000017`, customer
  `QA Offline 1794618423951` (no consent), no payment. Retail orders cannot be cancelled or deleted (business rule,
  immutable payments), so QA uploads must go without payment and to the demo organization only.
- **Not done:** blocking cashbox closing while sales wait on a device (late payments already land as post-close).
