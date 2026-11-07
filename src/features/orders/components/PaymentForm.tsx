'use client'

import { Banknote } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'

import { Button, Field, Input, SegmentedControl, cx } from '@/shared/ui'
import { newRequestId } from '@/shared/utils/request-id'

import { formatAmount } from '../format'
import { cupToUsd, formatInCurrency, type Currency } from '../sale-currency'

export type PaymentInput = { amount: number; currency: Currency; rate: number; notes: string; requestId: string }

type PaymentFormProps = { balanceCup: number; saleRate: number; saleCurrency: Currency; pending: boolean; onSubmit: (input: PaymentInput) => Promise<boolean> }

// Live equivalence and over-balance feedback are informative; the server RPC still
// rejects overpayments, validates every field and values USD at the sale rate.
export function PaymentForm({ balanceCup, saleRate, saleCurrency, pending, onSubmit }: PaymentFormProps) {
  const [currency, setCurrency] = useState<Currency>(saleCurrency)
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  // One id per payment attempt, reused on retry so a lost response never stores the
  // payment twice; a synchronous flag blocks bursts before `pending` re-renders.
  const requestId = useRef<string | null>(null)
  const submitting = useRef(false)

  const numericAmount = Number(amount) || 0
  const numericRate = currency === 'USD' ? saleRate : 1
  const equivalent = numericAmount * numericRate
  // A USD payment rounded up to the cent may exceed the balance by less than one cent
  // (product decision, mirrored by the server); anything beyond is an overpayment.
  const tolerance = currency === 'USD' && balanceCup > 0 ? numericRate * 0.01 : 0.001
  const over = equivalent - balanceCup >= tolerance
  const canSubmit = numericAmount > 0 && numericRate > 0 && !over && !pending

  const inSale = (cup: number) => formatInCurrency(cup, saleCurrency, saleRate)
  // Mixed/CUP sales paid in USD still show the CUP equivalent of the payment.
  const prefix = currency === 'USD' && saleCurrency === 'CUP' ? `= ${formatAmount(equivalent)} CUP · ` : ''
  const sentence = (text: string) => (prefix ? `${prefix}${text}` : text.charAt(0).toUpperCase() + text.slice(1))
  const feedback = over
    ? `Supera el saldo en ${inSale(equivalent - balanceCup)}`
    : numericAmount && equivalent >= balanceCup
      ? sentence('salda el pedido')
      : numericAmount
        ? sentence(`quedarían ${inSale(balanceCup - equivalent)}`)
        : `Saldo actual ${inSale(balanceCup)}`

  function fillBalance() {
    const value = currency === 'USD' ? cupToUsd(balanceCup, saleRate) : balanceCup
    requestId.current = null
    setAmount(String(value))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || submitting.current) return
    submitting.current = true
    requestId.current ??= newRequestId()
    try {
      const saved = await onSubmit({ amount: numericAmount, currency, rate: numericRate, notes, requestId: requestId.current })
      if (saved) { setAmount(''); setNotes(''); requestId.current = null }
    } finally {
      submitting.current = false
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5 rounded-card border border-line-card bg-field px-4 py-4 md:px-5 md:py-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h3 className="font-display text-[17px] font-semibold text-ink">Registrar efectivo</h3>
        <Button variant="secondary" size="sm" onClick={fillBalance}>Cobrar saldo completo</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field as="div" label="Importe" className="sm:col-span-2">
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => { requestId.current = null; setAmount(event.target.value) }}
              placeholder="0"
              aria-label="Importe del pago"
              invalid={over}
              numeric
              controlSize="lg"
              required
              className="flex-1"
            />
            <SegmentedControl label="Moneda del pago" value={currency} onChange={(value) => { requestId.current = null; setCurrency(value) }} options={[{ value: 'CUP', label: 'CUP' }, { value: 'USD', label: 'USD' }]} />
          </div>
        </Field>
        {currency === 'USD' ? (
          <Field as="div" label="Tasa de la venta">
            <p className="flex min-h-[48px] items-center font-display text-[15px] font-semibold tabular-nums text-ink">1 USD = {formatAmount(saleRate)} CUP</p>
          </Field>
        ) : null}
        <Field label="Nota" optional className={currency === 'USD' ? undefined : 'sm:col-span-2'}>
          <Input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Ej. entregó en billetes de 1000" controlSize="lg" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p aria-live="polite" className={cx('text-sm tabular-nums', over ? 'font-semibold text-coral-ink' : 'font-medium text-text-secondary')}>{feedback}</p>
        <Button type="submit" icon={Banknote} disabled={!canSubmit} className="w-full sm:w-auto">{pending ? 'Registrando…' : 'Registrar pago'}</Button>
      </div>
    </form>
  )
}
