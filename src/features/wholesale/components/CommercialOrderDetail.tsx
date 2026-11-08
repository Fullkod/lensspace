'use client'

import { ArrowLeft, Lock, PackageCheck, Plus, RotateCcw, Truck, Wallet } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { formatDateTime } from '@/features/orders/format'
import { OrderProductionPanel } from '@/features/production/components'
import type { SaleItem, SaleScope } from '@/features/sales/components'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/shared/lib/friendly-error'
import { Alert, Badge, Button, ButtonLink, Card, Dialog, Field, Input, Toast, cx } from '@/shared/ui'

import { balanceUsd, formatUsd, paidUsd, paymentLabels, paymentTones, statusLabels, statusTones, totalUsd, type CommercialLine, type CommercialOrder } from '../order-types'
import { AddJobEditor } from './AddJobEditor'
import { CommercialOrderLines } from './CommercialOrderLines'

type Action = { kind: 'close' } | { kind: 'reopen' } | { kind: 'remove'; line: CommercialLine } | { kind: 'deliver' } | null

// LEN0010: one commercial order. Open → jobs are added over several days; the owner (or
// a permitted seller) closes it for production; then ready, delivery (whole or by job,
// on credit allowed). Every action goes through its RPC and the page refreshes.
export function CommercialOrderDetail({ order, items, scope, canApproveLargeDiscount }: { order: CommercialOrder; items: SaleItem[]; scope: SaleScope; canApproveLargeDiscount: boolean }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [action, setAction] = useState<Action>(null)
  const [reason, setReason] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const active = order.lines.filter((line) => !line.removedAt)
  const pendingDelivery = active.filter((line) => !line.deliveredAt)
  const closedStage = order.status === 'confirmed' || order.status === 'ready'
  const balance = balanceUsd(order)

  function open(next: Action) {
    setAction(next); setReason(''); setError(null)
    setSelected(next?.kind === 'deliver' ? pendingDelivery.map(({ id }) => id) : [])
  }

  async function run(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (!action) return
    if ((action.kind === 'reopen' || action.kind === 'remove') && reason.trim().length < 5) return setError('Explica el motivo en al menos 5 caracteres.')
    if (action.kind === 'deliver' && !selected.length) return setError('Marca al menos un trabajo.')
    setPending(true); setError(null)
    const supabase = createClient()
    const all = action.kind === 'deliver' && selected.length === pendingDelivery.length
    const { error: actionError } = action.kind === 'close' ? await supabase.rpc('close_commercial_order', { target_order_id: order.id } as never)
      : action.kind === 'reopen' ? await supabase.rpc('reopen_commercial_order', { target_order_id: order.id, reopen_reason: reason } as never)
      : action.kind === 'remove' ? await supabase.rpc('remove_commercial_order_line', { target_line_id: action.line.id, target_reason: reason } as never)
      : await supabase.rpc('deliver_commercial_order_lines', { target_order_id: order.id, target_line_ids: all ? null : selected } as never)
    setPending(false)
    if (actionError) return setError(friendlyError(actionError, 'No pudimos hacer el cambio.'))
    setToast(action.kind === 'close' ? 'Pedido cerrado. Ya puedes mandarlo a fabricar.' : action.kind === 'reopen' ? 'Pedido abierto otra vez.'
      : action.kind === 'remove' ? `Trabajo ${action.line.lineNumber} quitado.` : all ? 'Pedido entregado.' : `${selected.length === 1 ? '1 trabajo entregado' : `${selected.length} trabajos entregados`}.`)
    setAction(null)
    router.refresh()
  }

  async function markReady() {
    setError(null)
    const { error: readyError } = await createClient().rpc('mark_commercial_order_ready', { target_order_id: order.id } as never)
    if (readyError) return setError(friendlyError(readyError, 'No pudimos marcarlo listo.'))
    setToast('Pedido listo para recoger.')
    router.refresh()
  }

  const dialogTitle = action?.kind === 'close' ? 'Cerrar y mandar a fabricar' : action?.kind === 'reopen' ? 'Reabrir pedido' : action?.kind === 'remove' ? `Quitar trabajo ${action.line.lineNumber}` : 'Entregar trabajos'

  return <div className="flex flex-col gap-5">
    <Link href={`/wholesale-orders?optica=${order.accountId}`} className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-action hover:underline"><ArrowLeft aria-hidden="true" size={16} />Pedidos de {order.accountName}</Link>

    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-text-muted">{order.orderNumber} · {order.branchName}</span>
          <h1 className="font-display text-[22px] font-semibold text-ink [overflow-wrap:anywhere]">{order.accountName}</h1>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={statusTones[order.status]} size="lg">{statusLabels[order.status]}</Badge>
            {active.length ? <Badge tone={paymentTones[order.paymentStatus]} size="lg">{paymentLabels[order.paymentStatus]}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="font-display text-[22px] font-bold tabular-nums text-ink">{formatUsd(totalUsd(order))}</span>
          <span className="text-[13px] text-text-muted">Pagado {formatUsd(paidUsd(order))}</span>
          {balance > 0 && order.status !== 'open' ? <span className="text-[13px] font-semibold text-coral">Pendiente {formatUsd(balance)}</span> : null}
        </div>
      </div>
      <p className="text-[13px] text-text-muted">
        Abierto por {order.sellerName ?? 'Usuario'} · {formatDateTime(order.createdAt)} · tasa {order.rate} CUP/USD
        {order.closedAt ? <> · cerrado por {order.closedByName ?? 'Usuario'} · {formatDateTime(order.closedAt)}</> : null}
      </p>
      {order.canWork ? <div className="flex flex-wrap gap-2">
        {order.status === 'open' && !adding ? <Button icon={Plus} onClick={() => setAdding(true)}>Agregar trabajo</Button> : null}
        {order.status === 'open' && order.canManage ? <Button variant="secondary" icon={Lock} disabled={!active.length} onClick={() => open({ kind: 'close' })}>Cerrar y mandar a fabricar</Button> : null}
        {order.status === 'confirmed' ? <Button variant="secondary" icon={PackageCheck} onClick={() => void markReady()}>Marcar listo para recoger</Button> : null}
        {closedStage && pendingDelivery.length ? <Button icon={Truck} onClick={() => open({ kind: 'deliver' })}>Entregar</Button> : null}
        {balance > 0 && active.length ? <ButtonLink variant="ghost" icon={Wallet} href={`/wholesale-orders?optica=${order.accountId}&cobrar=1`}>Cobrar</ButtonLink> : null}
        {closedStage && order.canManage && !active.some((line) => line.deliveredAt) ? <Button variant="ghost" icon={RotateCcw} onClick={() => open({ kind: 'reopen' })}>Reabrir</Button> : null}
      </div> : null}
      {order.status === 'open' && !order.canManage ? <p className="text-[13px] text-text-muted">Cuando el pedido esté completo, avisa al dueño para que lo cierre y lo mande a fabricar.</p> : null}
      {error && !action ? <Alert tone="danger" role="alert">{error}</Alert> : null}
    </Card>

    {adding ? <AddJobEditor orderId={order.id} accountId={order.accountId} scope={scope} items={items} canApproveLargeDiscount={canApproveLargeDiscount}
      onCancel={() => setAdding(false)} onAdded={(message) => { setAdding(false); setToast(message); router.refresh() }} /> : null}

    <CommercialOrderLines lines={order.lines} canRemove={order.status === 'open' && order.canWork} onRemove={(line) => open({ kind: 'remove', line })} />

    {order.status !== 'open' ? <OrderProductionPanel key={`production-${order.id}-${active.length}`} orderId={order.id} canAssign={closedStage && order.canWork} delivered={order.status === 'delivered' || order.status === 'closed'} /> : null}

    <Dialog open={Boolean(action)} onClose={() => { if (!pending) setAction(null) }} eyebrow={`${order.orderNumber} · ${order.accountName}`} title={dialogTitle}
      icon={action?.kind === 'deliver' ? Truck : action?.kind === 'close' ? Lock : action?.kind === 'remove' ? undefined : RotateCcw}
      tone={action?.kind === 'remove' ? 'danger' : 'default'} size="md"
      footer={<>
        <Button variant="ghost" onClick={() => setAction(null)} disabled={pending}>Cancelar</Button>
        <Button type="submit" form="commercial-action" variant={action?.kind === 'remove' ? 'danger' : 'primary'} disabled={pending}>{pending ? 'Guardando…' : action?.kind === 'deliver' ? 'Entregar' : action?.kind === 'close' ? 'Cerrar pedido' : action?.kind === 'remove' ? 'Quitar' : 'Reabrir'}</Button>
      </>}>
      <form id="commercial-action" onSubmit={run} className="flex flex-col gap-4" noValidate>
        {action?.kind === 'close' ? <p className="text-sm text-text">El pedido tiene {active.length === 1 ? '1 trabajo' : `${active.length} trabajos`} por {formatUsd(totalUsd(order))}. Al cerrarlo ya no se pueden agregar ni quitar trabajos sin reabrirlo, y se puede mandar a fabricar.</p> : null}
        {action?.kind === 'reopen' || action?.kind === 'remove' ? <Field label="Motivo" help={action.kind === 'reopen' ? 'Queda en el historial del pedido.' : 'El trabajo seguirá visible como quitado.'}>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} autoComplete="off" />
        </Field> : null}
        {action?.kind === 'deliver' ? <>
          <div className="flex flex-col gap-1.5">
            {pendingDelivery.map((line) => <label key={line.id} className={cx('flex min-h-11 items-center gap-3 rounded-control border px-3.5 py-2 text-[15px]', selected.includes(line.id) ? 'border-action bg-action-tint' : 'border-line bg-field')}>
              <input type="checkbox" className="size-4 accent-[theme(colors.action.DEFAULT)]" checked={selected.includes(line.id)}
                onChange={(event) => setSelected((current) => event.target.checked ? [...current, line.id] : current.filter((id) => id !== line.id))} />
              <span className="min-w-0 flex-1 truncate">Trabajo {line.lineNumber} · {line.patientName ?? 'Paciente'}</span>
            </label>)}
          </div>
          {balance > 0 ? <Alert tone="warning">Queda pendiente {formatUsd(balance)} a cuenta de {order.accountName}. La entrega se registra igual, a crédito.</Alert> : null}
        </> : null}
        {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
      </form>
    </Dialog>
    {toast ? <Toast message={toast} onDismiss={() => setToast('')} /> : null}
  </div>
}
