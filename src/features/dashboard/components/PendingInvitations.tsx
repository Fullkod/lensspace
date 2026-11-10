'use client'

import { Check, MailPlus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/shared/lib/friendly-error'
import { Alert, Button } from '@/shared/ui'

export type PendingInvitation = { membershipId: number; organizationName: string; role: string; branchName: string | null }

const roleLabels: Record<string, string> = { seller: 'vendedor', lens_provider: 'cristalero/laboratorio', mounting_provider: 'montador', account_user: 'usuario de óptica' }

// QA-39: an existing account joins an organization only after accepting here.
export function PendingInvitations({ invitations }: { invitations: PendingInvitation[] }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [answered, setAnswered] = useState<number[]>([])
  const open = invitations.filter((invitation) => !answered.includes(invitation.membershipId))
  if (!open.length) return null

  function respond(membershipId: number, accept: boolean) {
    startTransition(async () => {
      setError('')
      const { error: respondError } = await supabase.rpc('respond_to_organization_invitation', { target_membership_id: membershipId, accept } as never)
      if (respondError) return setError(friendlyError(respondError, 'No pudimos responder la invitación.'))
      // Hide it now; the refresh then brings the new menu after accepting.
      setAnswered((current) => [...current, membershipId])
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {open.map((invitation) => (
        <Alert key={invitation.membershipId} tone="info" icon={MailPlus} title={`Te invitaron a ${invitation.organizationName}`}>
          Como {roleLabels[invitation.role] ?? invitation.role}{invitation.branchName ? ` en ${invitation.branchName}` : ''}. Solo te unirás si aceptas.
          <span className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" icon={Check} disabled={pending} onClick={() => respond(invitation.membershipId, true)}>Aceptar</Button>
            <Button size="sm" variant="ghost" icon={X} disabled={pending} onClick={() => respond(invitation.membershipId, false)}>Rechazar</Button>
          </span>
        </Alert>
      ))}
      {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
    </div>
  )
}
