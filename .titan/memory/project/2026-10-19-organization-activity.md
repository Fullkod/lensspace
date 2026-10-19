# Product usage and organization activity (LEN0002)

Date: 2026-10-19

Plan: `.titan/plans/prp-organization-activity.md`. Tasknic: LEN0002.

- Goal (Roberto): know whether LensSpace is really used and which parts are used most,
  to improve the product. Never customer, prescription or order details (QA-38 still
  applies: aggregates only).
- Agreed scope: per-optician «Actividad» card and a platform-wide «Uso del producto»
  view; periods 7 / 30 / 90 days and «Siempre»; money collected per currency plus the
  CUP equivalent; team = names, role and last access date only.
- Business dates in America/Havana; currencies are never summed together.
- Implementation: `private.organization_activity_events(org)` is the single event
  stream; `get_organization_activity(org|null, days|null)` feeds `ActivityPanel`
  (org detail and «Uso del producto» on the admin dashboard); `get_platform_usage`
  adds `orders30`/`activeDays30` for the list. Add new product features to the event
  stream so they show up in «Qué se usa».
- Approved by Roberto on 2026-10-19 and pushed to `main` the same day.
