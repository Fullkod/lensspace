import { redirect } from 'next/navigation'
import { ProductionWorkspace, type AssignmentOrder, type ProductionJob, type Provider } from '@/features/production/components'
import { getAccessSummary, isAccountUserOnly } from '@/lib/supabase/access'
import { getCurrentUser } from '@/lib/supabase/current-user'
import { createClient } from '@/lib/supabase/server'
import { PageContainer } from '@/shared/ui'

export default async function ProductionPage() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (isAccountUserOnly(await getAccessSummary())) redirect('/account-jobs')
  const [{ data: jobData }, { data: currentMembershipData }] = await Promise.all([
    supabase.rpc('list_accessible_production_jobs'),
    supabase.from('organization_memberships').select('organization_id, role').eq('user_id', user.id).eq('status', 'active'),
  ])
  const currentMemberships = (currentMembershipData ?? []) as { organization_id: number; role: string }[]
  // Owners and sellers can take the work themselves (in-house workshop or a one-person shop).
  const inHouseOrganizationIds = [...new Set(currentMemberships.filter(({ role }) => role === 'owner' || role === 'seller').map(({ organization_id }) => organization_id))]
  const rawJobs = (jobData ?? []) as unknown as ProductionJob[]
  // QA-32: providers only need their jobs. Optical actors load the orders they can
  // still assign plus the ones behind listed jobs (customer names), not all history.
  const jobOrderIds = [...new Set(rawJobs.map((job) => job.orderId))]
  const [{ data: orderData }, { data: membershipData }] = inHouseOrganizationIds.length
    ? await Promise.all([
        supabase.from('orders').select('id, organization_id, order_number, customer_id, commercial_status, customers(full_name), order_lines(id, line_number, patient:customers(full_name))')
          .or(jobOrderIds.length ? `commercial_status.eq.accepted,id.in.(${jobOrderIds.join(',')})` : 'commercial_status.eq.accepted')
          .order('created_at', { ascending: false }),
        supabase.from('organization_memberships').select('organization_id, user_id, role').in('organization_id', inHouseOrganizationIds).in('role', ['lens_provider', 'mounting_provider']).eq('status', 'active'),
      ])
    : [{ data: [] }, { data: [] }]
  const memberships = (membershipData ?? []) as { organization_id: number; user_id: string; role: 'lens_provider' | 'mounting_provider' }[]
  const providerIds = [...new Set([...memberships.map((membership) => membership.user_id), ...(inHouseOrganizationIds.length ? [user.id] : [])])]
  const { data: profileData } = providerIds.length ? await supabase.from('profiles').select('user_id, display_name').in('user_id', providerIds) : { data: [] }
  const profiles = (profileData ?? []) as { user_id: string; display_name: string }[]
  const ownName = profiles.find((profile) => profile.user_id === user.id)?.display_name ?? 'Yo'
  const providers: Provider[] = [
    ...inHouseOrganizationIds.map((organizationId) => ({ id: user.id, organizationId, role: 'in_house' as const, name: `${ownName} (taller propio)` })),
    ...memberships
      .filter((membership) => membership.user_id !== user.id || !inHouseOrganizationIds.includes(membership.organization_id))
      .map((membership) => ({ id: membership.user_id, organizationId: membership.organization_id, role: membership.role, name: profiles.find((profile) => profile.user_id === membership.user_id)?.display_name ?? 'Proveedor' })),
  ]
  const orderRows = (orderData ?? []) as unknown as { id: number; organization_id: number; order_number: string; customer_id: number; commercial_status: string; customers: { full_name: string } | null; order_lines: { id: number; line_number: number; patient: { full_name: string } | null }[] | null }[]
  // Only orders that can still be produced are offered for assignment (QA-13), one
  // entry per pair (LEN0006): a family order is assigned pair by pair here.
  const orders: AssignmentOrder[] = orderRows.filter((order) => order.commercial_status === 'accepted').flatMap((order) => {
    const lines = [...(order.order_lines ?? [])].sort((a, b) => a.line_number - b.line_number)
    return lines.map((line) => ({ id: order.id, lineId: line.id, lineNumber: line.line_number, lineCount: lines.length, patientName: line.patient?.full_name ?? null, organizationId: order.organization_id, orderNumber: order.order_number, customerName: order.customers?.full_name ?? null }))
  })
  const jobs = rawJobs.map((job) => ({ ...job, customerName: orderRows.find((order) => order.id === job.orderId)?.customers?.full_name ?? null }))
  const canAssignProduction = inHouseOrganizationIds.length > 0
  return <PageContainer><ProductionWorkspace initialJobs={jobs} orders={orders} providers={providers} currentUserId={user.id} canAssignProduction={canAssignProduction} /></PageContainer>
}
