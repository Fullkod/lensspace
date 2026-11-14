'use client'

import { Wifi, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'

import { LensSpaceLogo } from '@/shared/components/LensSpaceLogo'
import { Alert, Badge, Button, buttonClasses, Card, PageContainer } from '@/shared/ui'

import { useNetworkStatus } from '../hooks/use-network-status'
import { isOfflineAccessExpired, offlineAccessEndsAt, snapshotAge } from '../snapshot/expiry'
import { indexedDbStore } from '../store/indexeddb-store'
import type { OfflineSnapshot } from '../types'

type DeskState = { kind: 'loading' } | { kind: 'empty' } | { kind: 'expired'; snapshot: OfflineSnapshot } | { kind: 'ready'; snapshot: OfflineSnapshot }

async function loadDesk(): Promise<DeskState> {
  const userId = await indexedDbStore.getMeta('lastUserId')
  const snapshot = userId ? await indexedDbStore.getSnapshot(userId) : null
  if (!snapshot) return { kind: 'empty' }
  return isOfflineAccessExpired(snapshot.confirmedAt) ? { kind: 'expired', snapshot } : { kind: 'ready', snapshot }
}

// Offline desk (LEN0011). Reads only what the app saved on this device for the last
// signed-in seller; the sale form arrives in phase 4. Plain <a>, not next/link: a
// client navigation would ask the server for data.
export function OfflineDesk() {
  const online = useNetworkStatus()
  const [state, setState] = useState<DeskState>({ kind: 'loading' })

  useEffect(() => {
    loadDesk().then(setState, () => setState({ kind: 'empty' }))
  }, [])

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
        <DeskData state={state} />
      </PageContainer>
    </main>
  )
}

function DeskData({ state }: { state: DeskState }) {
  if (state.kind === 'loading') return null
  if (state.kind === 'empty') {
    return <Alert tone="warning" title="Este teléfono aún no tiene los datos para vender sin conexión">Entra en LensSpace una vez con señal y espera unos segundos: se guardan solos.</Alert>
  }
  const { snapshot } = state
  if (state.kind === 'expired') {
    return <Alert tone="danger" title="Hace más de 7 días que no te conectas">Por seguridad ya no se puede vender sin conexión en este teléfono. Conéctate una vez y vuelve a estar listo.</Alert>
  }
  const branches = [...new Set(snapshot.organizations.map((scope) => `${scope.name} · ${scope.branchName}`))]
  return (
    <Card>
      <h2 className="font-display text-[17px] font-semibold text-ink">Datos guardados {snapshotAge(snapshot.confirmedAt)}</h2>
      <ul className="mt-3 space-y-1.5 text-[15px] text-text-secondary">
        <li>{branches.join(', ')}</li>
        <li>{snapshot.customers.length} clientes y {snapshot.items.length} productos del catálogo</li>
        <li>Puedes vender sin conexión hasta el {offlineAccessEndsAt(snapshot.confirmedAt).toLocaleDateString('es', { day: 'numeric', month: 'long' })}</li>
      </ul>
    </Card>
  )
}
