'use client'

import { ArrowLeft, Banknote, CircleCheck, Hourglass, Lock, MessageCircle, PackageCheck } from 'lucide-react'
import { useCallback, useState } from 'react'

import { OrderProductionPanel, type ProductionReadiness } from '@/features/production/components'

import { Alert, Avatar, Badge, Button, Card, Dialog, ProgressBar, Tabs, Timeline, cx } from '@/shared/ui'

import { formatAmount, formatDateTime, formatLongDate } from '../format'
import { isFinished, orderStatus, paymentStatusLabels, timelineKind } from '../order-status'
import { cupToUsd, formatTotals, isUsdOnly, saleCurrency, toUsd } from '../sale-currency'
import type { Order, OrderPair, PaymentSummary, TimelineEvent } from '../types'
import { OrderPairs } from './OrderPairs'
import { PaymentForm, type PaymentInput } from './PaymentForm'

type OrderDetailProps = {
  order: Order
  summary: PaymentSummary
  timeline: TimelineEvent[]
  pairs: OrderPair[]
  pending: boolean
  error: string
  onBack: () => void
  onRegisterPayment: (input: PaymentInput) => Promise<boolean>
  onDeliver: () => void
  onNotifyReady: () => void
}

export function OrderDetail({ order, summary, timeline, pairs, pending, error, onBack, onRegisterPayment, onDeliver, onNotifyReady }: OrderDetailProps) {
  const [tab, setTab] = useState<'payments' | 'history'>('payments')
  const [readiness, setReadiness] = useState<ProductionReadiness | null>(null)
  const [confirmDelivery, setConfirmDelivery] = useState(false)
  const [confirmNotify, setConfirmNotify] = useState(false)
  const handleReadiness = useCallback((value: ProductionReadiness) => setReadiness(value), [])
  // Product decision (QA-14): delivering before production is reviewed warns, never blocks.
  const requestDelivery = () => (readiness?.ready ? onDeliver() : setConfirmDelivery(true))
  // LEN0006: «Pedido listo» stays manual (QA-08) but asks first while production is unfinished.
  const requestNotify = () => (readiness?.hasJobs && !readiness.ready ? setConfirmNotify(true) : onNotifyReady())
  const missingPairs = readiness ? readiness.pairCount - readiness.readyPairs : 0
  const unfinished = readiness && readiness.pairCount > 1
    ? `Faltan ${missingPairs} de ${readiness.pairCount} pares por recibir y revisar en la óptica.`
    : 'La producción de este pedido todavía no está recibida y revisada por la óptica.'
  const status = orderStatus({ ...order, balanceCup: summary.balanceCup, commercialStatus: summary.commercialStatus, paymentStatus: summary.paymentStatus })
  const finished = isFinished(summary)
  const owes = summary.balanceCup > 0 && !finished
  const percent = summary.totalCup ? (summary.paidCup / summary.totalCup) * 100 : 100
  const paymentCount = summary.payments.length
  const currency = saleCurrency()
  const rate = summary.saleRate ?? 420
  const balance = currency === 'USD' ? cupToUsd(summary.balanceCup, rate) : summary.balanceCup
  // A USD-only sale has an exact USD total; CUP and mixed sales convert at the sale rate.
  const total = isUsdOnly(summary.totals) ? summary.totals.USD : toUsd(summary.totalCup, rate)
  const paid = currency === 'USD' ? Math.max(total - balance, 0) : summary.paidCup
  const paidMessage = summary.commercialStatus === 'delivered' ? 'Pedido entregado y pagado completamente.' : summary.commercialStatus === 'closed' ? 'Pedido cerrado y pagado.' : 'Pago completado. El pedido está listo para entregar.'
  const history = [...timeline].reverse().map((event) => ({ id: event.id, ...timelineKind(event.kind), when: formatDateTime(event.occurredAt), title: event.title, detail: event.detail, actor: event.actorName }))

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3.5 border-b border-line-soft px-4 py-4 md:px-6 md:py-5">
        <div className="w-full xl:hidden"><Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack} className="-ml-2">Volver a pedidos</Button></div>
        <Avatar name={order.customerName} size="lg" strong />
        <div className="min-w-0 flex-1 basis-[180px]">
          <h2 className="truncate font-display text-[22px] font-bold tracking-[-0.02em] text-ink">{order.customerName}</h2>
          <p className="mt-0.5 text-sm text-text-muted">{summary.orderNumber} · creado el {formatLongDate(order.createdAt)}{order.customerPhone ? ` · ${order.customerPhone}` : ''}</p>
        </div>
        <Badge tone={status.tone} size="lg">{status.label}</Badge>
      </div>

      <div className="flex flex-col gap-[22px] px-4 py-5 md:px-6 md:py-[22px]">
        <div className="flex flex-wrap gap-3.5">
          <div className={cx('min-w-0 flex-[1.3_1_260px] rounded-card border px-5 py-[18px]', owes ? 'border-coral-line bg-coral-tint' : 'border-success-line bg-success-tint')}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={cx('text-[13px] font-semibold', owes ? 'text-coral-ink' : 'text-success-ink')}>{owes ? 'Saldo pendiente' : 'Saldo'}</p>
                <p className={cx('mt-1 font-display text-[36px] font-bold leading-[1.05] tracking-[-0.03em] tabular-nums', owes ? 'text-coral-strong' : 'text-success-ink')}>
                  {formatAmount(balance)} <span className="text-base font-semibold">{currency}</span>
                </p>
                {currency === 'USD' && owes ? <p className="mt-0.5 text-[13px] text-text-secondary">≈ {formatAmount(summary.balanceCup)} CUP a {formatAmount(rate)}</p> : null}
              </div>
              <span className={cx('grid size-[42px] shrink-0 place-items-center rounded-[12px]', owes ? 'bg-coral-wash text-coral-ink' : 'bg-success-soft text-success-ink')}>
                {owes ? <Hourglass aria-hidden="true" size={20} /> : <CircleCheck aria-hidden="true" size={20} />}
              </span>
            </div>
            <div className="mt-4"><ProgressBar value={percent} tone={owes ? 'attention' : 'success'} size="lg" label="Porcentaje cobrado" /></div>
            <p className="mt-2 text-[13px] text-text-secondary">Cobrado {percent > 0 && percent < 1 ? '<1' : Math.min(100, Math.floor(percent))} % · {paymentStatusLabels[summary.paymentStatus] ?? summary.paymentStatus}</p>
          </div>
          <div className="grid flex-[1_1_200px] grid-cols-2 gap-2.5">
            <div className="rounded-card border border-line-card px-4 py-3.5">
              <p className="text-[13px] text-text-muted">Total</p>
              <p className="mt-1 font-display text-xl font-bold tabular-nums text-ink">{formatAmount(total)}</p>
              <p className="text-xs text-text-muted">{isUsdOnly(summary.totals) ? 'USD' : `USD · precio ${formatTotals(summary.totals)}`}</p>
            </div>
            <div className="rounded-card border border-line-card px-4 py-3.5">
              <p className="text-[13px] text-text-muted">Cobrado</p>
              <p className="mt-1 font-display text-xl font-bold tabular-nums text-success-ink">{formatAmount(paid)} <span className="text-sm font-semibold">{currency}</span></p>
              <p className="text-xs text-text-muted">{paymentCount === 1 ? '1 pago' : `${paymentCount} pagos`}</p>
            </div>
          </div>
        </div>

        {owes ? (
          <PaymentForm key={summary.orderId} balanceCup={summary.balanceCup} saleRate={rate} saleCurrency={currency} pending={pending} onSubmit={onRegisterPayment} />
        ) : (
          <Alert tone="success">{paidMessage}</Alert>
        )}
        {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}

        {pairs.length > 1 ? <OrderPairs pairs={pairs} /> : null}

        <OrderProductionPanel key={`production-${summary.orderId}`} orderId={summary.orderId} canAssign={summary.commercialStatus === 'accepted'} delivered={summary.commercialStatus === 'delivered' || summary.commercialStatus === 'closed'} onReadinessChange={handleReadiness} />

        <div>
          <Tabs label="Detalle del pedido" value={tab} onChange={setTab} tabs={[{ value: 'payments', label: 'Pagos', count: paymentCount }, { value: 'history', label: 'Historial', count: history.length }]} />
          {tab === 'payments' ? (
            <div role="tabpanel" className="flex flex-col">
              {summary.payments.map((payment) => (
                <div key={payment.id} className="flex items-center gap-3.5 border-b border-line-faint px-0.5 py-3.5">
                  <span className="grid size-[38px] shrink-0 place-items-center rounded-control bg-action-soft text-action"><Banknote aria-hidden="true" size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold text-ink">{formatAmount(payment.amount)} {payment.currency}{payment.currency === 'USD' ? ` × ${formatAmount(payment.appliedRate)}` : ''}</span>
                      {payment.isPostClose ? <Badge tone="progress" dot={false}>Posterior al cierre</Badge> : null}
                    </div>
                    <p className="text-[13px] text-text-muted">{formatDateTime(payment.receivedAt)}{payment.notes ? ` · ${payment.notes}` : ''}</p>
                  </div>
                  <p className="whitespace-nowrap font-display text-base font-bold tabular-nums text-ink">{formatAmount(payment.currency === 'USD' ? payment.amount : toUsd(payment.equivalentCup, rate))} USD</p>
                </div>
              ))}
              {!paymentCount ? <p className="px-1 py-[22px] text-[14.5px] text-text-muted">Aún no hay pagos registrados para este pedido.</p> : null}
            </div>
          ) : (
            <div role="tabpanel" className="pt-[18px]"><Timeline items={history} /></div>
          )}
        </div>

        <Alert tone="info" icon={MessageCircle}>Confirmación, pago recibido y entrega se notifican solos al WhatsApp autorizado del cliente. «Pedido listo» lo envías tú con «Avisar: listo para recoger» cuando los espejuelos estén revisados. Cada envío queda en el historial.</Alert>
      </div>

      {summary.commercialStatus === 'accepted' ? (
        <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-line-soft bg-canvas px-4 py-4 md:px-6">
          <p className={cx('flex items-center gap-2 text-sm', owes ? 'text-text-muted' : 'font-semibold text-success-ink')}>
            {owes ? <Lock aria-hidden="true" size={16} className="shrink-0 text-text-disabled" /> : <PackageCheck aria-hidden="true" size={16} className="shrink-0" />}
            {owes ? `Disponible cuando el saldo llegue a 0 · faltan ${formatAmount(balance)} ${currency}` : 'Todo cobrado. Puedes entregar el pedido.'}
          </p>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="secondary" icon={MessageCircle} onClick={requestNotify} disabled={pending} className="w-full sm:w-auto">Avisar: listo para recoger</Button>
            <Button variant="ink" icon={PackageCheck} onClick={requestDelivery} disabled={owes || pending} className="w-full sm:w-auto">Marcar como entregado</Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={confirmDelivery}
        onClose={() => setConfirmDelivery(false)}
        title="¿Entregar igual?"
        description={readiness?.hasJobs ? unfinished : 'Este pedido no se ha enviado a producción.'}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmDelivery(false)}>Volver</Button>
          <Button variant="ink" icon={PackageCheck} onClick={() => { setConfirmDelivery(false); onDeliver() }}>Entregar igual</Button>
        </>}
      />
      <Dialog
        open={confirmNotify}
        onClose={() => setConfirmNotify(false)}
        title="¿Avisar igual?"
        description={`${unfinished} El cliente recibirá «Tu pedido está listo».`}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmNotify(false)}>Volver</Button>
          <Button icon={MessageCircle} onClick={() => { setConfirmNotify(false); onNotifyReady() }}>Avisar igual</Button>
        </>}
      />
    </Card>
  )
}
