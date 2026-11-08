import { requireCommercialRole } from '@/lib/supabase/access'
import { getCurrentUser } from '@/lib/supabase/current-user'
import { redirect } from 'next/navigation'

import { PrescriptionWorkspace } from '@/features/prescriptions/components'
import type { Tables } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import { PageContainer, PageHeader } from '@/shared/ui'

export default async function PrescriptionsPage() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  await requireCommercialRole()

  const { data: membershipData } = await supabase
    .from('organization_memberships')
    .select('organization_id, branch_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('role', ['owner', 'seller'])
  const memberships = (membershipData ?? []) as Pick<Tables<'organization_memberships'>, 'organization_id' | 'branch_id' | 'role'>[]
  const organizationIds = [...new Set(memberships.map(({ organization_id }) => organization_id))]
  const { data: branchData } = organizationIds.length
    ? await supabase.from('branches').select('id, organization_id').in('organization_id', organizationIds).eq('is_active', true)
    : { data: [] }
  const branches = (branchData ?? []) as Pick<Tables<'branches'>, 'id' | 'organization_id'>[]
  const writable = new Map<number, boolean>()
  await Promise.all(organizationIds.map(async (organizationId) => {
    const { data } = await supabase.rpc('current_user_can_operate_organization', {
      target_organization_id: organizationId,
      required_module_key: 'optical_sales',
    } as never)
    writable.set(organizationId, Boolean(data))
  }))

  const scopes = memberships.flatMap((membership) => {
    const available = membership.role === 'owner'
      ? branches.filter(({ organization_id }) => organization_id === membership.organization_id)
      : branches.filter(({ id }) => id === membership.branch_id)
    return available.map((branch) => ({
      organizationId: membership.organization_id,
      branchId: branch.id,
      canWrite: writable.get(membership.organization_id) ?? false,
    }))
  })
  const uniqueScopes = [...new Map(scopes.map((scope) => [`${scope.organizationId}:${scope.branchId}`, scope])).values()]
  const { data: customerData } = await supabase
    .from('customers')
    .select('id, organization_id, branch_id, full_name, customer_phones(phone_number)')
    .is('archived_at', null).is('commercial_account_id', null)
    .order('updated_at', { ascending: false })
    .limit(100)

  return (
    <PageContainer narrow>
      <PageHeader eyebrow="Clínica" title="Recetas" description="Originales privados y correcciones preservadas por cliente." />
      <PrescriptionWorkspace scopes={uniqueScopes} customers={(customerData ?? []) as never} />
    </PageContainer>
  )
}
