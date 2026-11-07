'use client'

import { Search, SearchX, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'

import { Badge, Button, Card, CardHeader, Dialog, EmptyState, Field, FilterChips, IconButton, Input, ListItem, cx } from '@/shared/ui'

import { FINISHED_ORDERS_DAYS, formatAmount, formatShortDate, shortOrderNumber } from '../format'
import { isFinished, orderStatus } from '../order-status'
import type { Order } from '../types'

type Chip = 'all' | 'balance' | 'deliver' | 'done'
const chipDefinitions: { value: Chip; label: string; matches: (order: Order) => boolean }[] = [
  { value: 'all', label: 'Todos', matches: () => true },
  { value: 'balance', label: 'Con saldo', matches: (order) => !isFinished(order) && order.balanceCup > 0 },
  { value: 'deliver', label: 'Por entregar', matches: (order) => !isFinished(order) && order.balanceCup <= 0 },
  { value: 'done', label: 'Entregados', matches: isFinished },
]

type OrdersInboxProps = {
  orders: Order[]
  selectedId: number
  onSelect: (orderId: number) => void
  initialQuery: string
  // Exact customer id from /orders?clienteId=…, applied only while the query is untouched (avoids mixing homonyms).
  initialCustomerId?: number
  // True when finished orders are limited to the last FINISHED_ORDERS_DAYS days.
  finishedWindowed?: boolean
  className?: string
}

export function OrdersInbox({ orders, selectedId, onSelect, initialQuery, initialCustomerId, finishedWindowed = false, className }: OrdersInboxProps) {
  const [query, setQuery] = useState(initialQuery)
  const [chip, setChip] = useState<Chip>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const customerId = query === initialQuery ? initialCustomerId : undefined
  const term = query.trim().toLocaleLowerCase('es')
  // LEN0007: 4+ digits also match any part of the customer's numbers (5307 → +53 5307 7035).
  const digits = term.replace(/\D/g, '')
  const base = orders.filter((order) => {
    const day = order.createdAt.slice(0, 10)
    const matchesTerm = !term
      || order.customerName.toLocaleLowerCase('es').includes(term)
      || (digits.length >= 4 && order.customerPhoneDigits.includes(digits))
    return (!customerId || order.customerId === customerId)
      && matchesTerm
      && (!dateFrom || day >= dateFrom)
      && (!dateTo || day <= dateTo)
  })
  const activeChip = chipDefinitions.find((definition) => definition.value === chip) ?? chipDefinitions[0]
  const visible = base.filter(activeChip.matches)
  const resultLabel = visible.length === 1 ? '1 pedido' : `${visible.length} pedidos`
  const dateFilterCount = Number(Boolean(dateFrom)) + Number(Boolean(dateTo))
  const clear = () => { setQuery(''); setChip('all'); setDateFrom(''); setDateTo('') }

  return (
    <Card padded={false} className={cx('overflow-hidden', className)}>
      <div className="flex flex-col gap-3 border-b border-line-soft px-4 pb-3.5 pt-[18px] md:px-[18px]">
        <CardHeader title="Bandeja de pedidos" meta={resultLabel} />
        <div className="flex gap-2">
          <Input leadingIcon={Search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o teléfono" aria-label="Buscar por nombre o teléfono del cliente" className="flex-1" />
          <IconButton icon={SlidersHorizontal} label="Filtrar por fecha" count={dateFilterCount} onClick={() => setFiltersOpen(true)} />
        </div>
        <FilterChips label="Filtrar por estado" value={chip} onChange={setChip} chips={chipDefinitions.map(({ value, label, matches }) => ({ value, label, count: base.filter(matches).length }))} />
      </div>
      <div className="xl:max-h-[68vh] xl:overflow-y-auto">
        {finishedWindowed && chip === 'done' ? <p className="border-b border-line-soft px-4 py-2.5 text-[13px] text-text-muted md:px-[18px]">Entregados de los últimos {FINISHED_ORDERS_DAYS} días. El historial completo está en la ficha de cada cliente.</p> : null}
        {visible.map((order, index) => {
          const status = orderStatus(order)
          const owes = !isFinished(order) && order.balanceCup > 0
          return (
            <ListItem
              key={order.id}
              avatarName={order.customerName}
              title={order.customerName}
              meta={`${shortOrderNumber(order.orderNumber)} · ${formatShortDate(order.createdAt)}${order.customerPhone ? ` · ${order.customerPhone}` : ''}`}
              trailing={<span className={cx('whitespace-nowrap font-display text-[15.5px] font-bold tabular-nums', owes ? 'text-coral-ink' : 'text-ink')}>{formatAmount(owes ? order.balanceCup : order.totalCup)}</span>}
              badge={<Badge tone={status.tone}>{status.label}</Badge>}
              selected={order.id === selectedId}
              onSelect={() => onSelect(order.id)}
              last={index === visible.length - 1}
            />
          )
        })}
        {!visible.length ? (
          <div className="p-4">
            <EmptyState icon={SearchX} title="Sin pedidos con estos filtros" action={<Button variant="ghost" onClick={clear}>Limpiar filtros</Button>} />
          </div>
        ) : null}
      </div>

      <Dialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        eyebrow="Filtros"
        title="Filtrar por fecha"
        size="md"
        footer={<>
          <Button variant="ghost" onClick={clear} className="mr-auto">Limpiar todo</Button>
          <Button onClick={() => setFiltersOpen(false)}>Ver {resultLabel}</Button>
        </>}
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Desde"><Input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /></Field>
          <Field label="Hasta"><Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></Field>
          <p className="text-[13px] text-text-muted sm:col-span-2">El estado se filtra con los botones rápidos de la bandeja.</p>
        </div>
      </Dialog>
    </Card>
  )
}
