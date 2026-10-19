'use client'

import { LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/shared/lib/friendly-error'
import { Alert, SegmentedControl } from '@/shared/ui'
import { formatAmount, formatShortDate } from '@/features/orders/format'

// LEN0002: aggregates only (QA-38) — counts, money per currency and member access
// dates. organizationId = null shows the whole platform with feature adoption.
type Period = '7' | '30' | '90' | 'all'

type Activity = {
  days: number | null
  counts: Record<string, number>
  activeDays: number
  lastActivityAt: string | null
  payments: { currency: string; count: number; amount: number }[]
  cupEquivalent: number
  whatsappByTemplate: { template: string; total: number; sent: number }[]
  weekly: { weekStart: string; orders: number; payments: number }[]
  adoption: { organizations: number; active: number; byKind: Record<string, number> } | null
  team: { name: string; roles: string[]; status: 'active' | 'invited'; lastSignInAt: string | null }[] | null
}

const periods: { value: Period; label: string }[] = [
  { value: '7', label: '7 días' }, { value: '30', label: '30 días' }, { value: '90', label: '90 días' }, { value: 'all', label: 'Siempre' },
]

// Flow order, so the gaps (a step nobody uses) stand out.
const features: [string, string][] = [
  ['customer', 'Clientes nuevos'], ['prescription', 'Recetas'], ['quotation', 'Cotizaciones'], ['quotation_accepted', 'Cotizaciones aceptadas'],
  ['order', 'Pedidos'], ['price_adjustment', 'Ajustes de precio'], ['payment', 'Cobros'], ['production_assigned', 'Trabajos enviados a producción'],
  ['production_received', 'Trabajos recibidos'], ['rework', 'Reprocesos'], ['order_delivered', 'Entregas'], ['cashbox_closure', 'Cierres de caja'], ['whatsapp', 'WhatsApp'],
]

const templateLabels: Record<string, string> = { order_accepted: 'Pedido confirmado', payment_received: 'Pago recibido', order_ready: 'Pedido listo', order_delivered: 'Pedido entregado' }
const roleLabels: Record<string, string> = { owner: 'Dueño', seller: 'Vendedor', lens_provider: 'Cristalero/laboratorio', mounting_provider: 'Montador' }
const weekLabel = new Intl.DateTimeFormat('es-CU', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function ActivityPanel({ organizationId }: { organizationId: number | null }) {
  const [period, setPeriod] = useState<Period>('30')
  const [activity, setActivity] = useState<Activity | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Loading = the shown figures belong to another optician or period.
  const requestKey = `${organizationId}:${period}`
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const loading = loadedKey !== requestKey

  useEffect(() => {
    let current = true
    void createClient()
      .rpc('get_organization_activity', { target_organization_id: organizationId, target_days: period === 'all' ? null : Number(period) } as never)
      .then(({ data, error: loadError }) => {
        if (!current) return
        setLoadedKey(`${organizationId}:${period}`)
        if (loadError) return setError(friendlyError(loadError, 'No pudimos cargar la actividad.'))
        setError(null)
        setActivity(data as unknown as Activity)
      })
    return () => { current = false }
  }, [organizationId, period])

  const periodDays = period === 'all' ? null : Number(period)
  const count = (kind: string) => activity?.counts[kind] ?? 0
  const quotations = count('quotation')

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Período" options={periods} value={period} onChange={setPeriod} />
        {loading ? <LoaderCircle aria-label="Cargando" size={18} className="animate-spin text-action" /> : null}
      </div>
      {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
      {activity ? <>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4">
          {activity.adoption
            ? <Figure label="Ópticas con actividad" value={`${activity.adoption.active} de ${activity.adoption.organizations}`} />
            : <Figure label="Días con actividad" value={periodDays ? `${activity.activeDays} de ${periodDays}` : `${activity.activeDays}`} />}
          <Figure label="Pedidos" value={count('order')} hint={quotations ? `${Math.round((count('quotation_accepted') / quotations) * 100)}% de cotizaciones aceptadas` : undefined} />
          <Figure label="Cobrado" value={activity.payments.length ? activity.payments.map(({ currency, amount }) => `${formatAmount(amount)} ${currency}`).join(' · ') : '—'} hint={activity.payments.some(({ currency }) => currency !== 'CUP') ? `${formatAmount(activity.cupEquivalent)} CUP equivalentes` : undefined} />
          <Figure label="Última actividad" value={activity.lastActivityAt ? formatShortDate(activity.lastActivityAt) : 'Nunca'} />
        </dl>

        <WeeklyOrders weekly={activity.weekly} />

        <section className="flex flex-col gap-2">
          <h3 className="font-display text-[15px] font-bold text-ink">Qué se usa</h3>
          <ul className="divide-y divide-line-soft rounded-card border border-line">
            {features.map(([kind, label]) => (
              <li key={kind} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className={count(kind) ? 'text-ink' : 'text-text-muted'}>{label}</span>
                <span className="flex items-baseline gap-3 tabular-nums">
                  {activity.adoption ? <span className="text-[12.5px] text-text-muted">{activity.adoption.byKind[kind] ?? 0} ópticas</span> : null}
                  <span className="font-display font-semibold text-ink">{count(kind)}</span>
                </span>
              </li>
            ))}
          </ul>
          {activity.whatsappByTemplate.length ? (
            <p className="text-[13px] text-text-muted">WhatsApp: {activity.whatsappByTemplate.map(({ template, total }) => `${templateLabels[template] ?? template} ${total}`).join(' · ')}</p>
          ) : null}
        </section>

        {activity.team ? (
          <section className="flex flex-col gap-2">
            <h3 className="font-display text-[15px] font-bold text-ink">Equipo y último acceso</h3>
            <ul className="divide-y divide-line-soft rounded-card border border-line">
              {activity.team.map((member, index) => (
                <li key={`${member.name}-${index}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold text-ink">{member.name}</span>
                    <span className="text-text-muted"> · {member.roles.map((role) => roleLabels[role] ?? role).join(', ')}{member.status === 'invited' ? ' · invitado' : ''}</span>
                  </span>
                  <span className="text-[13px] tabular-nums text-text-secondary">{member.lastSignInAt ? `Entró ${formatShortDate(member.lastSignInAt)}` : 'Nunca entró'}</span>
                </li>
              ))}
              {!activity.team.length ? <li className="px-4 py-2.5 text-sm text-text-muted">Sin miembros.</li> : null}
            </ul>
            <p className="text-[12.5px] text-text-muted">Un cristalero o montador que trabaja para varias ópticas tiene un solo último acceso.</p>
          </section>
        ) : null}
      </> : null}
    </div>
  )
}

function Figure({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-surface px-4 py-3">
      <dt className="text-[12px] text-text-muted">{label}</dt>
      <dd className="break-words font-display text-[17px] font-semibold tabular-nums text-ink">{value}</dd>
      {hint ? <dd className="text-[12px] text-text-muted">{hint}</dd> : null}
    </div>
  )
}

// Single series, so no legend: the title names it. Each bar carries its value for
// hover and screen readers; the 8 weeks always end with the current one.
function WeeklyOrders({ weekly }: { weekly: Activity['weekly'] }) {
  const max = Math.max(1, ...weekly.map(({ orders }) => orders))
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-display text-[15px] font-bold text-ink">Pedidos por semana</h3>
      <div role="list" aria-label="Pedidos por semana, últimas 8 semanas" className="flex h-28 items-end gap-0.5 border-b border-line">
        {weekly.map(({ weekStart, orders }) => {
          const label = `Semana del ${weekLabel.format(new Date(`${weekStart}T00:00:00Z`))}: ${orders} pedidos`
          return (
            <div key={weekStart} role="listitem" aria-label={label} title={label} className="group flex h-full flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-[11px] font-semibold tabular-nums text-text-secondary opacity-0 transition group-hover:opacity-100">{orders}</span>
              <span className="w-full max-w-10 rounded-t-[4px] bg-action" style={{ height: orders ? `${Math.max(4, (orders / max) * 85)}%` : '2px', opacity: orders ? 1 : 0.25 }} />
            </div>
          )
        })}
      </div>
      <div aria-hidden="true" className="flex gap-0.5 text-[11px] text-text-muted">
        {weekly.map(({ weekStart }) => <span key={weekStart} className="flex-1 text-center">{weekLabel.format(new Date(`${weekStart}T00:00:00Z`)).replace('.', '')}</span>)}
      </div>
    </section>
  )
}
