import { redirect } from 'next/navigation'

import { WholesaleWorkspace } from '@/features/wholesale/components'
import { balanceUsd, type CommercialOrderSummary } from '@/features/wholesale/order-types'
import type { AccountPrice, CatalogOption, CommercialAccount } from '@/features/wholesale/types'
import type { Tables } from '@/lib/supabase/database.types'
import { getCurrentUser } from '@/lib/supabase/current-user'
import { createClient } from '@/lib/supabase/server'
import { PageContainer, PageHeader } from '@/shared/ui'

type Item = Pick<Tables<'catalog_items'>, 'id' | 'organization_id' | 'category' | 'name' | 'sale_price' | 'currency'>
type Override = Pick<Tables<'catalog_item_overrides'>, 'organization_id' | 'catalog_item_id' | 'sale_price' | 'currency' | 'is_enabled'>

// Catalog as each organization sells it at retail: global + own items, override applied.
function catalogFor(organizationId: number, items: Item[], overrides: Override[]): CatalogOption[] {
  return items
    .filter((item) => item.organization_id === null || item.organization_id === organizationId)
    .flatMap((item) => {
      const override = overrides.find((entry) => entry.organization_id === organizationId && entry.catalog_item_id === item.id)
      if (override && !override.is_enabled) return []
      return [{ id: item.id, category: item.category, name: item.name, price: Number(override?.sale_price ?? item.sale_price), currency: override?.currency ?? item.currency }]
    })
}

export default async function WholesalePage() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { data: membershipData } = await supabase.from('organization_memberships').select('organization_id').eq('user_id', user.id).eq('role', 'owner').eq('status', 'active')
  const organizationIds = [...new Set(((membershipData ?? []) as { organization_id: number }[]).map(({ organization_id }) => organization_id))]
  if (!organizationIds.length) redirect('/dashboard')

  const [{ data: organizationData }, { data: accountData }, { data: priceData }, { data: itemData }, { data: overrideData }] = await Promise.all([
    supabase.from('organizations').select('id, name').in('id', organizationIds).order('name'),
    supabase.from('commercial_accounts').select('*').in('organization_id', organizationIds).order('name'),
    supabase.from('commercial_account_prices').select('account_id, catalog_item_id, sale_price, currency').in('organization_id', organizationIds),
    supabase.from('catalog_items').select('id, organization_id, category, name, sale_price, currency').eq('is_active', true).order('category').order('name'),
    supabase.from('catalog_item_overrides').select('organization_id, catalog_item_id, sale_price, currency, is_enabled').in('organization_id', organizationIds),
  ])
  const { data: orderData } = await supabase.rpc('list_commercial_orders')
  const debts: Record<number, number> = {}
  for (const order of (orderData ?? []) as unknown as CommercialOrderSummary[]) debts[order.accountId] = (debts[order.accountId] ?? 0) + balanceUsd(order)
  const items = (itemData ?? []) as Item[]
  const overrides = (overrideData ?? []) as Override[]
  const organizations = await Promise.all(((organizationData ?? []) as Pick<Tables<'organizations'>, 'id' | 'name'>[]).map(async (organization) => {
    const { data: canOperate } = await supabase.rpc('current_user_can_operate_organization', { target_organization_id: organization.id, required_module_key: 'optical_sales' } as never)
    return { id: organization.id, name: organization.name, canManage: Boolean(canOperate), catalog: catalogFor(organization.id, items, overrides) }
  }))

  return <PageContainer>
    <PageHeader eyebrow="Venta a ópticas" title="Ópticas minoristas" description="Registra las ópticas a las que vendes, sus condiciones de pago y sus precios." />
    <WholesaleWorkspace
      userId={user.id}
      organizations={organizations}
      initialAccounts={(accountData ?? []) as CommercialAccount[]}
      debts={debts}
      initialPrices={((priceData ?? []) as AccountPrice[]).map((price) => ({ ...price, sale_price: Number(price.sale_price) }))}
    />
  </PageContainer>
}
