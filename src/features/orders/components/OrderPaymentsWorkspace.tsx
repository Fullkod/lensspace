'use client'

import { Glasses, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'

import { createClient } from '@/lib/supabase/client'
import { ButtonLink, EmptyState, PageHeader, StatCard, Toast, cx } from '@/shared/ui'
import { newRequestId } from '@/shared/utils/request-id'
import { friendlyError } from '@/shared/lib/friendly-error'
import { useServerState } from '@/shared/hooks/use-server-state'
import { refreshNavigationCounters } from '@/shared/lib/navigation-counters'

import { FINISHED_ORDERS_DAYS, formatAmount } from '../format'
import { daysAgoIn } from '@/shared/utils/dates'
import { orderKpis } from '../order-kpis'
import { friendlyPaymentError, isNetworkError } from '../payment-errors'
import type { Order, OrderPair, PaymentSummary, TimelineEvent } from '../types'
import { OrderDetail } from './OrderDetail'
import { OrdersInbox } from './OrdersInbox'
import type { PaymentInput } from './PaymentForm'

const DESKTOP_QUERY = '(min-width: 1280px)'

// /orders and /sales are enabled together (same optical_sales access), so the empty state can link to /sales.
type WorkspaceProps = { initialOrders: Order[]; initialCustomerFilter?: string; initialCustomerId?: number }

export function OrderPaymentsWorkspace({ initialOrders, initialCustomerFilter = '', initialCustomerId }: WorkspaceProps) {
  const supabase = useMemo(() => createClient(), [])
  const [orders, setOrders] = useServerState(initialOrders)
  const [selectedId, setSelectedId] = useState(0)
  const [summary, setSummary] = useState<PaymentSummary | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [pairs, setPairs] = useState<OrderPair[]>([])
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [pending, startTransition] = useTransition()

  const loadDetail = useCallback(async (orderId: number) => {
    // One call for summary + history (QA-35): half the requests and preflights.
    const { data, error: detailError } = await supabase.rpc('get_order_detail', { target_order_id: orderId } as never)
    if (detailError) throw detailError
    const detail = data as unknown as { summary: PaymentSummary; timeline: TimelineEvent[]; pairs?: OrderPair[] }
    setSummary(detail.summary)
    setTimeline(detail.timeline ?? [])
    setPairs(detail.pairs ?? [])
  }, [supabase])

  const refreshOrders = useCallback(async () => {
    void refreshNavigationCounters()
    const { data, error: listError } = initialCustomerId || initialCustomerFilter
      ? await supabase.rpc('list_accessible_orders')
      : await supabase.rpc('list_accessible_orders', { finished_since: daysAgoIn(FINISHED_ORDERS_DAYS) } as never)
    if (!listError) setOrders(data as unknown as Order[])
  }, [initialCustomerFilter, initialCustomerId, setOrders, supabase])

  const select = useCallback((orderId: number) => {
    setSelectedId(orderId); setError('')
    startTransition(async () => {
      try { await loadDetail(orderId) } catch (loadError) { setSummary(null); setError(friendlyError(loadError instanceof Error ? loadError : null, 'No se pudo abrir el pedido.')) }
    })
  }, [loadDetail])

  // Desktop shows inbox and detail side by side, so the first order opens automatically.
  // Mobile shows one pane at a time and starts on the inbox. When fresh server data
  // arrives (focus, reconnect, back/forward) the open order reloads instead (QA-27).
  const openOrderId = useRef(0)
  useEffect(() => { openOrderId.current = selectedId }, [selectedId])
  useEffect(() => {
    if (openOrderId.current) {
      const orderId = openOrderId.current
      startTransition(async () => { await loadDetail(orderId).catch(() => undefined) })
      return
    }
    const first = initialOrders[0]
    if (!first || !window.matchMedia(DESKTOP_QUERY).matches) return
    startTransition(async () => {
      try { await loadDetail(first.id); setSelectedId(first.id) } catch { /* the user can still pick an order */ }
    })
  }, [initialOrders, loadDetail])

  function registerPayment(input: PaymentInput) {
    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const { error: paymentError } = await supabase.rpc('register_cash_payment', { target_order_id: selectedId, payment_amount: input.amount, payment_currency: input.currency, payment_applied_rate: input.rate, payment_notes: input.notes, payment_request_id: input.requestId } as never)
        if (paymentError) {
          setError(friendlyPaymentError(paymentError))
          // The payment may have committed, or another tab changed the balance (QA-27):
          // show the real state before any retry.
          await Promise.all([loadDetail(selectedId), refreshOrders()]).catch(() => undefined)
          return resolve(false)
        }
        setError('')
        await Promise.all([loadDetail(selectedId), refreshOrders()]).catch(() => undefined)
        setToast('Pago en efectivo registrado.')
        resolve(true)
      })
    })
  }

  // Reused until the notice is queued so a retry after a lost response is not sent twice.
  const readyRequest = useRef<{ orderId: number; id: string } | null>(null)
  function notifyReady() {
    if (readyRequest.current?.orderId !== selectedId) readyRequest.current = { orderId: selectedId, id: newRequestId() }
    const requestId = readyRequest.current.id
    startTransition(async () => {
      const { error: notifyError } = await supabase.rpc('notify_order_ready', { target_order_id: selectedId, request_id: requestId } as never)
      if (notifyError) return setError(isNetworkError(notifyError) ? 'Sin conexión: no sabemos si el aviso salió. Pulsa «Avisar» otra vez cuando vuelva la señal; no se enviará dos veces.' : friendlyError(notifyError, 'No pudimos enviar el aviso.'))
      readyRequest.current = null
      setError('')
      setToast('Aviso «Pedido listo» en camino. El resultado aparecerá en el historial.')
      // The WhatsApp attempt is recorded asynchronously by the Edge Function.
      setTimeout(() => { void loadDetail(selectedId).catch(() => undefined) }, 4000)
    })
  }

  function deliver() {
    startTransition(async () => {
      const { error: deliveryError } = await supabase.rpc('mark_order_delivered', { target_order_id: selectedId } as never)
      if (deliveryError) {
        setError(friendlyError(deliveryError, 'No pudimos marcar el pedido como entregado.'))
        // Someone may have delivered or paid it meanwhile: show the current state.
        await Promise.all([loadDetail(selectedId), refreshOrders()]).catch(() => undefined)
        return
      }
      setError('')
      await Promise.all([loadDetail(selectedId), refreshOrders()]).catch(() => undefined)
      setToast('Pedido marcado como entregado.')
    })
  }

  const kpis = orderKpis(orders)
  const selectedOrder = orders.find((order) => order.id === selectedId)
  const detailOpen = Boolean(summary && selectedOrder)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        variant="featured"
        eyebrow="Operación comercial"
        title="Pedidos y cobros"
        description="Registra efectivo, controla el saldo y entrega solo cuando el pedido esté pagado."
        stats={<>
          <StatCard surface="ink" label="Pedidos activos" value={kpis.activeCount} />
          <StatCard surface="ink" tone="attention" label="Saldo por cobrar" value={formatAmount(kpis.balanceDue)} unit="CUP" />
          <StatCard surface="ink" tone="positive" label="Pagados, por entregar" value={kpis.readyToDeliver} />
          <StatCard surface="ink" label="Cobrado hoy" value={formatAmount(kpis.collectedToday)} unit="CUP" />
        </>}
      />

      {!orders.length ? (
        <EmptyState
          icon={Glasses}
          title="Aún no hay pedidos aceptados"
          description="Crea una venta y confirma la cotización; el pedido aparecerá aquí."
          action={<ButtonLink href="/sales" icon={Plus}>Nueva venta</ButtonLink>}
        />
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
          <OrdersInbox
            orders={orders}
            selectedId={selectedId}
            onSelect={select}
            initialQuery={initialCustomerFilter}
            initialCustomerId={initialCustomerId}
            finishedWindowed={!initialCustomerId && !initialCustomerFilter}
            className={cx(detailOpen && 'hidden xl:block')}
          />
          <div className={cx(!detailOpen && 'hidden xl:block')}>
            {summary && selectedOrder ? (
              <OrderDetail
                order={selectedOrder}
                summary={summary}
                timeline={timeline}
                pairs={pairs}
                pending={pending}
                error={error}
                onBack={() => { setSummary(null); setTimeline([]); setSelectedId(0); setError('') }}
                onRegisterPayment={registerPayment}
                onDeliver={deliver}
                onNotifyReady={notifyReady}
              />
            ) : (
              <EmptyState icon={Glasses} title={pending ? 'Abriendo pedido…' : 'Selecciona un pedido'} description={error || 'Elige un pedido de la bandeja para ver su saldo, pagos e historial.'} />
            )}
          </div>
        </div>
      )}
      <Toast message={toast} onDismiss={() => setToast('')} />
    </div>
  )
}
