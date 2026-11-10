import { redirect } from 'next/navigation'

import { CatalogWorkspace } from '@/features/catalog/components'
import type { Tables } from '@/lib/supabase/database.types'
import { requireCommercialRole } from '@/lib/supabase/access'
import { getCurrentUser } from '@/lib/supabase/current-user'
import { createClient } from '@/lib/supabase/server'
import { PageContainer, PageHeader } from '@/shared/ui'

export default async function CatalogPage() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  await requireCommercialRole()
  const { data: isPlatformAdmin } = await supabase.rpc('current_user_is_platform_admin')

  const { data: membershipData } = isPlatformAdmin
    ? { data: [] }
    : await supabase
        .from('organization_memberships')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .in('role', ['owner', 'seller'])
  const memberships = (membershipData ?? []) as Pick<Tables<'organization_memberships'>, 'organization_id' | 'role'>[]
  const organizationIds = [...new Set(memberships.map(({ organization_id }) => organization_id))]
  const { data: organizationData } = organizationIds.length
    ? await supabase.from('organizations').select('id, name, usd_to_cup_rate').in('id', organizationIds)
    : { data: [] }
  const organizations = (organizationData ?? []) as Pick<Tables<'organizations'>, 'id' | 'name' | 'usd_to_cup_rate'>[]
  const access = await Promise.all(organizations.map(async (organization) => {
    const { data: canCalculate } = await supabase.rpc('current_user_can_operate_organization', {
      target_organization_id: organization.id,
      required_module_key: 'optical_sales',
    } as never)
    return {
      id: organization.id,
      name: organization.name,
      usdToCupRate: organization.usd_to_cup_rate === null ? null : Number(organization.usd_to_cup_rate),
      canManage: memberships.some(({ organization_id, role }) => organization_id === organization.id && role === 'owner') && Boolean(canCalculate),
      canCalculate: Boolean(canCalculate),
    }
  }))

  const itemsQuery = supabase.from('catalog_items').select('*').eq('sales_channel', 'retail').order('category').order('name')
  const rulesQuery = supabase.from('graduation_rules').select('*').eq('is_active', true).order('name')
  const [{ data: items }, { data: overrides }, { data: rules }, { data: revisions }] = await Promise.all([
    isPlatformAdmin ? itemsQuery.is('organization_id', null) : itemsQuery,
    isPlatformAdmin ? Promise.resolve({ data: [] }) : supabase.from('catalog_item_overrides').select('*'),
    isPlatformAdmin ? rulesQuery.is('organization_id', null) : rulesQuery,
    isPlatformAdmin ? Promise.resolve({ data: [] }) : supabase.from('prescription_revisions').select('id, organization_id, prescription_id, revision_number, prescription_date').order('created_at', { ascending: false }).limit(30),
  ])
  const prescriptionRevisions = (revisions ?? []) as unknown as Pick<
    Tables<'prescription_revisions'>,
    'id' | 'organization_id' | 'prescription_id' | 'revision_number' | 'prescription_date'
  >[]

  return (
    <PageContainer>
      <PageHeader eyebrow={isPlatformAdmin ? 'Administración de plataforma' : 'Ventas ópticas'} title={isPlatformAdmin ? 'Catálogo base' : 'Catálogo y precios'} description={isPlatformAdmin ? 'Mantén los artículos globales disponibles para las organizaciones.' : 'Configura precios por organización y simula combinaciones sin perder la moneda de origen.'} />
      <CatalogWorkspace
        isPlatformAdmin={Boolean(isPlatformAdmin)}
        currentUserId={user.id}
        organizations={access}
        initialItems={(items ?? []) as Tables<'catalog_items'>[]}
        initialOverrides={(overrides ?? []) as Tables<'catalog_item_overrides'>[]}
        rules={(rules ?? []) as Tables<'graduation_rules'>[]}
        prescriptions={prescriptionRevisions.map((revision) => ({ id: revision.id, organizationId: revision.organization_id, label: `Receta #${revision.prescription_id} · rev. ${revision.revision_number} · ${revision.prescription_date}` }))}
      />
    </PageContainer>
  )
}
