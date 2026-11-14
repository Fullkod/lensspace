'use client'

import { useEffect } from 'react'

import { syncOfflineSnapshot } from '../snapshot/sync-snapshot'

// Mounted in the signed-in layout for sellers and owners: saves what the offline desk
// needs while there is signal. Silent by design; a failure retries on the next visit.
export function OfflineSnapshotSync({ userId }: { userId: string }) {
  useEffect(() => {
    if (!('indexedDB' in window)) return
    const sync = () => { if (navigator.onLine) syncOfflineSnapshot(userId).catch(() => undefined) }
    const onVisible = () => { if (document.visibilityState === 'visible') sync() }
    sync()
    window.addEventListener('online', sync)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', sync)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId])
  return null
}
