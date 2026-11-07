'use client'

import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'

import { createClient } from '@/lib/supabase/client'
import { FormSelect } from '@/shared/components'
import { friendlyError } from '@/shared/lib/friendly-error'
import { Alert, Button, Card, CardHeader, Field, Input, SegmentedControl } from '@/shared/ui'
import { todayIn } from '@/shared/utils/dates'

type Row = { optometristId: number; name: string; prescriptions: number; customers: number; orders: number }
type Period = 'today' | 'week' | 'month' | 'custom'
type Option = { id: number; name: string }

const periods: { value: Period; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'custom', label: 'Rango' },
]

// Mobile: the name takes its own line and the three figures sit below it.
const rowGrid = 'grid grid-cols-3 gap-x-2 gap-y-1 sm:grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)]'
const nameCell = 'col-span-3 truncate sm:col-span-1'
const numberCell = 'sm:text-right'

// Business-day ranges: the week starts on Monday, the month on day 1.
function rangeFor(period: Exclude<Period, 'custom'>) {
  const today = todayIn()
  if (period === 'today') return { from: today, to: today }
  if (period === 'month') return { from: `${today.slice(0, 8)}01`, to: today }
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return { from: date.toISOString().slice(0, 10), to: today }
}

// LEN0008: prescriptions, customers and orders per optometrist, including idle ones.
export function OptometristSummary({ organizationId, branches }: { organizationId: number; branches: Option[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [period, setPeriod] = useState<Period>('month')
  const [branchId, setBranchId] = useState('')
  const [custom, setCustom] = useState(() => rangeFor('month'))
  const [rows, setRows] = useState<Row[] | null>(null)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  const load = useCallback((range: { from: string; to: string }, branch: string) => {
    startTransition(async () => {
      const { data, error } = await supabase.rpc('get_optometrist_summary', {
        target_organization_id: organizationId,
        target_branch_id: branch ? Number(branch) : null,
        date_from: range.from,
        date_to: range.to,
      } as never)
      if (error) return setMessage(friendlyError(error, 'No pudimos calcular el resumen por optometrista.'))
      setRows(data as unknown as Row[])
      setMessage('')
    })
  }, [organizationId, supabase])

  useEffect(() => {
    if (period !== 'custom') load(rangeFor(period), branchId)
  }, [branchId, load, period])

  const totals = (rows ?? []).reduce((sum, row) => ({ prescriptions: sum.prescriptions + row.prescriptions, customers: sum.customers + row.customers, orders: sum.orders + row.orders }), { prescriptions: 0, customers: 0, orders: 0 })

  return <Card className="flex flex-col gap-5">
    <div className="flex flex-col gap-1">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-action">Analítica</p>
      <CardHeader title="Por optometrista" />
      <p className="text-[13px] text-text-muted">Cada receta cuenta una vez, para el optometrista que la firmó y en la fecha de la receta. Los pedidos cuentan el día en que se crearon.</p>
    </div>
    <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <SegmentedControl label="Periodo" options={periods} value={period} onChange={setPeriod} className="self-start" />
      {branches.length > 1 ? <Field label="Sucursal" className="md:w-56"><FormSelect name="optometristBranch" ariaLabel="Sucursal" value={branchId} onValueChange={setBranchId} options={[{ value: '', label: 'Todas las sucursales' }, ...branches.map((branch) => ({ value: String(branch.id), label: branch.name }))]} /></Field> : null}
    </div>
    {period === 'custom' ? <div className="grid items-end gap-3 sm:grid-cols-3">
      <Field label="Desde"><Input type="date" value={custom.from} max={custom.to} onChange={(event) => setCustom({ ...custom, from: event.target.value })} /></Field>
      <Field label="Hasta"><Input type="date" value={custom.to} min={custom.from} onChange={(event) => setCustom({ ...custom, to: event.target.value })} /></Field>
      <Button icon={Search} disabled={pending || !custom.from || !custom.to} onClick={() => load(custom, branchId)}>{pending ? 'Calculando…' : 'Consultar'}</Button>
    </div> : null}

    {rows === null ? <p className="text-sm text-text-muted">{pending ? 'Cargando resumen…' : 'Elige un periodo para ver el resumen.'}</p>
      : rows.length === 0 ? <p className="text-sm text-text-muted">Aún no hay optometristas. Se agregan solos al guardar una receta con el nombre del médico u optometrista.</p>
      : <div className="overflow-hidden rounded-card border border-line">
        <div className={`${rowGrid} border-b border-line-soft bg-line-soft/40 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-text-muted`}>
          <span className="hidden sm:block">Optometrista</span><span className={numberCell}>Recetas</span><span className={numberCell}>Clientes</span><span className={numberCell}>Pedidos</span>
        </div>
        {rows.map((row) => <div key={row.optometristId} className={`${rowGrid} border-b border-line-soft px-4 py-3 text-sm last:border-b-0`}>
          <span className={`${nameCell} font-semibold text-ink`}>{row.name}</span>
          {[row.prescriptions, row.customers, row.orders].map((value, index) => <span key={index} className={`${numberCell} tabular-nums ${value ? 'font-display font-bold text-ink' : 'text-text-muted'}`}>{value}</span>)}
        </div>)}
        <div className={`${rowGrid} bg-line-soft/40 px-4 py-2.5 text-sm`}>
          <span className={`${nameCell} font-semibold text-text`}>Total</span>
          {[totals.prescriptions, totals.customers, totals.orders].map((value, index) => <span key={index} className={`${numberCell} font-display font-bold tabular-nums text-ink`}>{value}</span>)}
        </div>
      </div>}
    {message ? <Alert tone="danger" role="alert">{message}</Alert> : null}
  </Card>
}
