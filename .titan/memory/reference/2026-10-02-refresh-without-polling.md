# Refresh without polling (pilot bandwidth)

Date: 2026-10-02

How LensSpace keeps data fresh on weak Cuban links (QA-24..27). No polling, no Realtime.

- **Workspace state seeded from server props:** use `useServerState(initialX)`
  (`src/shared/hooks/use-server-state.ts`), never `useState(initialX)`, so
  `router.refresh()` and back/forward bring fresh lists.
- **Sidebar counters:** after a mutation that changes pending orders or production
  jobs, call `refreshNavigationCounters()` (`src/shared/lib/navigation-counters.ts`);
  layouts do not re-render on soft navigation.
- **Route refresh:** `RefreshOnFocus` in the `(main)` layout refreshes on back/forward,
  on `online`, and when the tab returns after ≥ 60 s hidden. Each costs one RSC
  request (~9 KB on `/sales`).
- Effects that depend on server props (e.g. auto-opening the first order) must not
  reset what the user has open when fresh props arrive.
- Sibling components must not share a React `key` (e.g. two panels keyed by order id).

## Bandwidth and latency rules (Phase 4, QA-28..35)

- Server auth: `getCurrentUser()` (`src/lib/supabase/current-user.ts`, React `cache`
  + `getClaims`, ES256 local verification). Never call `auth.getUser()` in pages.
- Independent server queries go in one `Promise.all`; per-org checks too.
- Do not ship lists to compute a few numbers or one screen: aggregate or combine in an
  RPC (`get_order_kpis`, `get_order_detail`, `get_order_production_panel`) or embed
  (`customers … orders(commercial_status)`). `/orders` uses
  `list_accessible_orders(finished_since)` (90 days of finished orders).
- Sidebar prefetch only for `/orders` and `/sales`; other links show the
  `useLinkStatus` spinner. Each prefetch re-sends the ~2.6 KB auth cookie.
- `public/sw.js` must never cache tenant data, RSC or API responses. Since LEN0011
  (2026-11-13) it also caches the static offline desk `/sin-conexion` and its hashed
  `/_next/static` files (see `project/2026-11-13-offline-sales.md`). Bump `FALLBACK_CACHE` when changing `offline.html`.
