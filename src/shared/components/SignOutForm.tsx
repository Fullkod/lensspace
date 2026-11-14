'use client'

import { LogOut } from 'lucide-react'
import { useState } from 'react'

import { signOut } from '@/features/auth/actions'
import { countWaitingOfflineSales, forgetOfflineData } from '@/features/offline'
import { Button, Dialog } from '@/shared/ui'

async function leave() {
  await forgetOfflineData().catch(() => undefined)
  await signOut()
}

// Forgets the offline desk data on this device before ending the session (LEN0011, D10).
// With offline sales still waiting it asks first: they stay on the device and upload
// when this seller signs in again.
export function SignOutForm({ userId }: { userId: string }) {
  const [waiting, setWaiting] = useState(0)

  return (
    <>
      <form action={async () => {
        const count = await countWaitingOfflineSales(userId).catch(() => 0)
        if (count) return setWaiting(count)
        await leave()
      }}>
        <button type="submit" aria-label="Cerrar sesión" title="Cerrar sesión" className="grid size-9 place-items-center rounded-[8px] text-on-ink-subtle transition hover:bg-ink hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint">
          <LogOut aria-hidden="true" size={18} />
        </button>
      </form>
      <Dialog open={waiting > 0} onClose={() => setWaiting(0)} title="Tienes ventas sin subir" size="sm" footer={<>
        <Button variant="ghost" onClick={() => setWaiting(0)}>Cancelar</Button>
        <form action={leave}><Button type="submit" variant="danger">Cerrar sesión igualmente</Button></form>
      </>}>
        <p className="text-[15px] leading-relaxed text-text-secondary">
          {waiting === 1 ? 'Hay 1 venta hecha sin conexión' : `Hay ${waiting} ventas hechas sin conexión`} que aún no llegó a LensSpace.
          Si cierras sesión se quedan en este teléfono y suben cuando vuelvas a entrar con tu cuenta. No borres los datos del navegador ni desinstales la app.
        </p>
      </Dialog>
    </>
  )
}
