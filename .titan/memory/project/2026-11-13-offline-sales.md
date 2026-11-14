# Offline sales first, then the Android APK (LEN0011)

Date: 2026-11-13

Decision (Roberto, 2026-11-13). Plan: `.titan/plans/prp-offline-sales.md`. The APK plan
(`prp-android-apk-capacitor.md`) is no longer parked: it follows LEN0011 with amendments.

- The pilot client works with **no network at all**. Scope of the first stage: the seller's sale
  (customer, prescription, quotation, accept, cash payment) and consulting their own orders.
  Production, wholesale, cashbox closing, team and admin stay online.
- Offline access lasts **7 days** after the last server confirmation.
- Why not the APK alone: the parked plan loads the remote web (`server.url`), so it fails offline
  like the browser. Kshop's offline works because its admin app code is packaged (Vite), designed
  for it from day one; LensSpace pages load data on the server.
- Shape: a static client route `/sin-conexion` precached by `public/sw.js`, data on the device in
  IndexedDB behind an `OfflineStore` interface (native files inside the future APK), and one
  composite idempotent RPC `record_offline_sale` that **records, not decides** (price changes,
  possible duplicates and clock skew become flags; Kshop D3).
- This deliberately extends the 2026-10-02 rule «sw.js never caches tenant data»: the worker caches
  only the offline shell and hashed `/_next/static` files; tenant data lives in IndexedDB per user,
  cleared on logout.
- `experimental.useOffline` (already on) only retries soft navigations and Server Actions; it does
  not open the app cold without network.
- Reference implementation: Kshop `prp-pos-offline.md`.
- 2026-11-13: `record_offline_sale` and `offline_sales` are in production (migration
  `20261113120000_offline_sales.sql`). Roberto confirmed that an uploaded offline sale sends the same
  WhatsApp messages as an online one («pedido aceptado», «pago recibido»).
- QA of real uploads: only in the demo organization «Óptica Javier Prueba», customer without WhatsApp
  consent and **without payment** (retail orders and payments cannot be cancelled or deleted). Run
  `QA_UPLOAD=1 node scripts/qa-offline.mjs` against `ERROR_LOG_INGEST_SECRET= npx next start`. Left on
  2026-11-13: order `JAV-2026-000017`, customer `QA Offline 1794618423951`.
- 2026-11-13 state: phases 1-7 built and tested in Playwright (`scripts/qa-offline.mjs`; `QA_UPLOAD=1` writes
  to the demo org). Web not deployed yet; real Android test pending. Key files: `public/sw.js`,
  `src/app/sin-conexion/`, `src/features/offline/`, `src/features/sales/load-sale-context.ts`, migrations
  `20261113120000_offline_sales.sql` and `20261113130000_offline_sales_phone_match.sql`.
- The saved `/manual` (`manual_documents`) does not include «Vender cuando no hay señal»; only the default does.
