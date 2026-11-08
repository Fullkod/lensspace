import { notFound, redirect } from 'next/navigation'

import { CommercialOrderDetail } from '@/features/wholesale/components'
import type { CommercialOrder } from '@/features/wholesale/order-types'
import { requireCommercialRole } from '@/lib/supabase/access'
import { getCurrentUser } from '@/lib/supabase/current-user'
import { createClient } from '@/lib/supabase/server'
import { PageContainer } from '@/shared/ui'

type PriceListRow = { id: number; category: string; name: string; price: number; currency: string }

export default async function WholesaleOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const orderId = Number((await params).id)
  if (!Number.isSafeInteger(orderId) || orderId <= 0) notFound()
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  await requireCommercialRole()

  const { data: orderData, error } = await supabase.rpc('get_commercial_order', { target_order_id: orderId } as never)
  if (error || !orderData) notFound()
  const order = orderData as unknown as CommercialOrder
  const [{ data: priceData }, { data: ownerData }] = await Promise.all([
    order.status === 'open' ? supabase.rpc('get_commercial_price_list', { target_order_id: orderId } as never) : Promise.resolve({ data: [] }),
    supabase.from('organization_memberships').select('id').eq('user_id', user.id).eq('organization_id', order.organizationId).eq('role', 'owner').eq('status', 'active').maybeSingle(),
  ])
  const items = ((priceData ?? []) as unknown as PriceListRow[]).map((row) => ({ id: row.id, organizationId: order.organizationId, category: row.category, name: row.name, price: Number(row.price), currency: row.currency }))

  return <PageContainer>
    <CommercialOrderDetail order={order} items={items} canApproveLargeDiscount={Boolean(ownerData)}
      scope={{ id: order.organizationId, name: order.organizationName, branchId: order.branchId, branchName: order.branchName, canOperate: order.canWork }} />
  </PageContainer>
}
