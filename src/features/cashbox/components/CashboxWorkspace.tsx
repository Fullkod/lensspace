'use client'

import { ArrowLeft, Lock, Wallet } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState, useTransition } from 'react'
import { countWaitingOfflineSales } from '@/features/offline'
import { createClient } from '@/lib/supabase/client'
import { FilterPanel, FormSelect } from '@/shared/components'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, ListItem, PageHeader, StatCard, Toast, cx } from '@/shared/ui'
import { friendlyError } from '@/shared/lib/friendly-error'
import { useServerState } from '@/shared/hooks/use-server-state'

type Closure = { id: number; type: 'primary' | 'complementary'; sequenceNumber: number; expectedAmount: number; declaredAmount: number; differenceAmount: number; closedAt: string }
export type Cashbox = { id: number; branchName: string; sellerId: string; sellerName: string; businessDate: string; currency: 'CUP' | 'USD'; receivedAmount: number; paymentCount: number; pendingPostCloseAmount: number; primaryClosed: boolean; closedExpectedAmount: number; closedDeclaredAmount: number; closedDifferenceAmount: number; closures: Closure[] }
const money = (value: number, currency: string) => `${Number(value).toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
const amount = (value: number) => Number(value).toLocaleString('es-CU', { maximumFractionDigits: 2 })

export function CashboxWorkspace({ initialCashboxes, currentUserId }: { initialCashboxes: Cashbox[]; currentUserId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [cashboxes, setCashboxes] = useServerState(initialCashboxes)
  const [selectedId, setSelectedId] = useState(initialCashboxes[0]?.id ?? 0)
  // Mobile shows one pane at a time; desktop (xl) shows list and detail side by side.
  const [detailOpen, setDetailOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [toast, setToast] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [sellerFilter, setSellerFilter] = useState('')
  const [pending, startTransition] = useTransition()
  // LEN0011: sales made offline on this phone and not uploaded yet would add payments to
  // a day after its closure; warn once before closing (they still land as post-close).
  const [waitingOffline, setWaitingOffline] = useState(0)
  const [offlineAcknowledged, setOfflineAcknowledged] = useState(false)
  useEffect(() => {
    if ('indexedDB' in window) countWaitingOfflineSales(currentUserId).then(setWaitingOffline, () => undefined)
  }, [currentUserId])
  const selected = cashboxes.find((cashbox) => cashbox.id === selectedId) ?? null
  const isOwnCashbox = selected?.sellerId === currentUserId
  const visibleCashboxes = cashboxes.filter((cashbox) => (!dateFilter || cashbox.businessDate === dateFilter) && (!branchFilter || cashbox.branchName === branchFilter) && (!sellerFilter || cashbox.sellerId === sellerFilter))
  const branches = [...new Set(cashboxes.map((cashbox) => cashbox.branchName))]
  const sellers = [...new Map(cashboxes.map((cashbox) => [cashbox.sellerId, cashbox.sellerName])).entries()]
  const activeFilterCount = Number(Boolean(dateFilter)) + Number(Boolean(branchFilter)) + Number(Boolean(sellerFilter))
  const clearFilters = () => { setDateFilter(''); setBranchFilter(''); setSellerFilter('') }
  const totalBy = (currency: Cashbox['currency']) => visibleCashboxes.filter((cashbox) => cashbox.currency === currency).reduce((sum, cashbox) => sum + Number(cashbox.receivedAmount), 0)
  const openCount = visibleCashboxes.filter((cashbox) => !cashbox.primaryClosed).length
  const differenceCount = visibleCashboxes.filter((cashbox) => Number(cashbox.closedDifferenceAmount) !== 0).length

  function closeCashbox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    const closureType = selected.primaryClosed ? 'complementary' : 'primary'
    if (waitingOffline && !offlineAcknowledged) {
      setOfflineAcknowledged(true)
      return setMessage(`${waitingOffline === 1 ? 'Hay 1 venta hecha sin conexión' : `Hay ${waitingOffline} ventas hechas sin conexión`} en este teléfono que aún no subió. Si cierras ahora, sus cobros entrarán después como posteriores al cierre. Espera a que suban o pulsa cerrar otra vez para continuar.`)
    }
    setMessage('')
    startTransition(async () => {
      const { error } = await supabase.rpc('close_cashbox', { target_cashbox_id: selected.id, closure_type: closureType, declared_amount: Number(form.get('declaredAmount')) } as never)
      if (error) return setMessage(friendlyError(error, 'No pudimos cerrar la caja.'))
      const { data, error: refreshError } = await supabase.rpc('list_accessible_cashboxes', { target_branch_id: null, target_business_date: null, target_seller_id: null } as never)
      if (refreshError) return setMessage(friendlyError(refreshError, 'El cierre se guardó, pero no pudimos actualizar la lista. Recarga cuando vuelva la señal.'))
      setCashboxes(data as unknown as Cashbox[])
      setToast(closureType === 'primary' ? 'Cierre principal registrado.' : 'Cierre complementario registrado.')
    })
  }

  const header = (
    <PageHeader
      eyebrow="Control de efectivo"
      title="Caja y cierres"
      description="Revisa cobros por vendedor, sucursal y moneda sin perder los movimientos posteriores al cierre."
      stats={cashboxes.length ? <>
        <StatCard surface="ink" label="Cajas abiertas" value={openCount} />
        <StatCard surface="ink" label="Cobrado en CUP" value={amount(totalBy('CUP'))} unit="CUP" />
        <StatCard surface="ink" label="Cobrado en USD" value={amount(totalBy('USD'))} unit="USD" />
        <StatCard surface="ink" tone={differenceCount ? 'attention' : 'positive'} label="Cierres con diferencia" value={differenceCount} />
      </> : undefined}
    />
  )

  if (!cashboxes.length) return <div className="flex flex-col gap-5">{header}<EmptyState icon={Wallet} title="Sin cobros todavía" description="Aún no hay cobros en cajas accesibles." /></div>
  return <div className="flex flex-col gap-5">
    {header}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(320px,410px)_minmax(0,1fr)]">
      <Card padded={false} className={cx('overflow-hidden', detailOpen && 'hidden xl:block')}>
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3.5 md:px-[18px]">
          <CardHeader title="Cajas por día y moneda" meta={visibleCashboxes.length === 1 ? '1 caja' : `${visibleCashboxes.length} cajas`} className="flex-1" />
          <FilterPanel title="Filtrar cajas" eyebrow="Caja" activeFilterCount={activeFilterCount} resultCount={visibleCashboxes.length} onClear={clearFilters}>
            <div className="grid gap-3.5">
              <Field label="Fecha"><Input aria-label="Filtrar por fecha" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></Field>
              <Field label="Sucursal"><FormSelect ariaLabel="Filtrar por sucursal" value={branchFilter} onValueChange={setBranchFilter} options={[{ value: '', label: 'Todas las sucursales' }, ...branches.map((branch) => ({ value: branch, label: branch }))]} /></Field>
              <Field label="Vendedor"><FormSelect ariaLabel="Filtrar por vendedor" value={sellerFilter} onValueChange={setSellerFilter} options={[{ value: '', label: 'Todos los vendedores' }, ...sellers.map(([id, name]) => ({ value: id, label: name }))]} /></Field>
            </div>
          </FilterPanel>
        </div>
        <div className="xl:max-h-[68vh] xl:overflow-y-auto">
          {visibleCashboxes.map((cashbox, index) => (
            <ListItem
              key={cashbox.id}
              avatarName={cashbox.sellerName}
              title={cashbox.sellerName}
              meta={`${cashbox.branchName} · ${cashbox.businessDate} · ${cashbox.paymentCount} cobros`}
              trailing={<span className="whitespace-nowrap font-display text-[15px] font-bold tabular-nums text-ink">{money(cashbox.receivedAmount, cashbox.currency)}</span>}
              badge={<Badge tone={cashbox.primaryClosed ? 'success' : 'progress'}>{cashbox.primaryClosed ? 'Cerrada' : 'Abierta'}</Badge>}
              selected={selectedId === cashbox.id}
              onSelect={() => { setSelectedId(cashbox.id); setDetailOpen(true); setMessage('') }}
              last={index === visibleCashboxes.length - 1}
            />
          ))}
          {!visibleCashboxes.length ? <div className="p-4"><EmptyState icon={Wallet} title="Sin cajas con estos filtros" action={<Button variant="ghost" onClick={clearFilters}>Limpiar filtros</Button>} /></div> : null}
        </div>
      </Card>

      {selected ? <div className={cx(!detailOpen && 'hidden xl:block')}>
        <Card className="flex flex-col gap-5">
          <div className="xl:hidden"><Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => setDetailOpen(false)} className="-ml-2">Volver a cajas</Button></div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-action">{selected.branchName} · {selected.businessDate}</p>
              <h2 className="mt-1 font-display text-[22px] font-bold tracking-[-0.02em] text-ink">Caja {selected.sellerName}</h2>
            </div>
            <Badge size="lg" tone={selected.primaryClosed ? 'success' : 'progress'}>{selected.primaryClosed ? 'Cierre principal realizado' : 'Abierta'}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Cobrado" value={amount(selected.receivedAmount)} unit={selected.currency} />
            <StatCard label="Consolidado" value={amount(selected.closedExpectedAmount)} unit={selected.currency} />
            <StatCard label="Diferencia" value={amount(selected.closedDifferenceAmount)} unit={selected.currency} tone={Number(selected.closedDifferenceAmount) !== 0 ? 'danger' : 'default'} />
          </div>
          {selected.closures.length ? <div>
            <h3 className="font-display text-[17px] font-semibold text-ink">Historial de cierres</h3>
            <div className="mt-2 divide-y divide-line-soft">{selected.closures.map((closure) => <div key={closure.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto]"><div><strong className="text-ink">{closure.type === 'primary' ? 'Cierre principal' : `Complementario ${closure.sequenceNumber}`}</strong><p className="text-[13px] text-text-muted">{new Date(closure.closedAt).toLocaleString('es-CU')}</p></div><div className="text-left sm:text-right"><p className="font-display font-semibold tabular-nums text-ink">{money(closure.expectedAmount, selected.currency)}</p><p className="text-[13px] text-text-muted">Declarado {money(closure.declaredAmount, selected.currency)}</p></div></div>)}</div>
          </div> : null}
          {isOwnCashbox ? <form onSubmit={closeCashbox} className="flex flex-col gap-3 rounded-card border border-line-card bg-field p-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label={`Efectivo declarado (${selected.currency})`} className="min-w-52 flex-1">
                <Input key={selected.id} name="declaredAmount" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={(selected.primaryClosed ? selected.pendingPostCloseAmount : selected.receivedAmount).toFixed(2)} required numeric />
              </Field>
              <Button type="submit" icon={Lock} disabled={pending || (selected.primaryClosed && selected.pendingPostCloseAmount <= 0)} className="w-full sm:w-auto">{selected.primaryClosed ? 'Generar complementario' : 'Cerrar caja del día'}</Button>
            </div>
            {selected.primaryClosed ? <p className="text-[13px] text-text-muted">Pendiente posterior al cierre: {money(selected.pendingPostCloseAmount, selected.currency)}</p> : null}
          </form> : <Alert tone="info">Vista de revisión. Solo quien recibió el efectivo puede cerrar esta caja.</Alert>}
          {message ? <Alert tone={offlineAcknowledged && message.includes('sin conexión') ? 'warning' : 'danger'} role="alert">{message}</Alert> : null}
          <Alert tone="info" title="Cómo funciona tu caja.">Cada moneda se cierra por separado. Los cobros posteriores permanecen disponibles para un cierre complementario sin alterar el principal.</Alert>
        </Card>
      </div> : null}
    </div>
    <Toast message={toast} onDismiss={() => setToast('')} />
  </div>
}
