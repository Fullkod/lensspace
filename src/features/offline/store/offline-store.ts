import type { OfflineSale, OfflineSnapshot } from '../types'

// Device storage for the offline desk. IndexedDB in the browser; the Android shell
// (LEN0012) can plug in native files without touching the callers (D2).
export interface OfflineStore {
  getSnapshot(userId: string): Promise<OfflineSnapshot | null>
  putSnapshot(snapshot: OfflineSnapshot): Promise<void>
  // Removes saved data of everyone except `keepUserId` (all when null). Never sales.
  clearSnapshots(keepUserId: string | null): Promise<void>
  getMeta(key: MetaKey): Promise<string | null>
  setMeta(key: MetaKey, value: string | null): Promise<void>
  listSales(userId: string): Promise<OfflineSale[]>
  putSale(sale: OfflineSale): Promise<void>
  deleteSale(id: string): Promise<void>
}

// lastUserId: who the desk opens for offline. deviceId: prefix of provisional numbers.
export type MetaKey = 'lastUserId' | 'deviceId' | 'saleCounter'
