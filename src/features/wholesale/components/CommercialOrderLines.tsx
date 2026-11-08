'use client'

import { ChevronDown, Trash2 } from 'lucide-react'

import { formatDateTime } from '@/features/orders/format'
import { Badge, Button, Card } from '@/shared/ui'

import type { CommercialLine } from '../order-types'
import { formatPrice } from '../types'

const subtotal = (line: CommercialLine) => Object.entries(line.totals).map(([currency, total]) => formatPrice(Number(total), currency)).join(' + ')

// Jobs of a commercial order, collapsible, newest-added last. Removed jobs stay visible
// (struck) with who removed them and why.
export function CommercialOrderLines({ lines, canRemove, onRemove }: { lines: CommercialLine[]; canRemove: boolean; onRemove: (line: CommercialLine) => void }) {
  const active = lines.filter((line) => !line.removedAt)
  return <Card className="flex flex-col gap-3">
    <h2 className="font-display text-[17px] font-semibold text-ink">Trabajos <span className="text-text-muted">({active.length})</span></h2>
    {lines.length === 0 ? <p className="text-sm text-text-muted">Aún no hay trabajos. Usa «Agregar trabajo» para el primero.</p>
      : <div className="flex flex-col gap-2">
        {lines.map((line) => <details key={line.id} className="group rounded-card border border-line bg-surface" open={lines.length <= 3}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action">
            <div className="flex min-w-0 flex-1 basis-full flex-col gap-1 sm:basis-0">
              <span className={line.removedAt ? 'truncate text-[15px] font-semibold text-text-muted line-through' : 'truncate text-[15px] font-semibold text-ink'}>Trabajo {line.lineNumber} · {line.patientName ?? 'Paciente'}</span>
              <div className="flex flex-wrap gap-1.5">
                {line.removedAt ? <Badge tone="danger">Quitado</Badge> : null}
                {line.deliveredAt ? <Badge tone="success">Entregado</Badge> : null}
                {!line.removedAt && !line.deliveredAt && line.hasProduction ? <Badge tone="progress">En producción</Badge> : null}
                {!line.prescriptionRevisionId ? <Badge>Sin receta</Badge> : null}
              </div>
            </div>
            <span className="font-display text-[15px] font-bold tabular-nums text-ink">{subtotal(line)}</span>
            <ChevronDown aria-hidden="true" size={18} className="text-text-muted transition group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-3 border-t border-line-soft px-4 pb-4 pt-3">
            <ul className="flex flex-col gap-1.5">
              {line.items.map((item, index) => <li key={index} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 text-text">{item.name}{item.adjustmentReason ? <span className="block text-[13px] text-text-muted">Ajuste: {item.adjustmentReason}</span> : null}</span>
                <span className="shrink-0 tabular-nums text-ink">{formatPrice(Number(item.amount), item.currency)}</span>
              </li>)}
            </ul>
            <p className="text-[13px] text-text-muted">
              Agregado por {line.addedByName ?? 'Usuario'} · {formatDateTime(line.addedAt)}
              {line.deliveredAt ? <><br />Entregado por {line.deliveredByName ?? 'Usuario'} · {formatDateTime(line.deliveredAt)}</> : null}
              {line.removedAt ? <><br />Quitado por {line.removedByName ?? 'Usuario'} · {formatDateTime(line.removedAt)}: {line.removalReason}</> : null}
            </p>
            {canRemove && !line.removedAt && !line.hasProduction ? <Button variant="ghost" size="sm" icon={Trash2} className="self-start" onClick={() => onRemove(line)}>Quitar trabajo</Button> : null}
          </div>
        </details>)}
      </div>}
  </Card>
}
