'use client'

import { Wallet } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { formatDateTime } from '@/features/orders/format'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/shared/lib/friendly-error'
import { newRequestId } from '@/shared/utils/request-id'
import { Alert, Button, Card, Dialog, Field, Input, SegmentedControl } from '@/shared/ui'

import { balanceUsd, formatUsd, type CommercialOrderSummary } from '../order-types'
import { formatPrice, parseDecimal } from '../types'

type Currency = 'USD' | 'CUP'
type Collection = { collectionId: string; receivedAt: string; receivedByName: string | null; currency: string; amount: number; notes: string | null; orders: { orderId: number; orderNumber: string; amount: number }[] }

const round2 = (value: number) => Math.round(value * 100) / 100
// Balance of one order in the collection currency (orders keep a CUP equivalent at their rate).
const balanceIn = (order: CommercialOrderSummary, currency: Currency) =>
  currency === 'USD' ? balanceUsd(order) : round2(Math.max(Number(order.cupEquivalent) - Number(order.paidCup), 0))

// Oldest debt first, never above an order's balance.
function fifo(orders: CommercialOrderSummary[], amount: number, currency: Currency) {
  let left = round2(amount)
  return Object.fromEntries(orders.map((order) => {
    const share = round2(Math.min(left, balanceIn(order, currency)))
    left = round2(left - share)
    return [order.id, share > 0 ? String(share).replace('.', ',') : '']
  }))
}

// LEN0010: collect from a retail optician. One amount in the receiver's cashbox, split
// across its orders with balance (oldest first by default, editable).
export function AccountCollections({ accountId, accountName, orders, startOpen }: { accountId: number; accountName: string; orders: CommercialOrderSummary[]; startOpen: boolean }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const owing = useMemo(() => orders.filter((order) => balanceUsd(order) > 0).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [orders])
  const [collections, setCollections] = useState<Collection[] | null>(null)
  const [open, setOpen] = useState(false)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [amount, setAmount] = useState('')
  const [shares, setShares] = useState<Record<number, string>>({})
  const [notes, setNotes] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const requestId = useRef(newRequestId())
  const debt = owing.reduce((sum, order) => sum + balanceIn(order, currency), 0)

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('list_account_collections', { target_account_id: accountId } as never)
    setCollections((data ?? []) as unknown as Collection[])
  }, [accountId, supabase])

  // Deferred like the other loaders; "?cobrar=1" opens the dialog after hydration.
  const autoOpened = useRef(false)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
      if (startOpen && owing.length && !autoOpened.current) { autoOpened.current = true; setOpen(true) }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load, startOpen, owing.length])

  function changeAmount(value: string) {
    setAmount(value)
    const parsed = parseDecimal(value)
    setShares(parsed && !Number.isNaN(parsed) ? fifo(owing, parsed, currency) : {})
  }

  function changeCurrency(value: Currency) {
    setCurrency(value); setAmount(''); setShares({})
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const total = parseDecimal(amount)
    if (total === null || Number.isNaN(total) || total <= 0) return setError('Escribe el importe cobrado.')
    const allocations = owing.flatMap((order) => {
      const share = parseDecimal(shares[order.id] ?? '')
      return share && !Number.isNaN(share) ? [{ orderId: order.id, amount: share }] : []
    })
    const allocated = round2(allocations.reduce((sum, entry) => sum + entry.amount, 0))
    if (allocated !== round2(total)) return setError(`El reparto suma ${formatPrice(allocated, currency)} y el cobro es ${formatPrice(total, currency)}.`)
    setPending(true); setError(null)
    const { error: saveError } = await supabase.rpc('record_account_collection', {
      target_account_id: accountId, collection_amount: total, collection_currency: currency, allocations,
      collection_notes: notes, request_id: requestId.current,
    } as never)
    setPending(false)
    if (saveError) return setError(friendlyError(saveError, 'No pudimos registrar el cobro.'))
    requestId.current = newRequestId()
    setOpen(false); setAmount(''); setShares({}); setNotes('')
    setMessage(`Cobro de ${formatPrice(total, currency)} registrado en tu caja.`)
    await load()
    router.refresh()
  }

  return <Card className="flex flex-col gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="font-display text-[17px] font-semibold text-ink">Cobros de {accountName}</h2>
        <p className="text-[13px] text-text-muted">Debe <strong className="text-ink">{formatUsd(owing.reduce((sum, order) => sum + balanceUsd(order), 0))}</strong>{owing.length ? ` en ${owing.length === 1 ? '1 pedido' : `${owing.length} pedidos`}` : ''}.</p>
      </div>
      {owing.length ? <Button icon={Wallet} onClick={() => { setOpen(true); setError(null) }}>Cobrar</Button> : null}
    </div>
    {message ? <Alert tone="success">{message}</Alert> : null}
    {collections === null ? <p className="text-sm text-text-muted">Cargando cobros…</p>
      : collections.length === 0 ? <p className="text-sm text-text-muted">Aún no hay cobros de esta óptica.</p>
      : <div className="overflow-hidden rounded-card border border-line">
        {collections.map((entry) => <div key={entry.collectionId} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-line-soft px-4 py-3 last:border-b-0">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] text-text-muted">{formatDateTime(entry.receivedAt)} · {entry.receivedByName ?? 'Usuario'}</span>
            <span className="text-[13px] text-text">{entry.orders.map((order) => `${order.orderNumber}: ${formatPrice(Number(order.amount), entry.currency)}`).join(' · ')}</span>
            {entry.notes ? <span className="text-[13px] text-text-muted">{entry.notes}</span> : null}
          </div>
          <span className="font-display text-[15px] font-bold tabular-nums text-ink">{formatPrice(Number(entry.amount), entry.currency)}</span>
        </div>)}
      </div>}

    <Dialog open={open} onClose={() => { if (!pending) setOpen(false) }} eyebrow={accountName} title="Cobrar a la óptica" icon={Wallet} size="md"
      footer={<>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
        <Button type="submit" form="account-collection" disabled={pending}>{pending ? 'Guardando…' : 'Registrar cobro'}</Button>
      </>}>
      <form id="account-collection" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Importe cobrado" className="min-w-[140px] flex-1" help={`Deuda total: ${formatPrice(round2(debt), currency)}`}>
            <Input value={amount} onChange={(event) => changeAmount(event.target.value)} inputMode="decimal" maxLength={12} autoComplete="off" />
          </Field>
          <SegmentedControl label="Moneda" value={currency} onChange={changeCurrency} options={[{ value: 'USD', label: 'USD' }, { value: 'CUP', label: 'CUP' }]} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-text-label">Se aplica a (primero los más antiguos)</span>
          {owing.map((order) => <div key={order.id} className="flex items-center gap-3 rounded-control border border-line bg-field px-3.5 py-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-semibold text-ink">{order.orderNumber}</span>
              <span className="text-[13px] text-text-muted">Debe {formatPrice(balanceIn(order, currency), currency)}</span>
            </div>
            <div className="w-28 shrink-0">
              <Input aria-label={`Importe para ${order.orderNumber}`} value={shares[order.id] ?? ''} onChange={(event) => setShares((current) => ({ ...current, [order.id]: event.target.value }))} inputMode="decimal" maxLength={12} autoComplete="off" />
            </div>
          </div>)}
        </div>
        <Field label="Nota" optional><Input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} autoComplete="off" /></Field>
        <p className="text-[13px] text-text-muted">El dinero entra en tu caja de hoy, como cualquier cobro.</p>
        {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
      </form>
    </Dialog>
  </Card>
}
