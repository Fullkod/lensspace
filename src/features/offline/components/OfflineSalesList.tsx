'use client'

import { Badge, Card, type Tone } from '@/shared/ui'

import type { OfflineSalePayload } from '../sale/payload'
import type { OfflineSale, OfflineSaleStatus } from '../types'
import { totalLabel } from './OfflinePaymentCard'

const statusLabels: Record<OfflineSaleStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Por subir', tone: 'warning' },
  uploading: { label: 'Subiendo', tone: 'progress' },
  uploaded: { label: 'Subida', tone: 'success' },
  retained: { label: 'Retenida', tone: 'danger' },
  discarded: { label: 'Descartada', tone: 'neutral' },
}

const timeFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function holderName(payload: OfflineSalePayload) {
  return 'new' in payload.holder ? payload.holder.new.fullName : 'Cliente guardado'
}

// Sales recorded on this device, newest first. Uninstalling the app or clearing the
// browser data deletes the ones not uploaded yet, so the screen says it.
export function OfflineSalesList({ sales, customerName }: { sales: OfflineSale[]; customerName: (id: number) => string | null }) {
  if (!sales.length) return null
  const waiting = sales.filter((sale) => sale.status === 'pending' || sale.status === 'retained').length
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-display text-[17px] font-semibold text-ink">Ventas guardadas en este teléfono</h2>
      {waiting ? <p className="text-sm text-text-muted">{waiting === 1 ? 'Hay 1 venta' : `Hay ${waiting} ventas`} sin subir. No borres los datos del navegador ni desinstales la app hasta que suban.</p> : null}
      <ul className="flex flex-col divide-y divide-line-soft">
        {[...sales].reverse().map((sale) => {
          const payload = sale.payload as OfflineSalePayload
          const status = statusLabels[sale.status]
          const name = 'id' in payload.holder ? customerName(payload.holder.id) ?? 'Cliente' : holderName(payload)
          return (
            <li key={sale.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="min-w-0">
                <strong className="block text-[15px] text-ink">{sale.orderNumber ?? sale.localNumber} · {name}</strong>
                <span className="block text-[13px] text-text-muted">{timeFormat.format(new Date(sale.createdAt))} · {totalLabel(payload.device.totals)}</span>
                {sale.status === 'retained' && sale.error ? <span className="block text-[13px] text-coral-ink">{sale.error}</span> : null}
              </span>
              <Badge tone={status.tone}>{status.label}</Badge>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
