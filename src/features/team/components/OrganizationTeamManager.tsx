'use client'

import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FormSelect } from '@/shared/components'
import { Alert, Badge, Button, Card, CardHeader, Dialog, Field, Input, ListItem, Toast, type Tone } from '@/shared/ui'
import { friendlyError } from '@/shared/lib/friendly-error'

type ManagedRole = 'seller' | 'lens_provider' | 'mounting_provider' | 'account_user'
type TeamMember = { id: number; displayName: string; role: string; status: string; branchId: number | null; branchName: string | null; accountName: string | null }
type Branch = { id: number; name: string }
const roleLabels: Record<string, string> = { owner: 'Propietario', seller: 'Vendedor', lens_provider: 'Cristalero/laboratorio', mounting_provider: 'Montador', account_user: 'Usuario de óptica' }
const usesBranch = (role: string) => role === 'seller' || role === 'account_user'
const statusLabels: Record<string, string> = { active: 'Activo', inactive: 'Inactivo', invited: 'Invitado' }
const statusTones: Record<string, Tone> = { active: 'success', inactive: 'neutral', invited: 'progress' }

export function OrganizationTeamManager({ organizationId, organizationName, branches, accounts, members, canManage }: { organizationId: number; organizationName: string; branches: Branch[]; accounts: Branch[]; members: TeamMember[]; canManage: boolean }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [role, setRole] = useState<ManagedRole>('seller')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [editingBranchId, setEditingBranchId] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null)
    const form = event.currentTarget
    const data = new FormData(form)
    const { error: inviteError } = await supabase.functions.invoke('invite-organization-member', { body: { organizationId, branchId: usesBranch(role) ? Number(data.get('branchId')) : null, commercialAccountId: role === 'account_user' ? Number(data.get('accountId')) : null, role, displayName: data.get('displayName'), email: data.get('email') } })
    if (inviteError) {
      let text = 'No se pudo procesar la invitación.'
      if (inviteError.context instanceof Response) { const body = await inviteError.context.json().catch(() => null) as { error?: string } | null; text = body?.error ?? text }
      setError(text); setPending(false); return
    }
    form.reset(); setRole('seller'); setToast('Invitación enviada. La persona se unirá cuando la acepte.'); setInviteOpen(false); router.refresh(); setPending(false)
  }

  async function manageMember(member: TeamMember, nextStatus: 'active' | 'inactive', nextBranchId: number | null) {
    setPending(true); setError(null)
    const { error: manageError } = await supabase.rpc('manage_organization_member', { target_membership_id: member.id, target_status: nextStatus, target_branch_id: nextBranchId } as never)
    if (manageError) { setError(friendlyError(manageError, 'No se pudo actualizar el miembro.')); setPending(false); return }
    setToast('Miembro actualizado correctamente.'); setEditingMember(null); router.refresh(); setPending(false)
  }

  function openMember(member: TeamMember) { setEditingMember(member); setEditingBranchId(String(member.branchId ?? '')); setError(null) }
  const branchOptions = branches.map((branch) => ({ value: String(branch.id), label: branch.name }))

  return <Card padded={false}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
      <CardHeader title={`Equipo de ${organizationName}`} meta={members.length === 1 ? '1 miembro' : `${members.length} miembros`} className="flex-1" />
      <Button icon={UserPlus} disabled={!canManage} onClick={() => { setError(null); setInviteOpen(true) }}>Invitar miembro</Button>
    </div>
    {!canManage ? <div className="border-b border-line p-5"><Alert tone="warning">La organización está en modo de solo lectura. Renueva o reactiva la suscripción para modificar el equipo.</Alert></div> : null}
    <div>
      {members.map((member, index) => {
        const editable = canManage && member.role !== 'owner'
        return <ListItem
          key={member.id}
          avatarName={member.displayName}
          title={member.displayName}
          meta={`${roleLabels[member.role] ?? 'Rol desconocido'}${member.accountName ? ` · ${member.accountName}` : ''} · ${member.branchName ?? 'Todas las sucursales'}`}
          badge={<Badge tone={statusTones[member.status] ?? 'neutral'}>{statusLabels[member.status] ?? 'Desconocido'}</Badge>}
          trailing={member.role === 'owner' ? <span className="text-[12px] text-text-muted">No editable</span> : editable ? <span className="text-[13px] font-semibold text-action">Gestionar</span> : null}
          onSelect={editable ? () => openMember(member) : undefined}
          last={index === members.length - 1}
        />
      })}
    </div>

    <Dialog
      open={inviteOpen}
      onClose={() => { if (!pending) setInviteOpen(false) }}
      eyebrow={organizationName}
      title="Invitar miembro"
      icon={UserPlus}
      size="md"
      footer={<>
        <Button variant="ghost" onClick={() => setInviteOpen(false)} disabled={pending}>Cancelar</Button>
        <Button type="submit" form={`team-invite-${organizationId}`} variant="ink" disabled={pending}>{pending ? 'Procesando…' : 'Enviar invitación'}</Button>
      </>}
    >
      <form id={`team-invite-${organizationId}`} onSubmit={inviteMember} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre"><Input name="displayName" required autoComplete="name" /></Field>
        <Field label="Correo"><Input name="email" type="email" required autoComplete="email" /></Field>
        <Field label="Rol"><FormSelect ariaLabel="Rol" value={role} menuPlacement="top" onValueChange={(value) => setRole(value as ManagedRole)} options={[{ value: 'seller', label: 'Vendedor' }, { value: 'lens_provider', label: 'Cristalero/laboratorio' }, { value: 'mounting_provider', label: 'Montador' }, ...(accounts.length ? [{ value: 'account_user', label: 'Usuario de óptica minorista' }] : [])]} /></Field>
        {usesBranch(role) ? <Field label={role === 'account_user' ? 'Sucursal que recibe sus trabajos' : 'Sucursal'}><FormSelect name="branchId" ariaLabel="Sucursal" menuPlacement="top" required options={branchOptions} /></Field> : null}
        {role === 'account_user' ? <Field label="Óptica"><FormSelect name="accountId" ariaLabel="Óptica" menuPlacement="top" required options={accounts.map((account) => ({ value: String(account.id), label: account.name }))} /></Field> : null}
        {error ? <Alert tone="danger" role="alert" className="sm:col-span-2">{error}</Alert> : null}
      </form>
    </Dialog>

    <Dialog
      open={Boolean(editingMember)}
      onClose={() => { if (!pending) setEditingMember(null) }}
      eyebrow={editingMember ? roleLabels[editingMember.role] ?? 'Miembro' : undefined}
      title={editingMember ? `Gestionar a ${editingMember.displayName}` : ''}
      size="md"
      footer={editingMember ? <>
        <Button variant="danger" className="w-full sm:mr-auto sm:w-auto" disabled={pending} onClick={() => void manageMember(editingMember, editingMember.status === 'inactive' ? 'active' : 'inactive', editingMember.branchId)}>{editingMember.status === 'inactive' ? 'Reactivar acceso' : 'Desactivar acceso'}</Button>
        <Button variant="ghost" onClick={() => setEditingMember(null)} disabled={pending}>Cancelar</Button>
        {usesBranch(editingMember.role) ? <Button variant="ink" disabled={pending || !editingBranchId} onClick={() => void manageMember(editingMember, editingMember.status === 'inactive' ? 'inactive' : 'active', Number(editingBranchId))}>Guardar cambios</Button> : null}
      </> : undefined}
    >
      {editingMember ? <div className="flex flex-col gap-4">
        {usesBranch(editingMember.role)
          ? <Field label="Sucursal"><FormSelect ariaLabel={`Sucursal de ${editingMember.displayName}`} value={editingBranchId} onValueChange={setEditingBranchId} options={branchOptions} /></Field>
          : <p className="text-sm text-text">Este proveedor no necesita una sucursal asignada.</p>}
        {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
      </div> : null}
    </Dialog>

    <Toast message={toast} onDismiss={() => setToast('')} />
  </Card>
}
