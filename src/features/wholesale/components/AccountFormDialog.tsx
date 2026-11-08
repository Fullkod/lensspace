'use client'

import { Store } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/shared/lib/friendly-error'
import { Alert, Button, Dialog, Field, Input, Textarea } from '@/shared/ui'

import { parseDecimal, type CommercialAccount } from '../types'

type FormState = { name: string; contactName: string; phone: string; email: string; address: string; paymentTerms: string; creditDays: string; discount: string; notes: string }

const emptyForm: FormState = { name: '', contactName: '', phone: '', email: '', address: '', paymentTerms: '', creditDays: '', discount: '', notes: '' }

const fromAccount = (account: CommercialAccount): FormState => ({
  name: account.name,
  contactName: account.contact_name ?? '',
  phone: account.phone ?? '',
  email: account.email ?? '',
  address: account.address ?? '',
  paymentTerms: account.payment_terms ?? '',
  creditDays: account.credit_days === null ? '' : String(account.credit_days),
  discount: Number(account.discount_percent) ? String(account.discount_percent).replace('.', ',') : '',
  notes: account.notes ?? '',
})

const orNull = (value: string) => (value.trim() ? value.trim().replace(/\s+/g, ' ') : null)

function validate(form: FormState) {
  const name = form.name.trim()
  if (name.length < 2 || name.length > 160) return 'Escribe el nombre de la óptica (2 a 160 caracteres).'
  if (form.contactName.trim() && form.contactName.trim().length < 2) return 'El nombre del contacto es muy corto.'
  if (form.phone.trim() && (form.phone.trim().length < 6 || form.phone.trim().length > 40)) return 'Revisa el teléfono.'
  if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return 'Revisa el correo.'
  const days = form.creditDays.trim()
  if (days && (!/^\d+$/.test(days) || Number(days) > 365)) return 'Los días de crédito van de 0 a 365.'
  const discount = parseDecimal(form.discount)
  if (discount !== null && (Number.isNaN(discount) || discount > 90)) return 'El descuento va de 0 a 90 %.'
  return null
}

// Creates or edits a retail optician (LEN0009). Owner-only: RLS rejects anyone else.
export function AccountFormDialog({ organizationId, organizationName, userId, account, onClose, onSaved }: {
  organizationId: number
  organizationName: string
  userId: string
  account: CommercialAccount | null
  onClose: () => void
  onSaved: (account: CommercialAccount) => void
}) {
  const [form, setForm] = useState<FormState>(account ? fromAccount(account) : emptyForm)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (key: keyof FormState) => (value: string) => setForm((current) => ({ ...current, [key]: value }))
  const formId = `account-form-${organizationId}`

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = validate(form)
    if (problem) return setError(problem)
    setPending(true); setError(null)
    const changes = {
      name: form.name.trim().replace(/\s+/g, ' '),
      contact_name: orNull(form.contactName),
      phone: orNull(form.phone),
      email: orNull(form.email),
      address: orNull(form.address),
      payment_terms: orNull(form.paymentTerms),
      credit_days: form.creditDays.trim() ? Number(form.creditDays.trim()) : null,
      discount_percent: parseDecimal(form.discount) ?? 0,
      notes: form.notes.trim() || null,
    }
    const supabase = createClient()
    const { data, error: saveError } = account
      ? await supabase.from('commercial_accounts').update(changes as never).eq('id', account.id).select('*').single()
      : await supabase.from('commercial_accounts').insert({ ...changes, organization_id: organizationId, created_by: userId } as never).select('*').single()
    setPending(false)
    if (saveError) {
      return setError(saveError.code === '23505' ? `Ya existe una óptica activa llamada «${changes.name}».` : friendlyError(saveError, 'No pudimos guardar la óptica.'))
    }
    onSaved(data as CommercialAccount)
  }

  return <Dialog
    open
    onClose={() => { if (!pending) onClose() }}
    eyebrow={organizationName}
    title={account ? 'Editar óptica' : 'Nueva óptica minorista'}
    icon={Store}
    size="md"
    footer={<>
      <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
      <Button type="submit" form={formId} disabled={pending}>{pending ? 'Guardando…' : 'Guardar'}</Button>
    </>}
  >
    <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Nombre de la óptica"><Input value={form.name} onChange={(event) => set('name')(event.target.value)} maxLength={160} autoComplete="off" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Persona de contacto" optional><Input value={form.contactName} onChange={(event) => set('contactName')(event.target.value)} maxLength={160} autoComplete="off" /></Field>
        <Field label="Teléfono" optional><Input value={form.phone} onChange={(event) => set('phone')(event.target.value)} maxLength={40} inputMode="tel" autoComplete="off" /></Field>
      </div>
      <Field label="Correo" optional><Input value={form.email} onChange={(event) => set('email')(event.target.value)} maxLength={160} inputMode="email" autoComplete="off" /></Field>
      <Field label="Dirección" optional><Input value={form.address} onChange={(event) => set('address')(event.target.value)} maxLength={300} autoComplete="off" /></Field>
      <Field label="Condiciones de pago" optional help="Por ejemplo: paga cada viernes, o la mitad al recoger."><Input value={form.paymentTerms} onChange={(event) => set('paymentTerms')(event.target.value)} maxLength={300} autoComplete="off" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Días de crédito" optional><Input value={form.creditDays} onChange={(event) => set('creditDays')(event.target.value)} inputMode="numeric" maxLength={3} autoComplete="off" /></Field>
        <Field label="Descuento general (%)" optional help="Se aplica al precio de catálogo, salvo los artículos con precio fijo."><Input value={form.discount} onChange={(event) => set('discount')(event.target.value)} inputMode="decimal" maxLength={6} autoComplete="off" /></Field>
      </div>
      <Field label="Notas" optional><Textarea value={form.notes} onChange={(event) => set('notes')(event.target.value)} maxLength={1000} /></Field>
      {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
    </form>
  </Dialog>
}
