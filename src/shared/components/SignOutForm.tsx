'use client'

import { LogOut } from 'lucide-react'

import { signOut } from '@/features/auth/actions'
import { forgetOfflineData } from '@/features/offline'

// Forgets the offline desk data on this device before ending the session (LEN0011, D10).
export function SignOutForm() {
  return (
    <form action={async () => {
      await forgetOfflineData().catch(() => undefined)
      await signOut()
    }}>
      <button type="submit" aria-label="Cerrar sesión" title="Cerrar sesión" className="grid size-9 place-items-center rounded-[8px] text-on-ink-subtle transition hover:bg-ink hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint">
        <LogOut aria-hidden="true" size={18} />
      </button>
    </form>
  )
}
