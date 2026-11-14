'use client'

import { Search } from 'lucide-react'
import { useState } from 'react'

import { formatAmount } from '@/features/orders/format'
import { orderStatus } from '@/features/orders/order-status'
import { cupToUsd, toUsd } from '@/features/orders/sale-currency'
import { Badge, Card, Input } from '@/shared/ui'

import { snapshotAge } from '../snapshot/expiry'
import type { OfflineOrder } from '../types'

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const dateFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })
const finished = (order: OfflineOrder) => order.commercialStatus === 'delivered' || order.commercialStatus === 'closed'

// Phase 6: answer «¿cuánto debo?» or «¿ya están mis espejuelos?» with no network. Read
// only, as of the last time the data was saved; amounts in USD like /orders.
export function OfflineOrdersList({ orders, confirmedAt }: { orders: OfflineOrder[]; confirmedAt: string }) {
  const [term, setTerm] = useState('')
  if (!orders.length) return null
  const query = fold(term.trim())
  const digits = term.replace(/\D/g, '')
  const visible = orders.filter((order) => !query
    || fold(order.orderNumber).includes(query) || fold(order.customerName).includes(query)
    || (digits.length >= 4 && (order.customerPhone ?? '').replace(/\D/g, '').includes(digits))).slice(0, 30)
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-[17px] font-semibold text-ink">Pedidos</h2>
        <p className="mt-1 text-sm text-text-muted">Como estaban con los datos guardados {snapshotAge(confirmedAt)}. Lo que pasó después se verá cuando vuelva la señal.</p>
      </div>
      <Input leadingIcon={Search} value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar por pedido, cliente o teléfono" aria-label="Buscar pedido" autoComplete="off" />
      <ul className="flex flex-col divide-y divide-line-soft">
        {visible.map((order) => {
          const status = orderStatus(order)
          const owes = !finished(order) && order.balanceCup > 0
          const rate = Number(order.saleRate)
          return (
            <li key={order.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <strong className="block truncate text-[15px] text-ink">{order.customerName}</strong>
                <span className="block text-[13px] text-text-muted">{order.orderNumber} · {dateFormat.format(new Date(order.createdAt))}{order.pairCount > 1 ? ` · ${order.pairCount} pares` : ''}</span>
                <Badge tone={status.tone} className="mt-1">{status.label}</Badge>
              </span>
              <span className="shrink-0 text-right">
                <span className={`block font-display text-[15px] font-bold tabular-nums ${owes ? 'text-coral-ink' : 'text-ink'}`}>{formatAmount(owes ? cupToUsd(order.balanceCup, rate) : toUsd(order.totalCup, rate))} USD</span>
                <span className="block text-[12px] text-text-muted">{owes ? 'Debe' : 'Total'}</span>
              </span>
            </li>
          )
        })}
      </ul>
      {!visible.length ? <p className="text-sm text-text-muted">Ningún pedido coincide con la búsqueda.</p> : null}
    </Card>
  )
}
