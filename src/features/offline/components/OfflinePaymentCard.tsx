'use client'

import { Card, Field, Input, SegmentedControl } from '@/shared/ui'

export type PaymentDraft = { currency: 'USD' | 'CUP'; amount: string }

const amountFormat = new Intl.NumberFormat('es-CU', { maximumFractionDigits: 2 })

export function totalLabel(totals: Record<string, number>) {
  const entries = Object.entries(totals)
  return entries.length ? entries.map(([currency, total]) => `${amountFormat.format(total)} ${currency}`).join(' + ') : '—'
}

// Cash received at the counter. Optional: a sale can be saved with nothing paid yet.
export function OfflinePaymentCard({ estimate, estimateCup, rate, payment, onChange }: {
  estimate: Record<string, number>
  estimateCup: number
  rate: number
  payment: PaymentDraft
  onChange: (payment: PaymentDraft) => void
}) {
  const paid = Number(payment.amount.replace(',', '.')) || 0
  const paidCup = payment.currency === 'USD' ? paid * (rate || 0) : paid
  const remainingCup = Math.max(estimateCup - paidCup, 0)
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-[17px] font-semibold text-ink">Cobro en efectivo</h2>
        <p className="mt-1 text-sm text-text-muted">Total estimado con el catálogo guardado: {totalLabel(estimate)} ({amountFormat.format(estimateCup)} CUP). Al subir la venta, LensSpace lo confirma.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <SegmentedControl label="Moneda del cobro" value={payment.currency} onChange={(currency) => onChange({ ...payment, currency })} options={[{ value: 'CUP', label: 'CUP' }, { value: 'USD', label: 'USD' }]} />
        <Field label="Recibido" optional className="w-40">
          <Input value={payment.amount} onChange={(event) => onChange({ ...payment, amount: event.target.value })} inputMode="decimal" numeric placeholder="0" />
        </Field>
      </div>
      {paid > 0 ? (
        <p className="text-sm text-text-secondary">
          {payment.currency === 'USD' ? `Equivale a ${amountFormat.format(paidCup)} CUP. ` : ''}
          {remainingCup > 0 ? `Queda pendiente ${amountFormat.format(remainingCup)} CUP.` : 'La venta queda pagada.'}
        </p>
      ) : null}
    </Card>
  )
}
