# Special seller permission covers every order of the branch

Date: 2026-11-09

Decision (Roberto, 2026-11-09, reported by the client «Para verte mejor», seller Emilio): the
exceptional permission `organization_memberships.can_manage_commercial_orders` is no longer
limited to commercial orders. An authorized seller works every order of their branch, retail
included: sees paid and balance, collects (into their own cashbox), sends the «ready»
WhatsApp, manages production and delivers. Same flag, no new permission.

Migration `20261109120000_special_permission_covers_branch_orders.sql`, test
`supabase/tests/special_permission_branch_orders.sql`.

- `private.can_access_seller_sale` is deliberately unchanged: it also guards quotations and
  cashboxes, which stay private to each seller. Do not widen it for this permission.
- Write paths use `private.can_write_branch_order`. Read paths add
  `private.can_manage_branch_commercial_orders` next to the existing check.
- Sellers cannot read other members' profiles (the memberships RLS inside
  `profiles_select_self_or_related` limits them to themselves), and
  `list_accessible_production_jobs` inner-joins the provider profile. The policy
  `profiles_select_for_order_managers` opens co-member profiles to authorized sellers only.
- Still open: `/production` lists providers from `organization_memberships`, so any seller,
  authorized or not, can only assign production to themselves.
- `supabase/tests/production_provider_workflows.sql` was already failing before this change
  («Par no encontrado»): it predates per-pair production.
- `/manual` serves the saved `manual_documents` row, which does not mention the permission.
  The default text in `clientDocsInput.ts` was updated, the saved row was not.
