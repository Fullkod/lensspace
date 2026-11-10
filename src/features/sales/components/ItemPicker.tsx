'use client'

import { Check } from 'lucide-react'

import { Field, Input, cx } from '@/shared/ui'

import type { SaleItem } from './sale-types'

const categoryLabels: Record<string, string> = {
  vision_type: 'Tipo de visión',
  lens_material: 'Material del cristal',
  treatment: 'Tratamiento',
  frame: 'Armadura',
  mounting: 'Montaje',
  adjustment: 'Ajuste',
}

type ItemPickerProps = {
  groupedItems: [string, SaleItem[]][]
  selected: number[]
  agreedPrices: Record<number, string>
  adjustmentReasons: Record<number, string>
  onToggle: (itemId: number) => void
  onAgreedPriceChange: (itemId: number, value: string) => void
  onAdjustmentReasonChange: (itemId: number, value: string) => void
  readOnlyPrices?: boolean
}

export function ItemPicker({ groupedItems, selected, agreedPrices, adjustmentReasons, onToggle, onAgreedPriceChange, onAdjustmentReasonChange, readOnlyPrices = false }: ItemPickerProps) {
  return (
    <div className="flex flex-col gap-5">
      {groupedItems.map(([category, categoryItems]) => (
        <div key={category}>
          <h3 className="mb-2.5 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">{categoryLabels[category] ?? 'Otro concepto'}</h3>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
            {categoryItems.map((item) => {
              const active = selected.includes(item.id)
              const agreedAmount = agreedPrices[item.id] ?? String(item.price)
              const isAdjusted = Number(agreedAmount) !== item.price
              return (
                <div key={item.id} className={cx('rounded-card border transition', active ? 'border-action bg-action-tint shadow-[0_0_0_1px_theme(colors.action.DEFAULT)]' : 'border-line-card bg-surface hover:border-line-hover')}>
                  <button type="button" aria-pressed={active} onClick={() => onToggle(item.id)} className="flex min-h-16 w-full items-start gap-3 rounded-card p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action">
                    <span aria-hidden="true" className={cx('mt-0.5 grid size-5 shrink-0 place-items-center rounded-badge border', active ? 'border-action bg-action text-white' : 'border-line-strong bg-surface')}>
                      {active ? <Check size={14} strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0">
                      <strong className="block font-display text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">{item.name}</strong>
                      <span className="mt-0.5 block text-sm font-semibold tabular-nums text-action">{readOnlyPrices ? '' : 'Base: '}{item.price.toLocaleString('es-CU')} {item.currency}</span>
                    </span>
                  </button>
                  {active && !readOnlyPrices ? (
                    <div className="flex flex-col gap-3 border-t border-line px-3.5 pb-3.5 pt-3">
                      <Field label={`Precio acordado (${item.currency})`}>
                        <Input type="number" inputMode="decimal" min="0" step="0.01" value={agreedAmount} onChange={(event) => onAgreedPriceChange(item.id, event.target.value)} numeric />
                      </Field>
                      {isAdjusted ? (
                        <Field label="Motivo del ajuste">
                          <Input minLength={5} maxLength={300} placeholder="Ej.: promoción o trabajo especial" value={adjustmentReasons[item.id] ?? ''} onChange={(event) => onAdjustmentReasonChange(item.id, event.target.value)} />
                        </Field>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
