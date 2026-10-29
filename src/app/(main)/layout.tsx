import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus } from 'lucide-react'

import type { Tables } from '@/lib/supabase/database.types'
import { getAccessSummary } from '@/lib/supabase/access'
import { getCurrentUser } from '@/lib/supabase/current-user'
import { createClient } from '@/lib/supabase/server'
import { FullkodCredit, InstallAppButton, LensSpaceLogo, MainNavigation, MobileSidebar, OfflineBanner, RefreshOnFocus, SidebarAccount, SubscriptionBanner, type ShellIdentity, type SubscriptionNotice } from '@/shared/components'

const commercialHrefs = ['/prescriptions', '/catalog', '/orders', '/sales', '/customers']
const roleLabels: Record<string, string> = {
  owner: 'Dueño',
  seller: 'Vendedor',
  lens_provider: 'Cristalero/laboratorio',
  mounting_provider: 'Montador',
}
const rolePriority = ['owner', 'seller', 'lens_provider', 'mounting_provider']

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>
}
async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { allowedHrefs, counts, identity, notices } = await loadShell(supabase, user.id, user.email ?? 'Usuario')
  // QA-40: no 'Nueva venta' when every organization of the user is read-only.
  const canCreateSale = allowedHrefs.includes('/sales') && (!notices.length || notices.some((notice) => notice.canOperate))

  return (
    <div className="min-h-screen bg-canvas md:flex">
      <aside className="hidden w-[260px] shrink-0 flex-col overflow-y-auto bg-ink px-3.5 pb-[18px] pt-[22px] md:sticky md:top-0 md:flex md:h-screen">
        <div className="px-1.5">
          <LensSpaceLogo compact inverse subtitle={identity.organizationName} />
        </div>
        <MainNavigation allowedHrefs={allowedHrefs} counts={counts} canCreateSale={canCreateSale} />
        <div className="mt-auto space-y-2.5 pt-[22px]">
          <InstallAppButton className="flex min-h-11 w-full items-center gap-2.5 rounded-control border border-on-ink-stroke px-3 text-sm font-semibold text-on-ink-soft transition hover:bg-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint" />
          <SidebarAccount identity={identity} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex items-center justify-between bg-ink px-4 py-3 md:hidden">
          <LensSpaceLogo compact inverse />
          <div className="flex items-center gap-2">
            {canCreateSale ? (
              <Link
                href="/sales"
                aria-label="Crear nueva venta"
                title="Nueva venta"
                className="grid size-11 place-items-center rounded-control bg-mint text-ink transition hover:bg-mint-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-line-focus"
              >
                <Plus aria-hidden="true" size={20} strokeWidth={2.5} />
              </Link>
            ) : null}
            <MobileSidebar allowedHrefs={allowedHrefs} counts={counts} identity={identity} canCreateSale={canCreateSale} />
          </div>
        </header>
        <OfflineBanner />
        <SubscriptionBanner notices={notices} />
        <RefreshOnFocus />
        <main>{children}</main>
        <div className="flex justify-end px-4 pb-6 pt-2 md:px-8">
          <FullkodCredit />
        </div>
      </div>
    </div>
  )
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type NavigationCounters = { ordersWithBalance: number; activeProductionJobs: number }

async function loadShell(supabase: SupabaseServerClient, userId: string, email: string): Promise<{ allowedHrefs: string[]; counts: Record<string, number>; identity: ShellIdentity; notices: SubscriptionNotice[] }> {
  // Counters run in the same parallel batch (one light RLS-scoped query, ~5 ms).
  const [{ isPlatformAdmin, memberships }, { data: profile }, { data: counterData }, { data: noticeData }] = await Promise.all([
    getAccessSummary(),
    supabase.from('profiles').select('display_name, phone').eq('user_id', userId).maybeSingle(),
    supabase.rpc('get_navigation_counters'),
    supabase.rpc('get_my_subscription_notices'),
  ])
  const notices = (noticeData ?? []) as unknown as SubscriptionNotice[]
  const counters = counterData as unknown as NavigationCounters | null
  const counts = { '/orders': Number(counters?.ordersWithBalance ?? 0), '/production': Number(counters?.activeProductionJobs ?? 0) }
  const profileRow = profile as Pick<Tables<'profiles'>, 'display_name' | 'phone'> | null
  const displayName = profileRow?.display_name ?? email.split('@')[0]
  const account = { userId, displayName, phone: profileRow?.phone ?? null }

  if (isPlatformAdmin) {
    return {
      allowedHrefs: ['/dashboard', '/organizations', '/errors', '/catalog', '/manual'],
      counts: {},
      identity: { ...account, roleLabel: 'Administración de plataforma', organizationName: 'Plataforma LensSpace' },
      notices: [],
    }
  }

  const organizationIds = [...new Set(memberships.map(({ organization_id }) => organization_id))]
  const mainRole = rolePriority.find((role) => memberships.some((membership) => membership.role === role))
  const identity: ShellIdentity = { ...account, roleLabel: mainRole ? roleLabels[mainRole] : 'Sin acceso activo', organizationName: 'Gestión óptica' }
  if (!organizationIds.length) return { allowedHrefs: ['/dashboard', '/manual'], counts: {}, identity, notices }

  const [{ data: moduleData }, { data: organizationData }] = await Promise.all([
    supabase.from('organization_modules').select('organization_id, module_key').in('organization_id', organizationIds).eq('is_enabled', true),
    supabase.from('organizations').select('id, name').in('id', organizationIds),
  ])
  const organizations = (organizationData ?? []) as Pick<Tables<'organizations'>, 'id' | 'name'>[]
  identity.organizationName = organizations.length === 1 ? organizations[0].name : organizations.length > 1 ? `${organizations.length} organizaciones` : identity.organizationName

  const modules = (moduleData ?? []) as Pick<
    Tables<'organization_modules'>,
    'organization_id' | 'module_key'
  >[]
  const hasAccess = (roles: string[], moduleKey: string) =>
    memberships.some((membership) =>
      roles.includes(membership.role) &&
      modules.some((module) =>
        module.organization_id === membership.organization_id && module.module_key === moduleKey,
      ),
    )

  // QA-64: every role reads the manual.
  const allowed = ['/dashboard', '/manual']
  if (memberships.some((membership) => membership.role === 'owner')) allowed.push('/team')
  if (hasAccess(['owner', 'seller'], 'optical_sales')) allowed.push(...commercialHrefs)
  if (hasAccess(['owner', 'seller'], 'cashbox')) allowed.push('/cashbox')
  if (hasAccess(['owner', 'seller', 'lens_provider', 'mounting_provider'], 'production')) {
    allowed.push('/production')
  }

  return { allowedHrefs: allowed, counts, identity, notices }
}
