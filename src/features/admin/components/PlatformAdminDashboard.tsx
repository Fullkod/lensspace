import { Building } from 'lucide-react'

import { ButtonLink, Card, CardHeader, EmptyState, ListItem, StatCard } from '@/shared/ui'
import { formatBusinessDate } from '@/shared/utils/dates'

import { ActivityPanel } from './ActivityPanel'
import type { PlatformOrganization } from './PlatformAdminWorkspace'

export function PlatformAdminDashboard({ organizations }: { organizations: PlatformOrganization[] }) {
  const total = organizations.length
  const active = organizations.filter(({ status }) => status === 'active').length
  const trials = organizations.filter(({ subscription }) => subscription?.status === 'trial').length
  const preparing = organizations.filter(({ subscription }) => subscription?.status === 'pending').length
  const customers = organizations.reduce((sum, item) => sum + (item.usage?.customers ?? 0), 0)
  const orders = organizations.reduce((sum, item) => sum + (item.usage?.orders ?? 0), 0)
  const members = organizations.reduce((sum, item) => sum + (item.usage?.members ?? 0), 0)
  const openJobs = organizations.reduce((sum, item) => sum + (item.usage?.openProductionJobs ?? 0), 0)
  const metrics: [string, number, string][] = [
    ['Organizaciones', total, `${active} activas`],
    ['Clientes', customers, 'en toda la plataforma'],
    ['Pedidos', orders, 'históricos'],
    ['Usuarios', members, 'miembros activos'],
    ['Producción abierta', openJobs, 'trabajos en curso'],
    ['En prueba', trials, `${preparing} en preparación`],
  ]
  // The list promises the most recent activity, not the newest organizations.
  const recent = [...organizations].sort((left, right) => (right.usage?.lastActivityAt ?? '').localeCompare(left.usage?.lastActivityAt ?? '')).slice(0, 6)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(([label, value, hint]) => <StatCard key={label} label={label} value={value} hint={hint} />)}
      </div>
      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div className="flex flex-col gap-1">
            <CardHeader title="Actividad de organizaciones" />
            <p className="text-[13px] text-text-muted">Las ópticas con actividad más reciente.</p>
          </div>
          <ButtonLink href="/organizations" variant="secondary" size="sm">Gestionar organizaciones</ButtonLink>
        </div>
        {recent.map((organization, index) => (
          <ListItem
            key={organization.id}
            avatarName={organization.name}
            title={organization.name}
            meta={`${organization.order_prefix} · ${organization.owners.map(({ display_name }) => display_name).join(', ') || 'Sin propietario'}`}
            trailing={<span className="font-display text-[15px] font-semibold tabular-nums text-ink">{organization.usage?.orders ?? 0} pedidos</span>}
            badge={<span className="text-[12px] text-text-muted">{organization.usage?.lastActivityAt ? formatBusinessDate(organization.usage.lastActivityAt) : 'Sin actividad'}</span>}
            last={index === recent.length - 1}
          />
        ))}
        {!organizations.length ? <div className="p-5"><EmptyState icon={Building} title="Aún no hay organizaciones" description="Créala desde el área de organizaciones." /></div> : null}
      </Card>
      <Card>
        <div className="mb-4 flex flex-col gap-1">
          <CardHeader title="Uso del producto" />
          <p className="text-[13px] text-text-muted">Qué partes de LensSpace usan las ópticas y cuántas las usan. Solo cifras: nunca datos de clientes.</p>
        </div>
        <ActivityPanel organizationId={null} />
      </Card>
    </div>
  )
}
