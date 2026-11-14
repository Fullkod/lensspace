'use client'

import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

// The offline desk makes no Next navigations, so `useOffline` would not notice a lost
// link here; the browser's network events are the signal. Server render assumes online.
export function useNetworkStatus() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
