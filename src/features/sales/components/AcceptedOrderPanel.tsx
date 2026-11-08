'use client'

import { CircleCheck, Plus, ReceiptText } from 'lucide-react'
import { useEffect, useMemo, useState, useTransition } from 'react'

import { PaymentForm, type PaymentInput } from '@/features/orders/components/PaymentForm'
import { formatAmount } from '@/features/orders/format'
import { friendlyPaymentError, isNetworkError } from '@/features/orders/payment-errors'
import { cupToUsd, formatInCurrency, isUsdOnly, saleCurrency, toUsd } from '@/features/orders/sale-currency'
import type { PaymentSummary } from '@/features/orders/types'
import { OrderProductionPanel } from '@/features/production/components'
import { createClient } from '@/lib/supabase/client'
import { refreshNavigationCounters } from '@/shared/lib/navigation-counters'
import { Alert, Button, ButtonLink, Card, CardHeader, ProgressBar, Toast } from '@/shared/ui'

import type { AcceptedOrder, MultiPriceResult } from './sale-types'

// After acceptance the seller can take the first payment with the same form as /orders.
export function AcceptedOrderPanel({ order, customerName, preview, pairLabels, onNewSale }: { order: AcceptedOrder; customerName: string; preview: MultiPriceResult | null; pairLabels: string[]; onNewSale: () => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [summary, setSummary] = useState<PaymentSummary | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('get_order_payment_summary', { target_order_id: order.orderId } as never).then(({ data, error: loadError }) => {
      if (cancelled) return
      if (loadError) setError('El pedido fue creado, pero no pudimos cargar su saldo. Puedes abrirlo desde Pedidos y cobros.')
      else setSummary(data as unknown as PaymentSummary)
    })
    return () => { cancelled = true }
  }, [order.orderId, supabase])

  function registerPayment(input: PaymentInput) {
    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const { error: paymentError } = await supabase.rpc('register_cash_payment', { target_order_id: order.orderId, payment_amount: input.amount, payment_currency: input.currency, payment_applied_rate: input.rate, payment_notes: input.notes, payment_request_id: input.requestId } as never)
        if (paymentError) {
          setError(friendlyPaymentError(paymentError))
          // The payment may have committed: show the real balance before any retry.
          if (isNetworkError(paymentError)) {
            const { data } = await supabase.rpc('get_order_payment_summary', { target_order_id: order.orderId } as never)
            if (data) setSummary(data as unknown as PaymentSummary)
          }
          return resolve(false)
        }
        setError('')
        void refreshNavigationCounters()
        const { data, error: refreshError } = await supabase.rpc('get_order_payment_summary', { target_order_id: order.orderId } as never)
        if (refreshError) setError('El cobro se registró, pero no pudimos actualizar el saldo en pantalla.')
        else setSummary(data as unknown as PaymentSummary)
        setToast('Cobro registrado correctamente.')
        resolve(true)
      })
    })
  }

  const owes = Boolean(summary && summary.balanceCup > 0)
  const currency = saleCurrency()
  const rate = summary?.saleRate ?? 420
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-card border border-success-line bg-success-tint p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-success-soft text-success-ink"><CircleCheck aria-hidden="true" size={22} /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-success-ink">Pedido creado</p>
            <h2 className="mt-1 font-display text-2xl font-bold text-ink">{order.orderNumber}</h2>
            <p className="mt-0.5 text-sm text-text-secondary">Cliente: {customerName}</p>
          </div>
        </div>
        <div className="grid gap-2 sm:flex">
          <ButtonLink href="/orders" variant="secondary" icon={ReceiptText}>Ver en pedidos</ButtonLink>
          <Button variant="secondary" icon={Plus} onClick={onNewSale}>Otra venta</Button>
        </div>
      </div>

      {preview ? <Card>
        <CardHeader title="Detalle del pedido" meta={preview.lines.length > 1 ? `${preview.lines.length} pares` : undefined} />
        {preview.lines.map((pair) => (
          <div key={pair.lineNumber} className="mt-3">
            {preview.lines.length > 1 ? <p className="text-[13px] font-semibold text-ink">{pairLabels[pair.lineNumber - 1] ?? `Par ${pair.lineNumber}`}</p> : null}
            <div className="divide-y divide-line-soft">
              {pair.pricing.lineItems.map((line, index) => (
                <div key={`${line.name}:${index}`} className="flex justify-between gap-4 py-3 text-sm">
                  <span className="text-text-secondary">{line.name}</span>
                  <strong className="shrink-0 font-display tabular-nums text-ink">{formatAmount(line.amount)} {line.currency}</strong>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="mt-3 border-t border-dashed border-line-focus pt-3">
          {Object.entries(preview.totals).map(([currency, total]) => (
            <p key={currency} className="flex justify-between font-display text-xl font-bold tabular-nums text-ink"><span>Total</span><span>{formatAmount(total)} {currency}</span></p>
          ))}
        </div>
      </Card> : null}

      <Card className="flex flex-col gap-4">
        <div>
          <p className={owes ? 'text-[13px] font-semibold text-coral-ink' : 'text-[13px] font-semibold text-success-ink'}>Saldo pendiente</p>
          <p className="mt-1 font-display text-[32px] font-bold leading-tight tabular-nums text-ink">{summary ? formatInCurrency(summary.balanceCup, currency, rate) : 'Cargando…'}</p>
          {summary && currency === 'USD' && owes ? <p className="mt-0.5 text-[13px] text-text-muted">≈ {formatAmount(summary.balanceCup)} CUP a {formatAmount(rate)}</p> : null}
          {summary ? (
            <div className="mt-3">
              <ProgressBar value={summary.totalCup ? (summary.paidCup / summary.totalCup) * 100 : 100} tone={owes ? 'attention' : 'success'} label="Porcentaje cobrado" />
              <p className="mt-2 text-[13px] text-text-muted">Cobrado: {formatAmount(isUsdOnly(summary.totals) ? Math.max(summary.totals.USD - cupToUsd(summary.balanceCup, rate), 0) : toUsd(summary.paidCup, rate))} USD</p>
            </div>
          ) : null}
        </div>
        {summary && owes ? <PaymentForm balanceCup={summary.balanceCup} saleRate={rate} saleCurrency={currency} pending={pending} onSubmit={registerPayment} /> : null}
        {summary && !owes ? <Alert tone="success">Pedido pagado completamente.</Alert> : null}
        {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
      </Card>
      <OrderProductionPanel orderId={order.orderId} canAssign />
      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}
