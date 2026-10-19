# PRP LEN0001 — Error log with WhatsApp alerts to the platform admin

Date: 2026-10-19
Status: IMPLEMENTADO 2026-10-19 (approved by Roberto; Vercel env var and push pending, see Learnings)
Project: LensSpace

---

## Objective

LensSpace records every unexpected error (server render, server action, route handler,
proxy and browser) in a private, grouped error log that the platform admin reviews from
the panel, and the admin receives a short WhatsApp message through the existing OpenWA
integration the first time a new error appears (or a resolved one comes back).

## Why

| Problem | Solution |
|---------|----------|
| Errors are only `console.error` in `src/app/(main)/error.tsx`; on Vercel they are lost in runtime logs nobody watches. | Persist them in Supabase with route, organization, user and source. |
| `friendlyError` hides technical Postgres/PostgREST messages from users, so real bugs look like "No pudimos completar la acción" and nobody hears about them. | Report those masked technical errors (not network or permission ones) to the log. |
| The pilot opticians rarely report problems; the admin finds out late. | WhatsApp alert to the admin phone (`platform_provider_profile.phone`) on a new or regressed error. |
| Repeated failures would flood WhatsApp. | Group by fingerprint, alert once per group until resolved, and cap alerts per hour. |

**Business value**: shorter time to detect and fix pilot bugs, without paying for an
external observability SaaS (Sentry etc.) or adding dependencies.

## What

### Success criteria
- [ ] A thrown error in a Server Component, Server Action or Route Handler creates a row in the error log with source, route, organization (when known), digest and a trimmed stack.
- [ ] A browser error (`window` `error` / `unhandledrejection`, client error boundary without digest, technical error masked by `friendlyError`) from a signed-in user is recorded; network errors are not.
- [ ] The same error repeated N times produces one group with `occurrences = N` and exactly one WhatsApp alert; a resolved group that reappears alerts again ("regresión").
- [ ] No more than the hourly cap of alerts is sent even if many distinct errors appear; the rest stay visible in the panel.
- [ ] The platform admin (only) can list, filter (open/resolved/ignored, source, organization), open the detail and mark groups resolved/ignored, on mobile and desktop.
- [ ] Logging never breaks the user's request: a failure to record or to alert is swallowed and does not change the user-facing error.
- [ ] No secrets, cookies, request bodies, prescriptions or customer data are stored; RLS denies every tenant user.

### Expected behavior (happy path)
1. A seller saves a sale; the server action throws an unexpected error.
2. Next.js calls `onRequestError` in `src/instrumentation.ts`; it builds a sanitized
   report (message, digest, stack, `routePath`, `routeType`, method) and records it
   server-side, resolving user/organization from the request when possible.
3. The database computes the fingerprint (normalized message + source + route + first
   app stack frame), upserts the group, inserts the occurrence and, because the group
   is new, queues an alert.
4. The alert goes through pg_net to a new Edge Function that sends via OpenWA to the
   admin phone: `LensSpace (error): nuevo error #42 en /sales (acción) — Óptica X.
   "duplicate key value violates…". 1ª vez 10:42. Ver: <url>/errors/42`.
5. The seller sees the existing friendly message; nothing else changes for them.
6. The admin opens `/errors`, reads the detail (occurrences, users/orgs affected,
   stack), fixes the bug and marks it "Resuelto". If it happens again, it reopens as a
   regression and alerts once more.

---

## Context

### References
- `supabase/migrations/20261011210800_subscription_grace_and_notices.sql` — pattern to copy: private table + `queue_*` function + Vault secrets (`vision_studio_project_url`, `vision_studio_wa_notify_secret`) + `net.http_post` + service-role-only payload/complete RPCs + `admin_*` notices to `platform_provider_profile.phone`.
- `supabase/functions/send-subscription-notice/index.ts` — OpenWA sending, `x-wa-secret` check, `phoneToChatId`, QA-61 handling (`provider_unconfirmed` on 5xx, never retried).
- `supabase/functions/send-whatsapp-notification/` — the other OpenWA sender (same helpers duplicated).
- `src/shared/lib/friendly-error.ts` — single place (25 files use it) where technical errors are masked; natural hook for handled client errors.
- `src/app/(main)/error.tsx`, `src/app/global-error.tsx` — client boundaries (only `console.error` today).
- `src/app/(main)/organizations/page.tsx` — platform-admin gate (`current_user_is_platform_admin`), `PageContainer/PageHeader`.
- `src/shared/components/MainNavigation.tsx` — "Gestión" group, add the platform-only entry.
- `src/features/client-docs/generators/platformGuide.ts` — platform guide must be updated when the admin panel changes (memory 2026-10-11).
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md` (`onRequestError`) and `instrumentation-client.md` (browser hooks).
- Memory: `2026-09-20-openwa-notifications.md`, `2026-10-03-proxy-and-server-access.md` (files live in `src/`), `2026-10-02-rls-for-update-and-retry-safe-rpcs.md`, `2026-10-01-mobile-first-views.md`.

### Proposed architecture (feature-first)
```
src/instrumentation.ts                 # onRequestError -> server reporter
src/instrumentation-client.ts          # window error / unhandledrejection -> client reporter
src/features/error-log/
├── components/                        # ErrorLogWorkspace (list + filters), ErrorGroupDetail
├── report-server-error.ts             # sanitize + record (server only)
├── report-client-error.ts             # sanitize + throttle + RPC (browser)
├── sanitize.ts                        # truncation, redaction of emails/phones/tokens
├── actions.ts                         # resolve / ignore / reopen (platform admin)
└── types.ts
src/app/(main)/errors/page.tsx         # platform-admin only
supabase/migrations/<ts>_error_log.sql
supabase/functions/send-platform-alert/index.ts
supabase/tests/error_log.sql
```

### Key decisions (to confirm)
1. **Server write path**: `onRequestError` has no reliable user session, so the server
   records through a service-role-only RPC using a new server-only env var
   `SUPABASE_SERVICE_ROLE_KEY` (Vercel), never `NEXT_PUBLIC_`. The user/org are
   resolved best-effort from the request cookies with the normal server client.
   Alternative: an anon-callable RPC with rate limiting — simpler config, but open to
   spam from anyone with the anon key. Recommended: service role.
2. **Client write path**: `report_client_error` RPC for `authenticated` users only,
   rate-limited per user (e.g. 20 per 10 min) and with payload caps. Public pages
   (landing, manual) are not covered in v1.
3. **No double counting**: the client boundary reports only when the error has no
   `digest` (digest means the server already logged it); otherwise it adds nothing.
4. **What is not an error**: network/offline (`isNetworkError`), permission/read-only
   (`permissionPattern`), Spanish business messages raised by our RPCs, `redirect()` /
   `notFound()` control-flow errors, aborted requests.
5. **Alert policy**: one alert per new group and per regression; hourly global cap
   (proposed 6); alerts in a private table with status like `subscription_notices`.
   No daily digest in v1.
6. **WhatsApp sender**: new Edge Function `send-platform-alert` reusing the existing
   Vault secrets; extract the shared OpenWA helpers to `supabase/functions/_shared/`
   only if the duplication becomes a third copy (it would be) — decide in phase 3.
7. **Retention**: occurrences older than 90 days are purged by pg_cron; groups stay.

### Data model
```sql
create table private.error_groups (
  id bigint generated always as identity primary key,
  fingerprint text not null unique,          -- sha256 of normalized message + source + route + top frame
  source text not null check (source in ('server_render','server_action','route','proxy','client','client_handled')),
  route_path text,
  title text not null,                       -- first line of the message, max 200
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  occurrences integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  last_alerted_at timestamptz
);

create table private.error_occurrences (
  id bigint generated always as identity primary key,
  group_id bigint not null references private.error_groups(id) on delete cascade,
  organization_id bigint references public.organizations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  message text not null,                     -- sanitized, max 1000
  digest text,
  stack text,                                -- sanitized, max 4000
  context jsonb not null default '{}',       -- method, routeType, renderSource, userAgent, appVersion
  created_at timestamptz not null default now()
);
create index on private.error_occurrences (group_id, created_at desc);
create index on private.error_occurrences (created_at);   -- retention purge

create table private.error_alerts (
  id bigint generated always as identity primary key,
  group_id bigint not null references private.error_groups(id) on delete cascade,
  reason text not null check (reason in ('new','regression')),
  recipient text,
  message text not null,
  status text not null default 'requested' check (status in ('requested','sent','failed','skipped')),
  failure_code text, failure_message text, provider_message_id text,
  created_at timestamptz not null default now(), completed_at timestamptz
);
-- Tables live in `private` (not exposed by PostgREST). Access only through
-- security-definer RPCs: record_server_error (service_role), report_client_error
-- (authenticated, rate-limited), list/get/set_status (private.is_platform_admin()),
-- get_platform_alert_payload / complete_platform_alert (service_role).
```

---

## Blueprint

> Phases only. Subtasks are generated when entering each phase (tf-bucle-agentico).

### Phase 1: Database log and RPCs
**Objective**: tables, fingerprint/upsert logic, rate limit, admin read/status RPCs, retention cron, regenerated types.
**Validation**: `supabase/tests/error_log.sql` (grouping, regression reopen, rate limit, tenant user denied, admin allowed) passes; `supabase db lint` clean; advisors without new warnings.

### Phase 2: Capture in Next.js
**Objective**: `src/instrumentation.ts` (`onRequestError`), `src/instrumentation-client.ts`, client boundary reporting without digest, `friendlyError` reporting masked technical errors; sanitization and fire-and-forget behavior.
**Validation**: a forced error in a dev-only path for each source (render, action, client, handled) produces one row each; a network error and a Spanish RPC message produce none; the user-facing copy is unchanged; typecheck and lint pass.

### Phase 3: WhatsApp alert
**Objective**: alert queueing on new/regressed groups with the hourly cap, Edge Function `send-platform-alert` via OpenWA to the admin phone, outcome recorded (QA-61 semantics).
**Validation**: a new group sends exactly one real WhatsApp to a controlled admin number; repeats send none; exceeding the cap marks alerts `skipped`; missing phone ends as `failed/missing_recipient`.

### Phase 4: Platform admin panel
**Objective**: `/errors` (platform-admin only, nav entry under "Gestión"), list with filters and counts, detail with occurrences, resolve/ignore/reopen; platform guide updated.
**Validation**: tenant users are redirected and the RPCs deny them; Playwright screenshots at 390 px and desktop in `.titan/qa/`.

### Phase 5: Final validation
**Objective**: end to end in the deployed environment.
**Validation**:
- [ ] `npm run lint`, `npm run typecheck`, `npm run build` pass
- [ ] Migration applied remotely, Edge Function deployed, `SUPABASE_SERVICE_ROLE_KEY` set in Vercel (server only)
- [ ] One real error in production-like env → row + WhatsApp + visible in `/errors`
- [ ] Success criteria checked; memory entry added in `.titan/memory/project/`

---

## Learnings (Self-Annealing)

> Grows during implementation.

### 2026-10-19: Narrow ingest secret instead of the service role
- **Decision**: Roberto approved `SUPABASE_SERVICE_ROLE_KEY` "with all the security possible"; we used a dedicated secret instead: Vault `lensspace_error_ingest_secret` + server-only env `ERROR_LOG_INGEST_SECRET`. `record_server_error` is granted to `anon` only (the server calls without a session) and checks the secret; it can only write reports, with a global quota of 500 per 10 min. A leak cannot read or change tenant data.
- **Apply in**: any server-to-DB write that has no user session.

### 2026-10-19: `supabase db push` refuses (history drift)
- **Error**: `Remote migration versions not found in local migrations directory` (old MCP applies with other timestamps, e.g. 20260913224749).
- **Fix**: do not repair. Apply the file with `supabase db query --linked -f` inside `begin … commit` plus `insert into supabase_migrations.schema_migrations (version, name)` with the local file's version. Dry-run first: migration + test body in one `begin … rollback` file.

### 2026-10-19: Verified
- Production build: a throwing page → 1 group, `occurrences = 3`, 1 alert queued; route/context whitelisted.
- Real WhatsApp received (alert #2, recorded `provider_unconfirmed` because OpenWA answered 500 after delivering — QA-61). The panel shows that as «Sin confirmar».
- Wrong ingest secret → 401; direct call to `send-platform-alert` without `x-wa-secret` → 401.
- Test groups deleted afterwards. Not verified: `/errors` visually (needs a platform-admin login) and the browser reporters in a real session.

### Delivered beyond the blueprint / differences
- `server_handled` source: `sendOwnerPasswordReset` reports unexpected RPC/Auth failures.
- OpenWA helpers copied into `send-platform-alert` (third copy) so the two existing functions were not redeployed.
- Client reporter loads the Supabase client with `import()` only when reporting, so public pages do not grow.
- Reporters only run when `NODE_ENV === 'production'`: `npm run dev` never writes the log or sends WhatsApp.

---

## Gotchas

- [ ] In production React replaces Server Component error messages with a digest on the client: only the server (`onRequestError`) has the real message. Correlate by `digest`, never log twice.
- [ ] `onRequestError` must await its async work and must never throw; wrap everything and use a short timeout.
- [ ] `redirect()` / `notFound()` throw control-flow errors (`NEXT_REDIRECT`, `NEXT_HTTP_ERROR_FALLBACK`): filter them out.
- [ ] `src/instrumentation.ts` may run in the Edge runtime for proxy errors: no Node-only APIs; check `process.env.NEXT_RUNTIME`.
- [ ] Fingerprint must normalize ids, numbers, UUIDs and quoted values, or every occurrence becomes a new group (and a new WhatsApp).
- [ ] Reporting inside `friendlyError` must not create loops (a failing report call must not report itself) and must be throttled in the browser.
- [ ] OpenWA can deliver and answer 5xx (QA-61): record `provider_unconfirmed`, never retry.
- [ ] Cuba connectivity: client reports are best-effort; do not queue offline reports in v1.
- [ ] Private schema tables are invisible to PostgREST: everything goes through RPCs with `set search_path = ''` and explicit grants.
- [ ] Never store request headers, cookies, bodies or form values; redact emails/phones/JWT-like strings in messages and stacks.

## Anti-patterns

- Do NOT add Sentry or another SDK/dependency without asking.
- Do NOT reuse `private.subscription_notices` for error alerts (it requires an organization and has subscription kinds).
- Do NOT expose the service role key to the browser or to `NEXT_PUBLIC_*`.
- Do NOT alert on every occurrence.
- Do NOT change user-facing error copy as part of this feature.

## Out of scope (v1)

- Errors inside Edge Functions and pg_cron jobs (they already record their own failures, e.g. `notification_attempts`, `subscription_notices`).
- Public pages for anonymous visitors, offline queueing of client reports, daily digest, notifying organization owners.

---

*Implemented 2026-10-19.*
