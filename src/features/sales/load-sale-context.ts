import type { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/lib/supabase/database.types'

import type { SaleItem } from './components/sale-types'

export type SaleScope = { id: number; name: string; branchId: number; branchName: string; canOperate: boolean; canApproveLargeDiscount: boolean }
export type SaleBusinessRate = { rate: number; rateDate: string }
export type SaleContext = {
  organizationIds: number[]
  branchIds: number[]
  organizations: SaleScope[]
  items: SaleItem[]
  lastRates: Record<number, number>
  businessRates: Record<number, SaleBusinessRate>
}

type ItemRow = { id: number; organization_id: number | null; category: string; name: string; sale_price: number; currency: string }
type OverrideRow = { organization_id: number; catalog_item_id: number; sale_price: number | null; currency: string | null; is_enabled: boolean | null }

// What a seller needs to sell: scopes, retail catalog priced per organization and rates.
// Shared by /sales (server client) and the offline snapshot (browser client, LEN0011)
// so both price the same way. Works with either client because RLS does the scoping.
// Typed from @supabase/ssr (both clients come from it; plain supabase-js types differ).
type SaleClient = ReturnType<typeof createClient>

export async function loadSaleContext(supabase: SaleClient, userId: string): Promise<SaleContext> {
  const { data: rawMemberships } = await supabase.from('organization_memberships').select('organization_id, branch_id, role').eq('user_id', userId).eq('status', 'active').in('role', ['owner', 'seller'])
  const memberships = (rawMemberships ?? []) as Pick<Tables<'organization_memberships'>, 'organization_id' | 'branch_id' | 'role'>[]
  const organizationIds = [...new Set(memberships.map((entry) => entry.organization_id))]
  const empty = Promise.resolve({ data: [] })
  const [{ data: organizationData }, { data: branchData }, { data: itemData }, { data: overrideData }, { data: rateData }] = await Promise.all([
    organizationIds.length ? supabase.from('organizations').select('id, name, usd_to_cup_rate, usd_rate_date').in('id', organizationIds) : empty,
    organizationIds.length ? supabase.from('branches').select('id, organization_id, name').in('organization_id', organizationIds).eq('is_active', true) : empty,
    organizationIds.length ? supabase.from('catalog_items').select('id, organization_id, category, name, sale_price, currency').eq('is_active', true).eq('sales_channel', 'retail').order('category').order('name') : empty,
    organizationIds.length ? supabase.from('catalog_item_overrides').select('organization_id, catalog_item_id, sale_price, currency, is_enabled').in('organization_id', organizationIds) : empty,
    // Latest rate used per organization: a better default than a fixed 420 (QA-22).
    organizationIds.length ? supabase.from('orders').select('organization_id, usd_to_cup_rate').in('organization_id', organizationIds).order('created_at', { ascending: false }).limit(50) : empty,
  ])
  const lastRates: Record<number, number> = {}
  for (const row of (rateData ?? []) as { organization_id: number; usd_to_cup_rate: number | null }[]) {
    if (row.usd_to_cup_rate && !(row.organization_id in lastRates)) lastRates[row.organization_id] = Number(row.usd_to_cup_rate)
  }
  const organizationRows = (organizationData ?? []) as unknown as { id: number; name: string; usd_to_cup_rate: number | null; usd_rate_date: string | null }[]
  // Business rate adopted from elTOQUE; it stays until someone refreshes it again.
  const businessRates = Object.fromEntries(organizationRows.flatMap((row) => row.usd_to_cup_rate && row.usd_rate_date ? [[row.id, { rate: Number(row.usd_to_cup_rate), rateDate: row.usd_rate_date }]] : []))
  const branchRows = (branchData ?? []) as unknown as { id: number; organization_id: number; name: string }[]
  const scopes = memberships.flatMap((membership) => {
    const availableBranches = membership.role === 'owner'
      ? branchRows.filter((branch) => branch.organization_id === membership.organization_id)
      : branchRows.filter((branch) => branch.id === membership.branch_id)
    return availableBranches.map((branch) => ({ organizationId: membership.organization_id, branch }))
  })
  const uniqueScopes = [...new Map(scopes.map((scope) => [`${scope.organizationId}:${scope.branch.id}`, scope])).values()]
  const operability = new Map<number, boolean>()
  await Promise.all(organizationIds.map(async (organizationId) => {
    const { data } = await supabase.rpc('current_user_can_operate_organization', { target_organization_id: organizationId, required_module_key: 'optical_sales' } as never)
    operability.set(organizationId, Boolean(data))
  }))
  const organizations = uniqueScopes.map(({ organizationId, branch }) => ({
    id: organizationId,
    name: organizationRows.find((entry) => entry.id === organizationId)?.name ?? 'Organización',
    branchId: branch.id,
    branchName: branch.name,
    canOperate: operability.get(organizationId) ?? false,
    canApproveLargeDiscount: memberships.some((entry) => entry.organization_id === organizationId && entry.role === 'owner'),
  }))
  const overrides = (overrideData ?? []) as unknown as OverrideRow[]
  // Base items are priced per organization (same rule as calculate_catalog_price):
  // apply each óptica's override and drop the items it disabled.
  const items = ((itemData ?? []) as unknown as ItemRow[]).flatMap((entry) => (entry.organization_id === null ? organizationIds : [entry.organization_id]).flatMap((organizationId) => {
    const override = overrides.find((row) => row.organization_id === organizationId && row.catalog_item_id === entry.id)
    if (override?.is_enabled === false) return []
    return [{ id: entry.id, organizationId, name: entry.name, category: entry.category, price: Number(override?.sale_price ?? entry.sale_price), currency: override?.currency ?? entry.currency }]
  }))
  return { organizationIds, branchIds: uniqueScopes.map(({ branch }) => branch.id), organizations, items, lastRates, businessRates }
}
