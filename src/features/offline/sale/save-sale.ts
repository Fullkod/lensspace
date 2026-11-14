import { newRequestId } from '@/shared/utils/request-id'

import type { OfflineStore } from '../store/offline-store'
import type { OfflineSale } from '../types'
import type { OfflineSalePayload } from './payload'

// Provisional receipt number shown until the server assigns the real one (D6):
// SC-<first 4 of the device id>-<counter on this device>.
export async function nextLocalNumber(store: OfflineStore) {
  let deviceId = await store.getMeta('deviceId')
  if (!deviceId) {
    deviceId = newRequestId()
    await store.setMeta('deviceId', deviceId)
  }
  const counter = Number(await store.getMeta('saleCounter') ?? '0') + 1
  await store.setMeta('saleCounter', String(counter))
  return { deviceId, localNumber: `SC-${deviceId.slice(0, 4).toUpperCase()}-${counter}` }
}

// The sale is durable once this resolves (IndexedDB transaction committed); only then
// may the screen move on to the next sale.
export async function saveOfflineSale(store: OfflineStore, userId: string, build: (ids: { deviceId: string; localNumber: string; soldAt: string }) => OfflineSalePayload) {
  const { deviceId, localNumber } = await nextLocalNumber(store)
  const now = new Date().toISOString()
  const sale: OfflineSale = {
    id: newRequestId(),
    userId,
    localNumber,
    createdAt: now,
    status: 'pending',
    payload: build({ deviceId, localNumber, soldAt: now }),
    updatedAt: now,
  }
  await store.putSale(sale)
  return sale
}
