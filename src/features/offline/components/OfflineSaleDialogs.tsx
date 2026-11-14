'use client'

import { Save, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { CustomerFormFields, customerFormValues, type CustomerPhoneDraft } from '@/features/customers/components'
import { PrescriptionFormFields } from '@/features/prescriptions/components'
import { validatePrescriptionForm } from '@/features/prescriptions/prescription-validation'
import type { SaleCustomer } from '@/features/sales/components/CustomerSearchPicker'
import { Alert, Button, Dialog, Field, Input } from '@/shared/ui'

import type { NewCustomerData, NewRevisionData } from '../sale/payload'
import { revisionDataFromForm } from '../sale/payload'

type Scope = { organizationId: number; branchId: number; label: string }
type Duplicate = SaleCustomer & { phones: string[] }

const emptyPhones = (): CustomerPhoneDraft[] => [{ number: '', label: 'Principal', whatsappEnabled: true }]

// Offline twin of NewCustomerDialog: same fields and duplicate warning, against the
// customers saved on the device. Nothing reaches the server until the sale uploads.
export function OfflineCustomerDialog({ open, scope, findDuplicates, onClose, onCreated, onUseExisting }: {
  open: boolean
  scope: Scope
  findDuplicates: (name: string, phones: string[]) => Duplicate[]
  onClose: () => void
  onCreated: (data: NewCustomerData) => void
  onUseExisting: (customer: SaleCustomer) => void
}) {
  const [name, setName] = useState('')
  const [phones, setPhones] = useState<CustomerPhoneDraft[]>(emptyPhones)
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null)
  const [message, setMessage] = useState('')

  function reset() { setName(''); setPhones(emptyPhones()); setDuplicates(null); setMessage('') }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = customerFormValues(new FormData(event.currentTarget), name, phones)
    if (values.fullName.length < 2 || values.phones.length !== phones.length) return setMessage('Completa el nombre y un teléfono de al menos cinco dígitos.')
    if (duplicates === null) {
      const matches = findDuplicates(values.fullName, values.phones.map(({ number }) => number))
      if (matches.length) {
        setDuplicates(matches)
        return setMessage('Ya hay clientes parecidos. Usa uno de ellos o, si es otra persona, pulsa «Crear y seleccionar» de nuevo.')
      }
    }
    const { phones: phoneEntries, ...rest } = values
    reset()
    onCreated({ ...rest, phones: phoneEntries.map((phone) => ({ number: phone.number, label: phone.label, whatsappEnabled: phone.whatsappEnabled })) })
  }

  return (
    <Dialog open={open} onClose={onClose} eyebrow={scope.label} title="Nuevo cliente" size="lg" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button type="submit" form="offline-new-customer" formNoValidate icon={UserPlus}>Crear y seleccionar</Button>
    </>}>
      <form id="offline-new-customer" onSubmit={submit} className="flex flex-col gap-4">
        <CustomerFormFields fullName={name} onFullNameChange={(value) => { setName(value); setDuplicates(null) }} phones={phones} onPhonesChange={(value) => { setPhones(value); setDuplicates(null) }} />
        {message ? <Alert tone={duplicates?.length ? 'warning' : 'danger'} role="alert">{message}</Alert> : null}
        {duplicates?.length ? (
          <ul className="flex flex-col divide-y divide-line-soft rounded-control border border-line">
            {duplicates.map((match) => (
              <li key={match.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                <span className="min-w-0 text-sm"><strong className="text-ink">{match.name}</strong><span className="block text-text-muted">{match.phones.join(' · ') || 'Sin teléfono'}</span></span>
                <Button size="sm" variant="secondary" onClick={() => { reset(); onUseExisting(match) }}>Usar este cliente</Button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>
    </Dialog>
  )
}

// A relative only needs a name; the holder's phone is copied with WhatsApp off, as online.
export function OfflineRelativeDialog({ open, holder, holderPhone, onClose, onCreated }: {
  open: boolean
  holder: SaleCustomer | null
  holderPhone: string | null
  onClose: () => void
  onCreated: (data: NewCustomerData) => void
}) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!holder) return setMessage('Elige primero el titular de la venta.')
    if (name.trim().length < 2) return setMessage('Escribe el nombre del familiar.')
    if (!holderPhone) return setMessage('El titular no tiene teléfono guardado en este teléfono; regístralo como «Nuevo cliente».')
    onCreated({ fullName: name.trim(), notes: `Familiar de ${holder.name}.`, phones: [{ number: holderPhone, label: `Titular: ${holder.name}`.slice(0, 40), whatsappEnabled: false }] })
    setName(''); setMessage('')
  }

  return (
    <Dialog open={open} onClose={onClose} eyebrow={holder ? `Titular: ${holder.name}` : undefined} title="Nuevo familiar" icon={UserPlus} size="sm" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button type="submit" form="offline-new-relative">Crear y usar</Button>
    </>}>
      <form id="offline-new-relative" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Nombre completo" help="Los avisos de WhatsApp siguen llegando solo al titular.">
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} autoComplete="off" />
        </Field>
        {message ? <Alert tone="danger" role="alert">{message}</Alert> : null}
      </form>
    </Dialog>
  )
}

// Same prescription form; the original (photo/PDF) is attached later from Recetas.
export function OfflinePrescriptionDialog({ open, patient, optometristNames, onClose, onCreated }: {
  open: boolean
  patient: SaleCustomer | null
  optometristNames: string[]
  onClose: () => void
  onCreated: (data: NewRevisionData, prescriptionDate: string) => void
}) {
  const [message, setMessage] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!patient) return setMessage('Selecciona primero el paciente de la receta.')
    const form = new FormData(event.currentTarget)
    const validationError = validatePrescriptionForm(form)
    if (validationError) return setMessage(validationError)
    setMessage('')
    onCreated(revisionDataFromForm(form), String(form.get('prescriptionDate')))
  }

  return (
    <Dialog open={open} onClose={onClose} eyebrow={patient?.name ?? 'Paciente'} title="Nueva receta" size="lg" footer={<>
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button type="submit" form="offline-new-prescription" formNoValidate icon={Save}>Guardar y asociar</Button>
    </>}>
      <form id="offline-new-prescription" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <PrescriptionFormFields organizationId={patient?.organizationId} allowAttachment={false} optometristNames={optometristNames} />
        <p className="text-[13px] text-text-muted">La foto o el PDF de la receta se adjunta después, desde Recetas, cuando vuelva la señal.</p>
        {message ? <Alert tone="danger" role="alert">{message}</Alert> : null}
      </form>
    </Dialog>
  )
}
