'use client'

import { CircleCheck, Save } from 'lucide-react'

import { Alert, Button, Card } from '@/shared/ui'

import type { MultiPriceResult, PriceResult } from './sale-types'

const amount = (value: number) => Number(value).toLocaleString('es-CU', { maximumFractionDigits: 2 })
const totalsLabel = (totals: Record<string, number>) => Object.entries(totals).map(([currency, total]) => `${amount(total)} ${currency}`).join(' + ') || '—'

type QuoteSummaryProps = {
  preview: MultiPriceResult | null
  pairLabels: string[]
  pairEstimates: Record<string, number>[]
  estimate: Record<string, number>
  estimateCup: number
  rate: number
  selectedCount: number
  quotationId: number | null
  pending: boolean
  canOperate: boolean
  canAccept: boolean
  message: string
  onAccept: () => void
}

function PricedLines({ pricing }: { pricing: PriceResult }) {
  return <>
    {pricing.lineItems.map((line, index) => (
      <div key={index} className="text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-text-secondary">{line.name}</span>
          <strong className="whitespace-nowrap font-display tabular-nums text-ink">{amount(line.amount)} {line.currency}</strong>
        </div>
        {Number(line.baseAmount) !== Number(line.amount) ? (
          <p className="mt-1 text-[13px] text-text-muted">Base {amount(line.baseAmount)} {line.currency} · {line.adjustmentReason}</p>
        ) : null}
      </div>
    ))}
  </>
}

// Lives inside the sale <form>: "Guardar cotización" submits it, while "Cliente acepta"
// saves (when needed) and creates the order in one tap. With several pairs each one is
// listed with its subtotal; the order total is their sum.
export function QuoteSummary({ preview, pairLabels, pairEstimates, estimate, estimateCup, rate, selectedCount, quotationId, pending, canOperate, canAccept, message, onAccept }: QuoteSummaryProps) {
  const multi = pairLabels.length > 1
  const estimateTotals = Object.entries(estimate)
  return (
    <Card padded={false} className="h-fit overflow-hidden xl:sticky xl:top-6">
      <div className="border-b border-line-soft px-5 py-4">
        <h2 className="font-display text-[17px] font-semibold text-ink">Cotización</h2>
        <p className="mt-0.5 text-[13px] text-text-muted">
          {multi ? `${pairLabels.length} pares · ` : ''}{selectedCount === 1 ? '1 concepto seleccionado' : `${selectedCount} conceptos seleccionados`}
        </p>
      </div>
      <div className="flex flex-col gap-4 p-5">
        {preview ? (
          <>
            {multi ? preview.lines.map((line) => (
              <div key={line.lineNumber} className="flex flex-col gap-2 rounded-control border border-line-soft p-3">
                <p className="text-[13px] font-semibold text-ink">{pairLabels[line.lineNumber - 1] ?? `Par ${line.lineNumber}`}</p>
                <PricedLines pricing={line.pricing} />
                <p className="flex justify-between border-t border-line-soft pt-2 text-sm text-text-secondary"><span>Subtotal</span><strong className="font-display tabular-nums text-ink">{totalsLabel(line.pricing.totals)}</strong></p>
              </div>
            )) : preview.lines[0] ? <PricedLines pricing={preview.lines[0].pricing} /> : null}
            <div className="border-t border-dashed border-line pt-3">
              {Object.entries(preview.totals).map(([currency, total]) => (
                <p key={currency} className="flex justify-between font-display text-2xl font-bold tabular-nums tracking-[-0.02em] text-ink">
                  <span>Total</span>
                  <span>{amount(total)} <span className="text-sm font-medium text-text-muted">{currency}</span></span>
                </p>
              ))}
              {preview.cupEquivalent !== null && preview.totals.CUP && rate > 0 ? <p className="mt-1.5 text-right text-[13px] text-text-muted">Equivalente: {amount(Math.round((preview.cupEquivalent / rate) * 100) / 100)} USD</p> : null}
            </div>
            {/* Catalog advisories inform; they never block the sale. */}
            {preview.warnings.map((warning, index) => (
              <Alert key={index} tone="warning">{multi && warning.lineNumber ? `${pairLabels[warning.lineNumber - 1] ?? `Par ${warning.lineNumber}`}: ` : ''}{warning.message}</Alert>
            ))}
          </>
        ) : estimateTotals.length ? (
          <div className="flex flex-col gap-1.5">
            {multi ? pairEstimates.map((totals, index) => (
              <p key={index} className="flex justify-between gap-3 text-sm text-text-secondary"><span className="truncate">{pairLabels[index]}</span><span className="shrink-0 font-display tabular-nums text-ink">{totalsLabel(totals)}</span></p>
            )) : null}
            {estimateTotals.map(([currency, total]) => (
              <p key={currency} className="flex justify-between font-display text-2xl font-bold tabular-nums tracking-[-0.02em] text-ink">
                <span>Total estimado</span>
                <span>{amount(total)} <span className="text-sm font-medium text-text-muted">{currency}</span></span>
              </p>
            ))}
            {estimate.CUP && rate > 0 ? <p className="text-right text-[13px] text-text-muted">Equivalente: {amount(Math.round((estimateCup / rate) * 100) / 100)} USD</p> : null}
            <p className="text-[13px] text-text-muted">Se confirma al crear el pedido; puede incluir recargos por graduación.</p>
          </div>
        ) : (
          <p className="rounded-control border border-dashed border-line p-5 text-sm text-text-muted">Elige cliente y conceptos para ver el total.</p>
        )}
        <Button variant="ink" icon={CircleCheck} block onClick={onAccept} disabled={pending || !canOperate || !canAccept}>{pending ? 'Procesando…' : 'Cliente acepta · crear pedido'}</Button>
        {!quotationId ? <Button type="submit" variant="secondary" icon={Save} block disabled={pending || !canOperate}>{pending ? 'Guardando…' : 'Guardar cotización'}</Button> : null}
        {message ? <Alert tone="info">{message}</Alert> : null}
      </div>
    </Card>
  )
}
