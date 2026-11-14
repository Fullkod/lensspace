import { createClient } from '@/lib/supabase/client'
import { isNetworkError } from '@/shared/lib/friendly-error'

import { indexedDbStore } from '../store/indexeddb-store'
import type { OfflineSale } from '../types'

const KEEP_UPLOADED_MS = 7 * 24 * 60 * 60 * 1000 // the desk shows the week's uploads
// Postgres errors that mean «the server refused this sale»: keep it on the device (D8).
const REFUSALS: Record<string, string> = {
  '42501': 'LensSpace no aceptó la venta: tu usuario ya no puede vender en esta sucursal o la organización está en solo lectura. Habla con el dueño.',
  '22023': 'La venta está incompleta. Revisa sus datos con el dueño.',
  P0002: 'Falta un dato de la venta en LensSpace (cliente, receta o producto). Revísala con el dueño.',
}

type UploadResult = { orderId: number; orderNumber: string; flags: unknown[]; duplicate: boolean }
// needsLogin: the sales wait for their seller's session; they upload by themselves after it.
export type UploadSummary = { uploaded: number; retained: number; pending: number; needsLogin: boolean }

let running: Promise<UploadSummary> | null = null

function refusalMessage(error: { code?: string; message?: string }) {
  if (error.code && REFUSALS[error.code]) return REFUSALS[error.code]
  return `LensSpace no aceptó la venta: ${error.message?.trim() || 'motivo desconocido'}.`
}

// Uploads this user's pending sales one by one, oldest first (Kshop D9: serial, small).
// A network failure stops the round and keeps the sale pending; a refusal retains it
// with the reason. A sale is never removed before the server confirms it.
export function uploadPendingSales(userId: string): Promise<UploadSummary> {
  if (running) return running
  running = (async () => {
    const store = indexedDbStore
    const supabase = createClient()
    const summary: UploadSummary = { uploaded: 0, retained: 0, pending: 0, needsLogin: false }
    const { data: { session } } = await supabase.auth.getSession()
    const sales = await store.listSales(userId)
    for (const sale of sales) {
      if (sale.status === 'uploaded' && Date.now() - new Date(sale.updatedAt).getTime() > KEEP_UPLOADED_MS) await store.deleteSale(sale.id)
    }
    const queue = sales.filter((sale) => sale.status === 'pending' || sale.status === 'uploading')
    for (const [index, sale] of queue.entries()) {
      if (!session || session.user.id !== sale.userId) {
        if (sale.status === 'uploading') await save(sale, { status: 'pending' })
        summary.pending++
        summary.needsLogin = true
        continue
      }
      await save(sale, { status: 'uploading' })
      const { data, error } = await supabase.rpc('record_offline_sale', { sale_id: sale.id, sale: sale.payload } as never)
      if (error && (isNetworkError(error) || !error.code || error.code === '40001' || error.code.startsWith('5') || error.code.startsWith('08'))) {
        await save(sale, { status: 'pending' })
        summary.pending += queue.length - index
        break
      }
      if (error) {
        await save(sale, { status: 'retained', error: refusalMessage(error) })
        summary.retained++
        continue
      }
      const result = data as unknown as UploadResult
      await save(sale, { status: 'uploaded', orderId: result.orderId, orderNumber: result.orderNumber, error: undefined })
      summary.uploaded++
    }
    return summary
  })().finally(() => { running = null })
  return running
}

async function save(sale: OfflineSale, patch: Partial<OfflineSale>) {
  Object.assign(sale, patch, { updatedAt: new Date().toISOString() })
  await indexedDbStore.putSale(sale)
}

// «Reintentar» on a retained sale: back to the queue, same id (the upload stays idempotent).
export async function retrySale(sale: OfflineSale) {
  await save(sale, { status: 'pending', error: undefined })
}

// D9: discarded sales stay on the device, never uploaded, until removed after 30 days.
export async function discardSale(sale: OfflineSale) {
  await save(sale, { status: 'discarded' })
}

export async function countWaitingSales(userId: string) {
  const sales = await indexedDbStore.listSales(userId)
  return sales.filter((sale) => sale.status === 'pending' || sale.status === 'uploading' || sale.status === 'retained').length
}
