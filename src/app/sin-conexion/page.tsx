import type { Metadata } from 'next'

import { OfflineDesk } from '@/features/offline/components/OfflineDesk'

// LEN0011: static on purpose. The service worker caches this page with its build files
// and opens it when there is no network, so it must not read cookies or server data.
export const dynamic = 'force-static'

export const metadata: Metadata = { title: 'Venta sin conexión', robots: { index: false, follow: false, nocache: true } }

export default function OfflineDeskPage() {
  return <OfflineDesk />
}
