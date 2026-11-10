import { redirect } from 'next/navigation'

import { OptometristManager, OrderPrefixSetting, OrganizationNameSetting, OrganizationTeamManager } from '@/features/team/components'
import { loadOwnedOrganizations } from '@/features/team/load-owned-organizations'
import { CommercialOrderPermissions } from '@/features/wholesale/components'
import { createClient } from '@/lib/supabase/server'
import { PageContainer, PageHeader } from '@/shared/ui'

export default async function TeamPage() {
  const supabase = await createClient()
  const organizations = await loadOwnedOrganizations(supabase)
  if (!organizations.length) redirect('/dashboard')

  return <PageContainer>
    <PageHeader eyebrow="Administración" title="Equipo" description="Consulta los accesos e invita o administra miembros desde diálogos independientes." />
    <div className="flex flex-col gap-5">{organizations.map((organization) => <div key={organization.id} className="flex flex-col gap-5">
      <OrganizationTeamManager organizationId={organization.id} organizationName={organization.name} branches={organization.branches} accounts={organization.accounts} members={organization.members} canManage={organization.canManage} />
      <OptometristManager organizationId={organization.id} organizationName={organization.name} canManage={organization.canManage} />
      <CommercialOrderPermissions organizationId={organization.id} canManage={organization.canManage} />
      <OrganizationNameSetting organizationId={organization.id} organizationName={organization.name} canManage={organization.canManage} />
      <OrderPrefixSetting organizationId={organization.id} organizationName={organization.name} orderPrefix={organization.orderPrefix} locked={organization.prefixLocked} canManage={organization.canManage} />
    </div>)}</div>
  </PageContainer>
}
