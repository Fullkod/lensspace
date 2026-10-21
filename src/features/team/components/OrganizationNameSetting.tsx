'use client'

import { Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'

import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/shared/lib/friendly-error'
import { Alert, Button, Card, CardHeader, Dialog, Field, Input, Toast } from '@/shared/ui'

// LEN0003: the owner renames their organization. RLS (owner or platform admin) and
// the 2–160 character check in the DB enforce it; this is the UI.
export function OrganizationNameSetting({ organizationId, organizationName, canManage }: { organizationId: number; organizationName: string; canManage: boolean }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(organizationName)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = value.trim()
    if (name.length < 2 || name.length > 160) return setError('Escribe un nombre de 2 a 160 caracteres.')
    setPending(true); setError(null)
    const { error: updateError } = await supabase.from('organizations').update({ name } as never).eq('id', organizationId)
    setPending(false)
    if (updateError) return setError(friendlyError(updateError, 'No pudimos guardar el nombre.'))
    setOpen(false); setToast(`Nombre actualizado: ${name}.`); router.refresh()
  }

  return <Card className="flex flex-wrap items-center justify-between gap-3">
    <CardHeader title="Nombre de la óptica" meta={organizationName} className="flex-1" />
    {canManage ? <Button variant="secondary" icon={Pencil} onClick={() => { setValue(organizationName); setError(null); setOpen(true) }}>Cambiar nombre</Button> : null}
    <Dialog
      open={open}
      onClose={() => { if (!pending) setOpen(false) }}
      eyebrow={organizationName}
      title="Nombre de la óptica"
      icon={Pencil}
      size="sm"
      footer={<>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
        <Button type="submit" form={`organization-name-${organizationId}`} disabled={pending}>{pending ? 'Guardando…' : 'Guardar'}</Button>
      </>}
    >
      <form id={`organization-name-${organizationId}`} onSubmit={save} className="flex flex-col gap-4" noValidate>
        <Field label="Nombre" help="Es el nombre que ve tu equipo en LensSpace.">
          <Input value={value} onChange={(event) => setValue(event.target.value)} maxLength={160} autoComplete="organization" />
        </Field>
        {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
      </form>
    </Dialog>
    {toast ? <Toast message={toast} onDismiss={() => setToast('')} /> : null}
  </Card>
}
