'use client'

import { WifiOff } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { Alert } from '@/shared/ui'

type Flag = { type: string; [key: string]: unknown }
type OfflineSaleRow = { local_number: string; sold_at: string; uploaded_at: string; flags: Flag[] }

const dateFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const amountFormat = new Intl.NumberFormat('es-CU', { maximumFractionDigits: 2 })

function totals(value: unknown) {
  return Object.entries((value ?? {}) as Record<string, number>).map(([currency, amount]) => `${amountFormat.format(amount)} ${currency}`).join(' + ') || '—'
}

// What record_offline_sale noted instead of refusing the sale (LEN0011, D4).
function flagText(flag: Flag) {
  switch (flag.type) {
    case 'price_mismatch': return `El precio cambió entre la venta y la subida: el teléfono calculó ${totals(flag.deviceTotals)} y LensSpace ${totals(flag.serverTotals)}.`
    case 'overpaid': return `Se cobró más que el total que calculó LensSpace (${amountFormat.format(Number(flag.paidCup))} CUP de ${amountFormat.format(Number(flag.orderCup))} CUP). Revisa si hay que devolver la diferencia.`
    case 'possible_duplicate_customer': return `${String(flag.name ?? 'El cliente')} puede estar repetido: ya había un cliente con el mismo teléfono en la sucursal.`
    case 'clock_skew': return 'La hora del teléfono estaba adelantada; la venta quedó con la hora en que se subió.'
    case 'late_upload': return 'La venta se subió más de 8 días después de hacerse.'
    default: return 'Hay algo que revisar en esta venta.'
  }
}

// Shown in the order detail when the order came from an offline sale: when it was sold,
// when it reached the server and anything to review. One small RLS-scoped read.
export function OfflineSaleNotice({ orderId }: { orderId: number }) {
  const supabase = useMemo(() => createClient(), [])
  const [sale, setSale] = useState<OfflineSaleRow | null>(null)

  useEffect(() => {
    let cancelled = false
    void supabase.from('offline_sales').select('local_number, sold_at, uploaded_at, flags').eq('order_id', orderId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setSale((data as unknown as OfflineSaleRow | null) ?? null) })
    return () => { cancelled = true }
  }, [orderId, supabase])

  if (!sale) return null
  return (
    <Alert tone={sale.flags.length ? 'warning' : 'info'} icon={WifiOff} title={`Venta sin conexión ${sale.local_number}`}>
      Se hizo el {dateFormat.format(new Date(sale.sold_at))} y llegó a LensSpace el {dateFormat.format(new Date(sale.uploaded_at))}.
      {sale.flags.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {sale.flags.map((flag, index) => <li key={index}>{flagText(flag)}</li>)}
        </ul>
      ) : null}
    </Alert>
  )
}
