'use client'

import { Wifi, WifiOff } from 'lucide-react'

import { LensSpaceLogo } from '@/shared/components/LensSpaceLogo'
import { Badge, Button, buttonClasses, Card, PageContainer } from '@/shared/ui'

import { useNetworkStatus } from '../hooks/use-network-status'

// Offline desk (LEN0011). Phase 1 only proves it opens with no network; the saved data
// and the offline sale arrive in the next phases. Plain <a>, not next/link: a client
// navigation would ask the server for data.
export function OfflineDesk() {
  const online = useNetworkStatus()
  return (
    <main className="min-h-screen bg-canvas">
      <PageContainer narrow>
        <header className="flex items-center justify-between gap-3">
          <LensSpaceLogo compact />
          <Badge tone={online ? 'success' : 'warning'} dot={false}>
            {online ? <Wifi aria-hidden="true" size={14} /> : <WifiOff aria-hidden="true" size={14} />}
            {online ? 'Con conexión' : 'Sin conexión'}
          </Badge>
        </header>
        <Card>
          <h1 className="font-display text-[22px] font-semibold text-ink">Venta sin conexión</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
            {online
              ? 'Ya hay señal. Puedes volver a LensSpace y seguir como siempre.'
              : 'No hay señal, pero LensSpace sigue abierto. Lo que ya guardaste no se perdió.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {online
              ? <a href="/dashboard" className={buttonClasses()}>Volver a LensSpace</a>
              : <Button variant="secondary" onClick={() => window.location.reload()}>Reintentar</Button>}
          </div>
        </Card>
      </PageContainer>
    </main>
  )
}
