'use client'

import { useEffect, useId, useMemo, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { Field, Input } from '@/shared/ui'

// Mirrors private.normalize_person_name: case, accents, extra spaces and a leading
// Dr./Dra./Lic. are ignored, so "dr. adrian" is the same optometrist as "Adrián".
export function normalizePersonName(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^(dra|dr|lic|lcda|lcdo)(\.|\s)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// LEN0008: free text with suggestions from the organization's catalog. A name that is not
// in the catalog is added by create_prescription_revision when the prescription is saved.
export function OptometristInput({ organizationId, className }: { organizationId?: number; className?: string }) {
  const supabase = useMemo(() => createClient(), [])
  const listId = useId()
  const [names, setNames] = useState<string[]>([])
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    void supabase
      .from('optometrists')
      .select('full_name')
      .eq('organization_id', organizationId)
      .order('full_name')
      .then(({ data }) => {
        if (!cancelled) setNames((data ?? []).map(({ full_name }) => full_name))
      })
    return () => { cancelled = true }
  }, [organizationId, supabase])

  const known = useMemo(() => new Set(names.map(normalizePersonName)), [names])
  const typed = normalizePersonName(value)
  const isNew = typed.length >= 2 && !known.has(typed)

  return (
    <Field
      label="Médico u optometrista"
      className={className}
      help={isNew ?'Nuevo: se agregará a la lista de optometristas al guardar.' : undefined}
    >
      <Input name="prescriberName" list={listId} autoComplete="off" minLength={2} maxLength={160} value={value} onChange={(event) => setValue(event.target.value)} />
      <datalist id={listId}>
        {names.map((name) => <option key={name} value={name} />)}
      </datalist>
    </Field>
  )
}
