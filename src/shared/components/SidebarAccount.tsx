import Link from 'next/link'

import { Avatar } from '@/shared/ui'

import { SignOutForm } from './SignOutForm'

export type ShellIdentity = { userId: string; displayName: string; phone: string | null; roleLabel: string; organizationName: string }

// QA-62: the name opens the profile page (name, phone, password).
export function SidebarAccount({ identity, onNavigate }: { identity: ShellIdentity; onNavigate?: () => void }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[12px] bg-ink-2 p-3">
      <Link href="/profile" prefetch={false} onClick={onNavigate} title="Mi perfil" aria-label={`Mi perfil: ${identity.displayName}`} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[8px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint">
        <Avatar name={identity.displayName} size="sm" strong />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-on-ink-text">{identity.displayName}</span>
          <span className="block truncate text-xs text-on-ink-subtle">{identity.roleLabel}</span>
        </span>
      </Link>
      <SignOutForm userId={identity.userId} />
    </div>
  )
}
