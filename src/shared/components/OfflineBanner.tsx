'use client'

import { WifiOff } from 'lucide-react'
import { useOffline } from 'next/offline'

// `useOffline` also turns true when a navigation or prefetch fails, which is more
// reliable than navigator.onLine on Wi-Fi without upstream internet. Sellers get the
// offline desk (LEN0011); a plain link, so the service worker serves it with no network.
export function OfflineBanner({ canSellOffline = false }: { canSellOffline?: boolean }) {
  const isOffline = useOffline()
  if (!isOffline) return null
  return (
    <div role="status" className="sticky top-0 z-20 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-coral-tint px-4 py-2 text-center text-[13px] font-semibold text-coral-deep">
      <span className="flex items-center gap-2">
        <WifiOff aria-hidden="true" size={16} className="shrink-0" />
        Sin conexión: lo que ves sigue aquí y reintentaremos al volver la señal.
      </span>
      {canSellOffline ? <a href="/sin-conexion" className="underline underline-offset-2">Vender sin conexión</a> : null}
    </div>
  )
}
