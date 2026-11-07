'use client'

import { Merge, Pencil, Plus, Stethoscope } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

import { createClient } from '@/lib/supabase/client'
import { FormSelect } from '@/shared/components'
import { friendlyError } from '@/shared/lib/friendly-error'
import { Alert, Button, Card, CardHeader, Dialog, Field, Input, Toast } from '@/shared/ui'

type Optometrist = { id: number; name: string; prescriptions: number }
type Action = { kind: 'add' } | { kind: 'rename'; optometrist: Optometrist } | { kind: 'merge'; optometrist: Optometrist }

const prescriptionsLabel = (count: number) => (count === 1 ? '1 receta' : `${count} recetas`)
const mergeSummary = (count: number) =>
  count === 0 ? 'No tiene recetas;' : count === 1 ? 'Su receta pasará al optometrista que elijas y' : `Sus ${count} recetas pasarán al optometrista que elijas y`

// LEN0008: the owner adds, renames and merges optometrists. They are also added on their
// own when a prescription is saved with a new name; the RPCs enforce owner role.
export function OptometristManager({ organizationId, organizationName, canManage }: { organizationId: number; organizationName: string; canManage: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const [optometrists, setOptometrists] = useState<Optometrist[] | null>(null)
  const [action, setAction] = useState<Action | null>(null)
  const [name, setName] = useState('')
  const [targetId, setTargetId] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc('list_optometrists', { target_organization_id: organizationId } as never)
    if (loadError) return setError(friendlyError(loadError, 'No pudimos cargar los optometristas.'))
    setOptometrists(data as unknown as Optometrist[])
  }, [organizationId, supabase])

  // Deferred like PrescriptionWorkspace: the first load runs after the commit.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  function open(next: Action) {
    setAction(next)
    setName(next.kind === 'rename' ? next.optometrist.name : '')
    setTargetId('')
    setError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!action) return
    if (action.kind !== 'merge' && name.trim().length < 2) return setError('Escribe un nombre de 2 a 160 caracteres.')
    if (action.kind === 'merge' && !targetId) return setError('Elige con quién fusionarlo.')
    setPending(true); setError(null)
    const { error: actionError } = action.kind === 'add'
      ? await supabase.rpc('create_optometrist', { target_organization_id: organizationId, optometrist_name: name } as never)
      : action.kind === 'rename'
        ? await supabase.rpc('rename_optometrist', { target_optometrist_id: action.optometrist.id, optometrist_name: name } as never)
        : await supabase.rpc('merge_optometrists', { source_optometrist_id: action.optometrist.id, target_optometrist_id: Number(targetId) } as never)
    setPending(false)
    if (actionError) return setError(friendlyError(actionError, 'No pudimos guardar el cambio.'))
    const target = optometrists?.find(({ id }) => id === Number(targetId))
    setToast(action.kind === 'add' ? `Agregado: ${name.trim()}.` : action.kind === 'rename' ? `Nombre actualizado: ${name.trim()}.` : `${action.optometrist.name} se fusionó con ${target?.name ?? 'el optometrista elegido'}.`)
    setAction(null)
    await load()
  }

  const mergeOptions = action?.kind === 'merge'
    ? (optometrists ?? []).filter(({ id }) => id !== action.optometrist.id).map(({ id, name: optionName }) => ({ value: String(id), label: optionName }))
    : []
  const title = action?.kind === 'add' ? 'Agregar optometrista' : action?.kind === 'rename' ? 'Cambiar nombre' : 'Fusionar duplicado'
  const formId = `optometrist-${organizationId}`

  return <Card className="flex flex-col gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <CardHeader title="Optometristas" meta={optometrists ? String(optometrists.length) : undefined} />
        <p className="text-[13px] text-text-muted">Se agregan solos al guardar una receta con un nombre nuevo. Aquí puedes agregarlos, corregir un nombre o unir dos que son la misma persona.</p>
      </div>
      {canManage ? <Button variant="secondary" icon={Plus} onClick={() => open({ kind: 'add' })}>Agregar</Button> : null}
    </div>

    {optometrists === null ? <p className="text-sm text-text-muted">{error ?? 'Cargando optometristas…'}</p>
      : optometrists.length === 0 ? <p className="text-sm text-text-muted">Aún no hay optometristas.</p>
      : <div className="overflow-hidden rounded-card border border-line">
        {optometrists.map((optometrist) => <div key={optometrist.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft px-4 py-3 last:border-b-0">
          <div className="flex min-w-0 flex-1 basis-full flex-col sm:basis-0">
            <span className="truncate text-[15px] font-semibold text-ink">{optometrist.name}</span>
            <span className="text-[13px] text-text-muted">{prescriptionsLabel(optometrist.prescriptions)}</span>
          </div>
          {canManage ? <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => open({ kind: 'rename', optometrist })}>Renombrar</Button>
            <Button size="sm" variant="ghost" icon={Merge} disabled={optometrists.length < 2} onClick={() => open({ kind: 'merge', optometrist })}>Fusionar</Button>
          </div> : null}
        </div>)}
      </div>}

    <Dialog
      open={Boolean(action)}
      onClose={() => { if (!pending) setAction(null) }}
      eyebrow={organizationName}
      title={title}
      icon={action?.kind === 'merge' ? Merge : Stethoscope}
      tone={action?.kind === 'merge' ? 'danger' : 'default'}
      size="sm"
      footer={<>
        <Button variant="ghost" onClick={() => setAction(null)} disabled={pending}>Cancelar</Button>
        <Button type="submit" form={formId} variant={action?.kind === 'merge' ? 'danger' : 'primary'} disabled={pending}>{pending ? 'Guardando…' : action?.kind === 'merge' ? 'Fusionar' : 'Guardar'}</Button>
      </>}
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {action?.kind === 'merge' ? <>
          <p className="text-sm text-text">
            {mergeSummary(action.optometrist.prescriptions)} <strong className="text-ink">{action.optometrist.name}</strong> saldrá de la lista. No se puede deshacer.
          </p>
          <Field as="div" label="Fusionar con"><FormSelect ariaLabel="Fusionar con" value={targetId} onValueChange={setTargetId} options={[{ value: '', label: 'Elige un optometrista' }, ...mergeOptions]} /></Field>
        </> : <Field label="Nombre" help="Tal como quieres que aparezca en las recetas y en la analítica.">
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} autoComplete="off" />
        </Field>}
        {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
      </form>
    </Dialog>
    {toast ? <Toast message={toast} onDismiss={() => setToast('')} /> : null}
  </Card>
}
