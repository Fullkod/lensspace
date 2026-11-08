'use client'

import { Plus, ReceiptText } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, type FormEvent } from 'react'

import { formatShortDate } from '@/features/orders/format'
import { createClient } from '@/lib/supabase/client'
import { FormSelect } from '@/shared/components'
import { friendlyError } from '@/shared/lib/friendly-error'
import { newRequestId } from '@/shared/utils/request-id'
import { Alert, Badge, Button, Card, Dialog, EmptyState, Field, FilterChips, Input } from '@/shared/ui'

import { AccountCollections } from './AccountCollections'
import { balanceUsd, formatUsd, jobsLabel, paymentLabels, paymentTones, statusLabels, statusTones, totalUsd, type CommercialOrderSummary, type CommercialScope } from '../order-types'

type Filter = 'active' | 'debt' | 'all'
type AccountOption = { id: number; name: string }

const isActive = (order: CommercialOrderSummary) => order.status === 'open' || order.status === 'confirmed' || order.status === 'ready'

// LEN0010: commercial orders to retail opticians. Sellers see their own; the owner and
// sellers with the exceptional permission see every order of their branches.
export function CommercialOrdersWorkspace({ orders, scopes, accounts, initialAccountId, startCollect }: {
  orders: CommercialOrderSummary[]
  scopes: CommercialScope[]
  accounts: Record<number, AccountOption[]>
  initialAccountId: number | null
  startCollect: boolean
}) {
  const [filter, setFilter] = useState<Filter>('active')
  const [accountId, setAccountId] = useState(initialAccountId ? String(initialAccountId) : '')
  const [creating, setCreating] = useState(false)
  const accountOptions = useMemo(() => {
    const names = new Map<number, string>()
    for (const order of orders) names.set(order.accountId, order.accountName)
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [orders])
  const byAccount = orders.filter((order) => !accountId || order.accountId === Number(accountId))
  const counts = { active: byAccount.filter(isActive).length, debt: byAccount.filter((order) => balanceUsd(order) > 0).length, all: byAccount.length }
  const visible = byAccount.filter((order) => filter === 'all' || (filter === 'active' ? isActive(order) : balanceUsd(order) > 0))
  const debt = byAccount.reduce((sum, order) => sum + balanceUsd(order), 0)
  const canCreate = scopes.some((scope) => scope.canOperate && (accounts[scope.organizationId] ?? []).length > 0)

  return <div className="flex flex-col gap-5">
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="font-display text-[17px] font-semibold text-ink">Pedidos a ópticas</h2>
          <p className="text-[13px] text-text-muted">Pendiente de cobro: <strong className="text-ink">{formatUsd(debt)}</strong></p>
        </div>
        {canCreate ? <Button icon={Plus} onClick={() => setCreating(true)}>Nuevo pedido</Button> : null}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips label="Filtrar pedidos" value={filter} onChange={setFilter} chips={[
          { value: 'active', label: 'En curso', count: counts.active },
          { value: 'debt', label: 'Por cobrar', count: counts.debt },
          { value: 'all', label: 'Todos', count: counts.all },
        ]} />
        {accountOptions.length > 1 ? <div className="sm:w-64"><FormSelect ariaLabel="Óptica" value={accountId} onValueChange={setAccountId} options={[{ value: '', label: 'Todas las ópticas' }, ...accountOptions.map(([id, name]) => ({ value: String(id), label: name }))]} /></div> : null}
      </div>

      {visible.length === 0 ? <EmptyState icon={ReceiptText} title="No hay pedidos aquí" description={orders.length ? 'Cambia el filtro para ver otros pedidos.' : 'Abre el primer pedido para una óptica minorista.'} />
        : <div className="overflow-hidden rounded-card border border-line">
          {visible.map((order) => <Link key={order.id} href={`/wholesale-orders/${order.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line-soft px-4 py-3 transition last:border-b-0 hover:bg-field focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action">
            <div className="flex min-w-0 flex-1 basis-full flex-col gap-1 sm:basis-0">
              <span className="truncate text-[15px] font-semibold text-ink">{order.accountName}</span>
              <span className="text-[13px] text-text-muted">{order.orderNumber} · {jobsLabel(order.lineCount)}{order.deliveredCount && order.deliveredCount < order.lineCount ? ` · ${order.deliveredCount} entregados` : ''} · {formatShortDate(order.createdAt)} · {order.sellerName}</span>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={statusTones[order.status]}>{statusLabels[order.status]}</Badge>
                {order.lineCount ? <Badge tone={paymentTones[order.paymentStatus]}>{paymentLabels[order.paymentStatus]}</Badge> : null}
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-display text-[15px] font-bold tabular-nums text-ink">{formatUsd(totalUsd(order))}</span>
              {balanceUsd(order) > 0 && order.status !== 'open' ? <span className="text-[13px] font-semibold text-coral">Debe {formatUsd(balanceUsd(order))}</span> : null}
            </div>
          </Link>)}
        </div>}
    </Card>
    {accountId && byAccount.length ? <AccountCollections key={accountId} accountId={Number(accountId)} accountName={byAccount[0].accountName} orders={byAccount} startOpen={startCollect} /> : null}
    {creating ? <NewCommercialOrderDialog scopes={scopes.filter((scope) => scope.canOperate)} accounts={accounts} initialAccountId={accountId} onClose={() => setCreating(false)} /> : null}
  </div>
}

function NewCommercialOrderDialog({ scopes, accounts, initialAccountId, onClose }: { scopes: CommercialScope[]; accounts: Record<number, AccountOption[]>; initialAccountId: string; onClose: () => void }) {
  const router = useRouter()
  const [scopeKey, setScopeKey] = useState(scopes[0] ? `${scopes[0].organizationId}:${scopes[0].branchId}` : '')
  const scope = scopes.find((entry) => `${entry.organizationId}:${entry.branchId}` === scopeKey)
  const options = scope ? accounts[scope.organizationId] ?? [] : []
  const [accountId, setAccountId] = useState(options.some(({ id }) => String(id) === initialAccountId) ? initialAccountId : '')
  const [rate, setRate] = useState(String(scope?.rate ?? ''))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(newRequestId())

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!scope) return setError('Elige la sucursal.')
    if (!accountId) return setError('Elige la óptica.')
    const rateValue = Number(rate.replace(',', '.'))
    if (!Number.isFinite(rateValue) || rateValue <= 0) return setError('Indica una tasa USD/CUP mayor que 0.')
    setPending(true); setError(null)
    const { data, error: openError } = await createClient().rpc('open_commercial_order', {
      target_organization_id: scope.organizationId, target_branch_id: scope.branchId, target_account_id: Number(accountId),
      target_usd_to_cup_rate: rateValue, request_id: requestId.current,
    } as never)
    if (openError) { setPending(false); return setError(friendlyError(openError, 'No pudimos abrir el pedido.')) }
    router.push(`/wholesale-orders/${(data as { orderId: number }).orderId}`)
  }

  return <Dialog open onClose={() => { if (!pending) onClose() }} title="Nuevo pedido a una óptica" icon={ReceiptText} size="md"
    footer={<>
      <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
      <Button type="submit" form="new-commercial-order" disabled={pending}>{pending ? 'Abriendo…' : 'Abrir pedido'}</Button>
    </>}>
    <form id="new-commercial-order" onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {scopes.length > 1 ? <Field as="div" label="Sucursal"><FormSelect ariaLabel="Sucursal" value={scopeKey} onValueChange={(value) => { setScopeKey(value); setAccountId(''); setRate(String(scopes.find((entry) => `${entry.organizationId}:${entry.branchId}` === value)?.rate ?? '')) }}
        options={scopes.map((entry) => ({ value: `${entry.organizationId}:${entry.branchId}`, label: `${entry.organizationName} · ${entry.branchName}` }))} /></Field> : null}
      <Field as="div" label="Óptica"><FormSelect ariaLabel="Óptica" value={accountId} onValueChange={setAccountId} options={[{ value: '', label: options.length ? 'Elige la óptica' : 'No hay ópticas activas' }, ...options.map(({ id, name }) => ({ value: String(id), label: name }))]} /></Field>
      <Field label="Tasa USD/CUP del pedido" help="Queda fija para todo el pedido, aunque se agreguen trabajos otro día."><Input value={rate} onChange={(event) => setRate(event.target.value)} inputMode="decimal" maxLength={10} autoComplete="off" /></Field>
      <p className="text-[13px] text-text-muted">El pedido queda abierto: agrega los trabajos ahora o en los próximos días. Cuando esté completo, el dueño lo cierra para mandarlo a fabricar.</p>
      {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
    </form>
  </Dialog>
}
