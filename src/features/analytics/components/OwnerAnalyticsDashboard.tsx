'use client'

import { RefreshCcw } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FormSelect } from '@/shared/components'
import { Alert, Button, Card, CardHeader, Field, Input, StatCard } from '@/shared/ui'
import { friendlyError } from '@/shared/lib/friendly-error'

type Option = { id: number; name: string }
type Seller = { id: string; name: string; branchId: number | null }
type Metrics = {
  orders: { total: number; accepted: number; delivered: number; withIncidents: number }
  salesCup: number; collectionsCup: number; outstandingCup: number
  salesUsd: number; collectionsUsd: number; outstandingUsd: number
  wholesaleSalesUsd?: number; wholesaleOutstandingUsd?: number
  averageDeliveryHours: number | null; cashDifferenceCup: number
  bySeller: { seller_name: string; order_count: number; sales_cup: number; sales_usd: number }[]
  providerLoads: { provider_name: string; job_type: string; active_jobs: number }[]
  topItems: { name: string; category: string; quantity: number }[]
}

const money = (value: number) => Number(value ?? 0).toLocaleString('es-CU', { maximumFractionDigits: 2 })
const jobTypeLabels: Record<string, string> = { lens: 'cristales', mounting: 'montaje' }

export function OwnerAnalyticsDashboard({ organizationId, branches, sellers, defaultFrom, defaultTo }: { organizationId: number; branches: Option[]; sellers: Seller[]; defaultFrom: string; defaultTo: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  function requestMetrics(branchId: number | null, sellerId: string | null, from: string, to: string) {
    startTransition(async () => {
      const { data, error } = await supabase.rpc('get_owner_dashboard', {
        target_organization_id: organizationId,
        target_branch_id: branchId,
        target_seller_id: sellerId,
        date_from: from,
        date_to: to,
      } as never)
      if (error) return setMessage(friendlyError(error, 'No pudimos calcular los indicadores.'))
      setMetrics(data as unknown as Metrics)
      setMessage('')
    })
  }

  useEffect(() => {
    requestMetrics(null, null, defaultFrom, defaultTo)
  // The initial query must run once for the server-provided default range.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, defaultFrom, defaultTo])

  function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    requestMetrics(
      form.get('branch') ? Number(form.get('branch')) : null,
      form.get('seller') ? String(form.get('seller')) : null,
      String(form.get('from')),
      String(form.get('to')),
    )
  }

  return <Card className="flex flex-col gap-5">
    <div className="flex flex-col gap-1">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-action">Analítica</p>
      <CardHeader title="Pulso del negocio" />
    </div>
    <form onSubmit={load} className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Field label="Sucursal"><FormSelect name="branch" ariaLabel="Sucursal" options={[{ value: '', label: 'Todas las sucursales' }, ...branches.map(x => ({ value: String(x.id), label: x.name }))]} /></Field>
      <Field label="Vendedor"><FormSelect name="seller" ariaLabel="Vendedor" options={[{ value: '', label: 'Todos los vendedores' }, ...sellers.map(x => ({ value: x.id, label: x.name }))]} /></Field>
      <Field label="Desde"><Input name="from" type="date" defaultValue={defaultFrom} /></Field>
      <Field label="Hasta"><Input name="to" type="date" defaultValue={defaultTo} /></Field>
      <Button type="submit" icon={RefreshCcw} disabled={pending}>{pending ? 'Calculando…' : 'Actualizar métricas'}</Button>
    </form>
    {metrics ? <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ventas" value={money(metrics.salesUsd)} unit="USD" hint={metrics.wholesaleSalesUsd ? `${money(metrics.wholesaleSalesUsd)} USD a ópticas` : undefined} />
        <StatCard label="Cobros" value={money(metrics.collectionsUsd)} unit="USD" tone="positive" />
        <StatCard label="Saldo pendiente" value={money(metrics.outstandingUsd)} unit="USD" tone={metrics.outstandingUsd > 0 ? 'attention' : 'default'} hint={metrics.wholesaleOutstandingUsd ? `${money(metrics.wholesaleOutstandingUsd)} USD de ópticas` : undefined} />
        <StatCard label="Pedidos" value={metrics.orders.total} hint={`${metrics.orders.withIncidents} con incidencia`} tone={metrics.orders.withIncidents ? 'danger' : 'default'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <MetricList title="Por vendedor" rows={metrics.bySeller.map(x => [x.seller_name, `${money(x.sales_usd)} USD · ${x.order_count}`])} />
        <MetricList title="Carga de proveedores" rows={metrics.providerLoads.map(x => [x.provider_name, `${x.active_jobs} · ${jobTypeLabels[x.job_type] ?? x.job_type}`])} />
        <MetricList title="Productos destacados" rows={metrics.topItems.map(x => [x.name, String(x.quantity)])} />
      </div>
      <p className="text-[13px] text-text-muted">Diferencia de caja: {money(metrics.cashDifferenceCup)} CUP · Promedio hasta entrega: {metrics.averageDeliveryHours ?? '—'} h</p>
    </> : <p className="text-sm text-text-muted">{pending ? 'Cargando indicadores…' : 'No fue posible cargar los indicadores.'}</p>}
    {message ? <Alert tone="danger" role="alert">{message}</Alert> : null}
  </Card>
}

function MetricList({ title, rows }: { title: string; rows: [string, string][] }) {
  return <div className="rounded-card border border-line p-4">
    <h3 className="font-display text-[15px] font-semibold text-ink">{title}</h3>
    <div className="mt-3 flex flex-col gap-2">
      {rows.length ? rows.map(([name, value], index) => <div key={`${name}:${index}`} className="flex justify-between gap-3 text-sm"><span className="truncate text-text">{name}</span><strong className="shrink-0 tabular-nums text-ink">{value}</strong></div>) : <p className="text-[13px] text-text-muted">Sin datos en el rango.</p>}
    </div>
  </div>
}
