'use client'

import { useEffect, useRef } from 'react'

import { uploadPendingSales, type UploadSummary } from '../queue/upload-sales'

// Uploads the user's pending offline sales on mount, when the signal returns and when
// the tab comes back. `onDone` gets the round summary (refresh lists, counters, data).
export function useOfflineUpload(userId: string | null, onDone: (summary: UploadSummary) => void) {
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })

  useEffect(() => {
    if (!userId || !('indexedDB' in window)) return
    const upload = () => {
      if (navigator.onLine) uploadPendingSales(userId).then((summary) => done.current(summary), () => undefined)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') upload() }
    upload()
    window.addEventListener('online', upload)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', upload)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId])
}
