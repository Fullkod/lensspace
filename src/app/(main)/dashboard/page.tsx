import { Building, Factory, Plus } from 'lucide-react'
import { redirect } from 'next/navigation'

import { PlatformAdminDashboard } from '@/features/admin/components'
import { OptometristSummary, OwnerAnalyticsDashboard } from '@/features/analytics/components'
import { MemberAccessCard, OwnerAccessCard } from '@/features/dashboard/components/AccessCards'
import { PendingInvitations, type PendingInvitation } from '@/features/dashboard/components/PendingInvitations'
import { formatAmount } from '@/features/orders/format'
import { loadPlatformOrganizations } from '@/features/admin/load-platform-organizations'
import { loadOwnedOrganizations } from '@/features/team/load-owned-organizations'
import type { Tables } from '@/lib/supabase/database.types'
import { getAccessSummary, isProviderOnly } from '@/lib/supabase/access'
import { getCurrentUser } from '@/lib/supabase/current-user'
import { createClient } from '@/lib/supabase/server'
import { ButtonLink, EmptyState, PageContainer, PageHeader, StatCard } from '@/shared/ui'
import { BUSINESS_TIME_ZONE, daysAgoIn, todayIn } from '@/shared/utils/dates'

export default async function DashboardPage() {
  const defaultTo = todayIn()
  const defaultFrom = daysAgoIn(29)
  const supabase = await createClient()
  const user = await getCurrentUser()
  const [access, { data: profile }] = await Promise.all([
    getAccessSummary(),
    user ? supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const displayName = (profile as Pick<Tables<'profiles'>, 'display_name'> | null)?.display_name ?? user?.email?.split('@')[0] ?? ''
  const greeting = `${greetingFor(new Date())}, ${displayName.split(' ')[0]}`

  const { isPlatformAdmin } = access
  if (isPlatformAdmin) {
    const organizations = await loadPlatformOrganizations(supabase)
    return (
      <PageContainer>
        <PageHeader
          variant="featured"
          eyebrow={`Plataforma LensSpace · ${todayLabel()}`}
          title={greeting}
          description="Panorama operativo y crecimiento de LensSpace."
          actions={<ButtonLink href="/organizations" variant="mint" icon={Building}>Ver organizaciones</ButtonLink>}
        />
        <PlatformAdminDashboard organizations={organizations} />
      </PageContainer>
    )
  }

  // QA-45: a provider's home is the job list; stay only to answer an invitation.
  if (isProviderOnly(access)) {
    const { data: pending } = await supabase.rpc('list_my_pending_invitations')
    if (!(pending as unknown[] | null)?.length) redirect('/production')
  }

  // QA-31: independent loads in parallel. Memberships include the owner role, so the
  // owner's enabled modules come from the same query. KPIs are aggregated server-side.
  const [ownedOrganizations, allAccess, { data: kpiData }, { data: invitationData }] = await Promise.all([
    loadOwnedOrganizations(supabase),
    loadMemberAccess(supabase),
    supabase.rpc('get_order_kpis'),
    supabase.rpc('list_my_pending_invitations'),
  ])
  const invitations = (invitationData ?? []) as unknown as PendingInvitation[]
  const memberAccess = ownedOrganizations.length ? [] : allAccess
  const ownedModules = allAccess.filter((access) => access.roles.includes('owner')).flatMap((access) => access.modules)
  const canSell = ownedModules.includes('optical_sales') || memberAccess.some((access) => access.roles.includes('seller') && access.modules.includes('optical_sales'))
  const hasCashbox = ownedModules.includes('cashbox') || memberAccess.some((access) => access.roles.includes('seller') && access.modules.includes('cashbox'))
  const isProvider = memberAccess.some((access) => access.roles.some((role) => role === 'lens_provider' || role === 'mounting_provider') && access.modules.includes('production'))
  const organizationNames = [...ownedOrganizations, ...memberAccess].map(({ name }) => name)
  const scope = organizationNames.length === 1 ? organizationNames[0] : organizationNames.length > 1 ? `${organizationNames.length} organizaciones` : 'LensSpace'

  const kpis = canSell && kpiData ? kpiData as unknown as OrderKpis : null
  const description = kpis
    ? `${plural(kpis.readyToDeliver, 'pedido pagado listo', 'pedidos pagados listos')} para entregar y ${kpis.withBalance} con saldo pendiente.`
    : isProvider ? 'Revisa y actualiza los trabajos que te asignaron.' : 'Tu actividad, accesos directos y estado operativo en un solo lugar.'

  return (
    <PageContainer>
      <PageHeader
        variant="featured"
        eyebrow={`${scope} · ${todayLabel()}`}
        title={greeting}
        description={description}
        actions={<>
          {hasCashbox ? <ButtonLink href="/cashbox" variant="inverse">Ver caja</ButtonLink> : null}
          {canSell ? <ButtonLink href="/sales" variant="mint" icon={Plus}>Nueva venta</ButtonLink> : null}
          {isProvider && !canSell ? <ButtonLink href="/production" variant="mint" icon={Factory}>Ver trabajos asignados</ButtonLink> : null}
        </>}
        stats={kpis ? <>
          <StatCard surface="ink" label="Pedidos activos" value={kpis.activeCount} />
          <StatCard surface="ink" label="Cobrado hoy" value={formatAmount(kpis.collectedToday)} unit="CUP" />
          <StatCard surface="ink" tone="positive" label="Listos para entregar" value={kpis.readyToDeliver} />
          <StatCard surface="ink" tone="attention" label="Saldo por cobrar" value={formatAmount(kpis.balanceDue)} unit="CUP" />
        </> : undefined}
      />
      <PendingInvitations invitations={invitations} />
      {ownedOrganizations.length ? (
        ownedOrganizations.map((organization) => (
          <div key={organization.id} className="flex flex-col gap-5">
            {organization.analyticsEnabled ? <OwnerAnalyticsDashboard
              organizationId={organization.id}
              branches={organization.branches}
              sellers={organization.members
                .filter((member) => member.role === 'seller' && member.status === 'active')
                .map((member) => ({ id: member.userId, name: member.displayName, branchId: member.branchId }))}
              defaultFrom={defaultFrom}
              defaultTo={defaultTo}
            /> : null}
            {organization.analyticsEnabled ? <OptometristSummary organizationId={organization.id} branches={organization.branches} /> : null}
            <OwnerAccessCard
              organizationName={organization.name}
              links={[
                { href: '/orders', label: 'Pedidos y cobros' },
                { href: '/team', label: 'Administrar equipo' },
                { href: '/catalog', label: 'Catálogo y precios' },
              ]}
            />
          </div>
        ))
      ) : memberAccess.length ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {memberAccess.map((organization) => <MemberAccessCard key={organization.id} organization={organization} links={dashboardLinks(organization.roles, organization.modules)} />)}
        </div>
      ) : (
        <EmptyState icon={Building} title="Sin organización activa" description="Tu cuenta no administra ni pertenece a una organización activa." />
      )}
    </PageContainer>
  )
}

// Cuba is the launch market; greetings and dates follow Havana time.
const TIME_ZONE = BUSINESS_TIME_ZONE

function greetingFor(date: Date) {
  const hour = Number(new Intl.DateTimeFormat('es-CU', { hour: 'numeric', hourCycle: 'h23', timeZone: TIME_ZONE }).format(date))
  return hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
}

function todayLabel() {
  const label = new Intl.DateTimeFormat('es-CU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: TIME_ZONE }).format(new Date()).replace('.', '').replace(',', '')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const plural = (count: number, singular: string, many: string) => `${count} ${count === 1 ? singular : many}`

type OrderKpis = { activeCount: number; balanceDue: number; readyToDeliver: number; withBalance: number; collectedToday: number }

async function loadMemberAccess(supabase: SupabaseServerClient) {
  const user = await getCurrentUser()
  if (!user) return []

  const { data: membershipData } = await supabase
    .from('organization_memberships')
    .select('organization_id, branch_id, role, status')
    .eq('user_id', user.id)
    .eq('status', 'active')

  const memberships = (membershipData ?? []) as Pick<
    Tables<'organization_memberships'>,
    'organization_id' | 'branch_id' | 'role' | 'status'
  >[]
  const organizationIds = [
    ...new Set(memberships.map(({ organization_id }) => organization_id)),
  ]
  if (!organizationIds.length) return []

  const [{ data: organizationData }, { data: branchData }, { data: entitlementData }] = await Promise.all([
    supabase.from('organizations').select('id, name, order_prefix, status').in('id', organizationIds),
    supabase.from('branches').select('id, organization_id, name').in('organization_id', organizationIds),
    supabase.from('organization_modules').select('organization_id, module_key, is_enabled').in('organization_id', organizationIds).eq('is_enabled', true),
  ])

  const organizations = (organizationData ?? []) as Pick<
    Tables<'organizations'>,
    'id' | 'name' | 'order_prefix' | 'status'
  >[]
  const branches = (branchData ?? []) as Pick<
    Tables<'branches'>,
    'id' | 'organization_id' | 'name'
  >[]
  const entitlements = (entitlementData ?? []) as Pick<
    Tables<'organization_modules'>,
    'organization_id' | 'module_key' | 'is_enabled'
  >[]

  return Promise.all(organizations.map(async (organization) => {
    const { data: canOperate } = await supabase.rpc(
      'current_user_can_operate_organization',
      {
        target_organization_id: organization.id,
        required_module_key: 'core',
      } as never,
    )
    const organizationMemberships = memberships.filter(
      (membership) => membership.organization_id === organization.id,
    )

    return {
      ...organization,
      canOperate: Boolean(canOperate),
      roles: organizationMemberships.map(({ role }) => role),
      branches: organizationMemberships
        .map((membership) =>
          branches.find((branch) => branch.id === membership.branch_id),
        )
        .filter((branch): branch is NonNullable<typeof branch> => Boolean(branch))
        .map(({ name }) => name),
      modules: entitlements
        .filter(
          (entitlement) => entitlement.organization_id === organization.id,
        )
        .map(({ module_key }) => module_key),
    }
  }))
}

function dashboardLinks(roles: string[], modules: string[]) {
  const links: { href: string; label: string }[] = []
  if (roles.includes('seller') && modules.includes('optical_sales')) {
    links.push({ href: '/orders', label: 'Ver pedidos' }, { href: '/customers', label: 'Buscar clientes' })
  }
  if (roles.includes('seller') && modules.includes('cashbox')) links.push({ href: '/cashbox', label: 'Mi caja' })
  if (roles.some((role) => role === 'lens_provider' || role === 'mounting_provider') && modules.includes('production')) {
    links.push({ href: '/production', label: 'Ver trabajos asignados' })
  }
  return links
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
