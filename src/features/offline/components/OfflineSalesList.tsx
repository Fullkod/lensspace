'use client'

import { useState } from 'react'

import { Badge, Button, Card, type Tone } from '@/shared/ui'

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

// Sales recorded on this device, newest first. Uninstalling the app or clearing the
// browser data deletes the ones not uploaded yet, so the screen says it.
export function OfflineSalesList({ sales, customerName, needsLogin, onRetry, onDiscard }: {
  sales: OfflineSale[]
  customerName: (id: number) => string | null
  needsLogin: boolean
  onRetry: (sale: OfflineSale) => void
  onDiscard: (sale: OfflineSale) => void
}) {
  const [confirming, setConfirming] = useState<string | null>(null)
  if (!sales.length) return null
  const waiting = sales.filter((sale) => sale.status === 'pending' || sale.status === 'retained' || sale.status === 'uploading').length
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-display text-[17px] font-semibold text-ink">Ventas guardadas en este teléfono</h2>
      {waiting ? <p className="text-sm text-text-muted">{waiting === 1 ? 'Hay 1 venta' : `Hay ${waiting} ventas`} sin subir. No borres los datos del navegador ni desinstales la app hasta que suban.</p> : null}
      {needsLogin && waiting ? <p className="text-sm font-semibold text-coral-ink">Para subirlas, entra en LensSpace con tu cuenta: suben solas en cuanto haya señal.</p> : null}
      <ul className="flex flex-col divide-y divide-line-soft">
        {[...sales].reverse().map((sale) => {
          const payload = sale.payload as OfflineSalePayload
          const status = statusLabels[sale.status]
          const name = 'id' in payload.holder ? customerName(payload.holder.id) ?? 'Cliente' : payload.holder.new.fullName
          const canDiscard = sale.status === 'pending' || sale.status === 'retained'
          return (
            <li key={sale.id} className="flex flex-col gap-2 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <strong className="block text-[15px] text-ink">{sale.orderNumber ?? sale.localNumber} · {name}</strong>
                  <span className="block text-[13px] text-text-muted">{timeFormat.format(new Date(sale.createdAt))} · {totalLabel(payload.device.totals)}</span>
                </span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
              {sale.status === 'retained' && sale.error ? <p className="text-[13px] text-coral-ink">{sale.error}</p> : null}
              {canDiscard ? (
                <div className="flex flex-wrap gap-2">
                  {sale.status === 'retained' ? <Button size="sm" variant="secondary" onClick={() => onRetry(sale)}>Reintentar</Button> : null}
                  {confirming === sale.id ? (
                    <>
                      <Button size="sm" variant="danger" onClick={() => { setConfirming(null); onDiscard(sale) }}>Sí, descartar esta venta</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>No</Button>
                    </>
                  ) : <Button size="sm" variant="ghost" onClick={() => setConfirming(sale.id)}>Descartar</Button>}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
