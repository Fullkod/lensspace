# PRP LEN0002 — Product usage and organization activity for the platform admin

Date: 2026-10-19
Status: IMPLEMENTADO y aprobado por Roberto el 2026-10-19 (migration applied, pushed to main)
Project: LensSpace

---

## Objective

The platform admin can see whether LensSpace is really being used, by each optician
and across the platform, and which parts of the flow are used most, to decide what to
improve. Aggregates only: no customer, prescription or order details (QA-38).

## Decisions (Roberto, 2026-10-19)

1. Goal: real adoption and which features are used most; never customer details.
2. Money is included: amount collected in the period, per currency plus the CUP equivalent.
3. Team: member names, role and last access date only (no per-person activity).
4. Periods: 7 days, 30 days, 90 days and «Siempre».
5. (Proposed by the agent, accepted with the plan) a platform-wide view on the admin
   dashboard with the same figures plus how many opticians used each feature.

## What

### Success criteria
- [ ] Organization detail shows an «Actividad» card with the period selector and the figures below; same numbers as a direct SQL count.
- [ ] Admin dashboard shows «Uso del producto» for the whole platform, with opticians using each feature.
- [ ] Organization list shows active days and orders in the last 30 days, and can sort/filter by «sin actividad».
- [ ] Only platform admins can call the RPCs (tenant users get 42501); no names of customers, no order numbers, no message text leave the database.
- [ ] Works at 390 px.

### Figures (per period, business days in America/Havana)
- **Constancia:** active days (distinct dates with any event) and last activity.
- **Ventas:** quotations created / accepted (conversion), orders created / delivered, price adjustments.
- **Cobros:** payments count, amount per currency, CUP equivalent.
- **Clientes y recetas:** new customers, new prescriptions.
- **Producción:** jobs assigned / received, reworks.
- **Caja:** closures.
- **WhatsApp:** attempts per template.
- **Tendencia:** orders and payments per week, last 8 weeks.
- **Equipo (organization only):** name, role, status, last sign-in (`auth.users.last_sign_in_at`).
- **Adopción (platform only):** organizations with at least one event per feature in the period.

## Context

- `public.get_platform_usage()` (20261002225313) feeds the organization list and the admin dashboard; extend it with `orders30` and `activeDays30` instead of a parallel RPC.
- `src/features/admin/components/PlatformAdminWorkspace.tsx` (list + detail dialog, 293 lines: the card goes in its own component), `PlatformAdminDashboard.tsx` (its «Actividad de organizaciones» list says "most recent" but is ordered by creation: sort by last activity while touching it).
- Pattern reference: Turno Flash TUR0006 (`../turno-flash`, `get_admin_organization_activity`).
- Platform guide: `src/features/client-docs/generators/platformGuide.ts`.

### Data model
No new tables. One unified event stream inside the RPC (`org, kind, at`) from quotations,
orders, order_items (price adjustments), payments, customers, prescriptions,
production_jobs, cashbox_closures and notification_attempts; counts, distinct
organizations and distinct Havana dates come from it. Money comes from payments.

## Blueprint

### Phase 1: Database
`get_organization_activity(target_organization_id bigint default null, target_days integer default 30)` (null org = platform, null days = always), extend `get_platform_usage`, transactional test.
**Validation:** test in BEGIN/ROLLBACK (figures vs fixtures, tenant denied); advisors without new findings beyond the known definer pattern.

### Phase 2: UI
`ActivityPanel` (shared by the org detail and the dashboard), list cells + «sin actividad» sort, dashboard section, platform guide.
**Validation:** typecheck, lint, build; figures checked against SQL for a real organization.

### Phase 3: Close
Memory, PRP learnings, Tasknic (LEN0002) comment with «Cómo probarlo», commits by area.

## Gotchas
- Business dates: `(at at time zone 'America/Havana')::date`, never UTC dates (Vercel renders in UTC).
- `notification_attempts` keeps message text and recipients: only count by template/outcome.
- Provider accounts belong to several opticians: their last sign-in is global, label it as such.
- Payments can be CUP or USD: never add currencies together, show each plus `equivalent_cup`.

## Learnings

> Grows during implementation.

### 2026-10-19: Direct counts in SQL tests must bypass RLS
- **Error**: the test compared the RPC with `select count(*) from public.orders` while running as `authenticated` + admin claim; RLS hides tenant rows from the platform admin (QA-38), so the direct count was wrong, not the RPC.
- **Fix**: `reset role` before the comparisons and keep the JWT claim: definer RPCs still see the admin through `auth.uid()`.
- **Apply in**: every test that checks a platform-admin aggregate against raw tables.

### 2026-10-19: Verified
- `supabase/tests/organization_activity.sql` passes (period filter, always, active days, 8 weeks, team, adoption, tenant denied, invalid period, list figure = card figure).
- Real data: «Óptica Javier» RPC counts equal direct counts (orders 3, payments 4, quotations 6, customers 2, WhatsApp 9; 50 400 CUP in 30 days).
- Lint, typecheck, build pass. Not verified visually: needs a platform-admin session.

### Differences from the blueprint
- The org list shows one cell «Activa (30 días)» (`N días · M pedidos`) and the filter panel gained «Orden: Menos activas primero».
- The dashboard list «Actividad de organizaciones» is now ordered by last activity (it said so but sorted by creation).
- `lastActivityAt` in `get_platform_usage` now uses the same event stream (adds quotations, customers, prescriptions, closures).
