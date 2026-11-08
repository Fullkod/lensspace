import { redirect } from 'next/navigation'

import { CommercialOrdersWorkspace } from '@/features/wholesale/components'
import { loadCommercialScopes } from '@/features/wholesale/load-scopes'
import type { CommercialOrderSummary } from '@/features/wholesale/order-types'
import { requireCommercialRole } from '@/lib/supabase/access'
import { getCurrentUser } from '@/lib/supabase/current-user'
import { createClient } from '@/lib/supabase/server'
import { PageContainer, PageHeader } from '@/shared/ui'

export default async function WholesaleOrdersPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  await requireCommercialRole()
  const query = await searchParams
  const requestedAccount = Number(query.optica) || null

  const scopes = await loadCommercialScopes(supabase, user.id)
  const organizationIds = [...new Set(scopes.map(({ organizationId }) => organizationId))]
  const [{ data: orderData }, ...accountLists] = await Promise.all([
    supabase.rpc('list_commercial_orders'),
    ...organizationIds.map((id) => supabase.rpc('list_commercial_accounts_for_orders', { target_organization_id: id } as never)),
  ])
  const accounts = Object.fromEntries(organizationIds.map((id, index) => [id, (accountLists[index]?.data ?? []) as unknown as { id: number; name: string }[]]))

  return <PageContainer>
    <PageHeader eyebrow="Venta a ópticas" title="Pedidos a ópticas" description="Pedidos de ópticas minoristas que se van completando en varios días, se mandan a fabricar y se entregan con o sin pago." />
    <CommercialOrdersWorkspace orders={(orderData ?? []) as unknown as CommercialOrderSummary[]} scopes={scopes} accounts={accounts} initialAccountId={requestedAccount} startCollect={query.cobrar === '1'} />
  </PageContainer>
}
