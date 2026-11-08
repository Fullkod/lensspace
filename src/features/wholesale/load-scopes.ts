import type { Tables } from '@/lib/supabase/database.types'
import type { createClient } from '@/lib/supabase/server'

import type { CommercialScope } from './order-types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Branches where the user sells (owner: every active branch; seller: their own), with
// the reference rate for a new order: adopted business rate, else the latest order rate.
export async function loadCommercialScopes(supabase: SupabaseServerClient, userId: string): Promise<CommercialScope[]> {
  const { data: membershipData } = await supabase.from('organization_memberships').select('organization_id, branch_id, role').eq('user_id', userId).eq('status', 'active').in('role', ['owner', 'seller'])
  const memberships = (membershipData ?? []) as Pick<Tables<'organization_memberships'>, 'organization_id' | 'branch_id' | 'role'>[]
  const organizationIds = [...new Set(memberships.map(({ organization_id }) => organization_id))]
  if (!organizationIds.length) return []

  const [{ data: organizationData }, { data: branchData }, { data: rateData }] = await Promise.all([
    supabase.from('organizations').select('id, name, usd_to_cup_rate').in('id', organizationIds),
    supabase.from('branches').select('id, organization_id, name').in('organization_id', organizationIds).eq('is_active', true).order('name'),
    supabase.from('orders').select('organization_id, usd_to_cup_rate').in('organization_id', organizationIds).order('created_at', { ascending: false }).limit(50),
  ])
  const organizations = (organizationData ?? []) as Pick<Tables<'organizations'>, 'id' | 'name' | 'usd_to_cup_rate'>[]
  const branches = (branchData ?? []) as Pick<Tables<'branches'>, 'id' | 'organization_id' | 'name'>[]
  const lastRates: Record<number, number> = {}
  for (const row of (rateData ?? []) as { organization_id: number; usd_to_cup_rate: number | null }[]) {
    if (row.usd_to_cup_rate && !(row.organization_id in lastRates)) lastRates[row.organization_id] = Number(row.usd_to_cup_rate)
  }
  const operable = new Map<number, boolean>()
  await Promise.all(organizationIds.map(async (id) => {
    const { data } = await supabase.rpc('current_user_can_operate_organization', { target_organization_id: id, required_module_key: 'optical_sales' } as never)
    operable.set(id, Boolean(data))
  }))

  const scopes = memberships.flatMap((membership) => branches
    .filter((branch) => membership.role === 'owner' ? branch.organization_id === membership.organization_id : branch.id === membership.branch_id)
    .map((branch) => {
      const organization = organizations.find(({ id }) => id === branch.organization_id)
      return {
        organizationId: branch.organization_id,
        organizationName: organization?.name ?? 'Organización',
        branchId: branch.id,
        branchName: branch.name,
        rate: Number(organization?.usd_to_cup_rate ?? lastRates[branch.organization_id] ?? 420),
        canOperate: operable.get(branch.organization_id) ?? false,
      }
    }))
  return [...new Map(scopes.map((scope) => [`${scope.organizationId}:${scope.branchId}`, scope])).values()]
}
