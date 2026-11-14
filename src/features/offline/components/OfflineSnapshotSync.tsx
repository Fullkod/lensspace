'use client'

import { useState } from 'react'

import { refreshNavigationCounters } from '@/shared/lib/navigation-counters'
import { Toast } from '@/shared/ui'

import { useOfflineUpload } from '../hooks/use-offline-upload'
import { syncOfflineSnapshot } from '../snapshot/sync-snapshot'

// Mounted in the signed-in layout for sellers and owners (LEN0011): uploads the sales
// made offline on this device, then keeps the offline desk data fresh. Failures stay
// silent and retry on the next visit, return of signal or tab focus.
export function OfflineSnapshotSync({ userId }: { userId: string }) {
  const [notice, setNotice] = useState('')

  useOfflineUpload(userId, (summary) => {
    if (summary.uploaded) {
      void refreshNavigationCounters()
      setNotice(summary.uploaded === 1 ? 'Se subió 1 venta hecha sin conexión.' : `Se subieron ${summary.uploaded} ventas hechas sin conexión.`)
    }
    // Upload first, then refresh the saved data (new customers and prescriptions of the
    // uploaded sales belong in it). Runs on mount, return of signal and tab focus.
    if (navigator.onLine) syncOfflineSnapshot(userId, { force: summary.uploaded > 0 }).catch(() => undefined)
  })

  return notice ? <Toast message={notice} onDismiss={() => setNotice('')} duration={5000} /> : null
}
