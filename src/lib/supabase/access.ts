import { redirect } from 'next/navigation'
import { cache } from 'react'

import { getCurrentUser } from './current-user'
import { createClient } from './server'

export type AccessSummary = { isPlatformAdmin: boolean; roles: string[]; memberships: { organization_id: number; role: string }[] }

const commercialRoles = ['owner', 'seller']

// Shared by the (main) layout and its pages: `cache` runs these two queries once per
// request no matter how many server components ask.
export const getAccessSummary = cache(async (): Promise<AccessSummary> => {
  const user = await getCurrentUser()
  if (!user) return { isPlatformAdmin: false, roles: [], memberships: [] }
  const supabase = await createClient()
  const [{ data: isPlatformAdmin }, { data: memberships }] = await Promise.all([
    supabase.rpc('current_user_is_platform_admin'),
    supabase.from('organization_memberships').select('organization_id, role').eq('user_id', user.id).eq('status', 'active'),
  ])
  const rows = (memberships ?? []) as AccessSummary['memberships']
  return { isPlatformAdmin: Boolean(isPlatformAdmin), roles: [...new Set(rows.map(({ role }) => role))], memberships: rows }
})

export const isProviderOnly = ({ isPlatformAdmin, roles }: AccessSummary) =>
  !isPlatformAdmin && roles.length > 0 && !roles.some((role) => commercialRoles.includes(role))

export const isAccountUserOnly = ({ isPlatformAdmin, roles }: AccessSummary) =>
  !isPlatformAdmin && roles.length > 0 && roles.every((role) => role === 'account_user')

// QA-46: providers never see commercial pages (RLS already hides the rows; this
// avoids misleading empty states and CTAs such as 'Nueva venta').
export async function requireCommercialRole() {
  const access = await getAccessSummary()
  if (isAccountUserOnly(access)) redirect('/account-jobs')
  if (isProviderOnly(access)) redirect('/production')
}
