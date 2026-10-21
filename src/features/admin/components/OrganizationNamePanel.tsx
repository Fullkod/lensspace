'use client'

import { type FormEvent, useMemo, useState, useTransition } from 'react'

import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/shared/lib/friendly-error'
import { Alert, Button, CardHeader, Field, Input } from '@/shared/ui'

// LEN0003: the platform admin renames a tenant (the owner can too, from /team).
// RLS (platform admin or owner) and the 2–160 character check enforce it.
export function OrganizationNamePanel({ organizationId, organizationName, onChanged }: { organizationId: number; organizationName: string; onChanged: (message: string) => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [value, setValue] = useState(organizationName)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const name = value.trim()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (name.length < 2 || name.length > 160) return setError('Escribe un nombre de 2 a 160 caracteres.')
    startTransition(async () => {
      const { error: updateError } = await supabase.from('organizations').update({ name } as never).eq('id', organizationId)
      if (updateError) return setError(friendlyError(updateError, 'No pudimos guardar el nombre.'))
      setError('')
      onChanged(`Nombre actualizado: ${name}.`)
    })
  }

  return <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
    <CardHeader title="Nombre" />
    <Field label="Nombre de la óptica">
      <Input value={value} onChange={(event) => setValue(event.target.value)} maxLength={160} autoComplete="off" />
    </Field>
    {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
    <Button type="submit" variant="secondary" block disabled={pending || name === organizationName}>{pending ? 'Guardando…' : 'Guardar nombre'}</Button>
  </form>
}
