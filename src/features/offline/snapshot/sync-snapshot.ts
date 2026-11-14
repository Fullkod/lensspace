import { createClient } from '@/lib/supabase/client'

import { indexedDbStore } from '../store/indexeddb-store'
import { captureSnapshot } from './capture-snapshot'

const REFRESH_MS = 2 * 60 * 60 * 1000 // weak links: at most every 2 h unless forced

let running: Promise<void> | null = null

// Keeps the device copy for the signed-in seller. Saved data of another user is removed
// at once (shared phones); their pending sales are not.
export function syncOfflineSnapshot(userId: string, { force = false } = {}) {
  if (running) return running
  running = (async () => {
    const store = indexedDbStore
    await store.clearSnapshots(userId)
    await store.setMeta('lastUserId', userId)
    const current = await store.getSnapshot(userId)
    if (!force && current && Date.now() - new Date(current.confirmedAt).getTime() < REFRESH_MS) return
    const snapshot = await captureSnapshot(createClient(), userId)
    await store.putSnapshot(snapshot)
    // Ask the browser not to evict the desk data under storage pressure (best effort).
    await navigator.storage?.persist?.().catch(() => false)
  })().finally(() => { running = null })
  return running
}

// Sign-out: forget the saved data (prescriptions are health data). Pending sales stay;
// the sign-out guard of phase 5 asks before leaving them.
export async function forgetOfflineData() {
  await indexedDbStore.clearSnapshots(null)
  await indexedDbStore.setMeta('lastUserId', null)
}
