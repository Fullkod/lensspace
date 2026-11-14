import type { OfflineSale, OfflineSnapshot } from '../types'
import type { MetaKey, OfflineStore } from './offline-store'

const DB_NAME = 'lensspace-offline'
const DB_VERSION = 1

let opening: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (opening) return opening
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'userId' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      if (!db.objectStoreNames.contains('sales')) db.createObjectStore('sales', { keyPath: 'id' }).createIndex('userId', 'userId')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch((error: unknown) => {
    opening = null
    throw error
  })
  return opening
}

function run<T>(storeName: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const request = work(transaction.objectStore(storeName))
    // Resolve on commit, not on request success: a sale counts as saved only once durable.
    transaction.oncomplete = () => resolve(request ? request.result : undefined)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  }))
}

export const indexedDbStore: OfflineStore = {
  async getSnapshot(userId) {
    return (await run<OfflineSnapshot>('snapshots', 'readonly', (store) => store.get(userId))) ?? null
  },
  async putSnapshot(snapshot) {
    await run('snapshots', 'readwrite', (store) => { store.put(snapshot) })
  },
  async clearSnapshots(keepUserId) {
    const keys = (await run<IDBValidKey[]>('snapshots', 'readonly', (store) => store.getAllKeys())) ?? []
    await run('snapshots', 'readwrite', (store) => {
      for (const key of keys) if (key !== keepUserId) store.delete(key)
    })
  },
  async getMeta(key: MetaKey) {
    return (await run<string>('meta', 'readonly', (store) => store.get(key))) ?? null
  },
  async setMeta(key: MetaKey, value) {
    await run('meta', 'readwrite', (store) => { if (value === null) store.delete(key); else store.put(value, key) })
  },
  async listSales(userId) {
    const sales = (await run<OfflineSale[]>('sales', 'readonly', (store) => store.index('userId').getAll(userId))) ?? []
    return sales.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },
  async putSale(sale) {
    await run('sales', 'readwrite', (store) => { store.put(sale) })
  },
}
