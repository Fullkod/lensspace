'use client'

import { ChevronDown, Glasses } from 'lucide-react'

import { formatAmount } from '../format'
import { formatTotals } from '../sale-currency'
import type { OrderPair } from '../types'

// Family order (LEN0006): one collapsible card per pair with its patient, prescription,
// concepts and subtotal. Payments and balance stay at the order level.
export function OrderPairs({ pairs }: { pairs: OrderPair[] }) {
  return (
    <section aria-labelledby="order-pairs-title" className="flex flex-col gap-2.5">
      <h3 id="order-pairs-title" className="flex items-center gap-2 font-display text-[17px] font-semibold text-ink">
        <Glasses aria-hidden="true" size={18} className="text-action" />
        {pairs.length} pares en este pedido
      </h3>
      {pairs.map((pair) => (
        <details key={pair.id} className="group rounded-card border border-line-card">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-text-muted">Par {pair.lineNumber}</span>
              <span className="block font-semibold text-ink [overflow-wrap:anywhere]">{pair.patientName}</span>
            </span>
            <span className="shrink-0 text-right font-display text-[15px] font-bold tabular-nums text-ink">{formatTotals(pair.totals) || '—'}</span>
            <ChevronDown aria-hidden="true" size={18} className="shrink-0 text-text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-1.5 border-t border-line-soft px-4 py-3 text-sm">
            <p className="text-[13px] text-text-muted">{pair.prescriptionLabel ?? 'Sin receta asociada'}</p>
            {pair.items.map((item, index) => (
              <p key={index} className="flex justify-between gap-3">
                <span className="text-text-secondary">{item.name}</span>
                <span className="whitespace-nowrap tabular-nums text-ink">{formatAmount(item.amount)} {item.currency}</span>
              </p>
            ))}
          </div>
        </details>
      ))}
    </section>
  )
}
