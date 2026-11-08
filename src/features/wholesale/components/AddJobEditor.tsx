'use client'

import { Plus, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ItemPicker, NewPrescriptionDialog, pairAdjustmentsOrError, pairEstimate, toggleItem, type PairDraft, type Revision, type SaleItem, type SaleScope } from '@/features/sales/components'
import { createClient } from '@/lib/supabase/client'
import { FormSelect } from '@/shared/components'
import { friendlyError } from '@/shared/lib/friendly-error'
import { newRequestId } from '@/shared/utils/request-id'
import { Alert, Button, Card, Field, Input } from '@/shared/ui'

import { formatPrice } from '../types'

type Patient = { id: number; name: string }

const emptyPair = (): PairDraft => ({ key: 'job', patient: null, revisionId: 0, selected: [], agreedPrices: {}, adjustmentReasons: {} })

// "Agregar trabajo" (LEN0010): patient of the retail optician, prescription and concepts
// at the account prices. The server prices it again (surcharges included) and freezes it.
export function AddJobEditor({ orderId, accountId, scope, items, canApproveLargeDiscount, onAdded, onCancel }: {
  orderId: number
  accountId: number
  scope: SaleScope
  items: SaleItem[]
  canApproveLargeDiscount: boolean
  onAdded: (message: string) => void
  onCancel: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientId, setPatientId] = useState('')
  const [newPatient, setNewPatient] = useState<string | null>(null)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [pair, setPair] = useState<PairDraft>(emptyPair)
  const [prescriptionOpen, setPrescriptionOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(newRequestId())
  const patient = patients.find(({ id }) => id === Number(patientId)) ?? null
  const groupedItems = Object.entries(items.reduce<Record<string, SaleItem[]>>((groups, item) => { (groups[item.category] ??= []).push(item); return groups }, {}))
  const estimate = Object.entries(pairEstimate(pair, items)).map(([currency, total]) => formatPrice(total, currency)).join(' + ')

  const loadPatients = useCallback(async () => {
    const { data } = await supabase.from('customers').select('id, full_name').eq('commercial_account_id', accountId).eq('branch_id', scope.branchId).is('archived_at', null).order('full_name')
    setPatients(((data ?? []) as { id: number; full_name: string }[]).map((row) => ({ id: row.id, name: row.full_name })))
  }, [accountId, scope.branchId, supabase])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPatients(), 0)
    return () => window.clearTimeout(timer)
  }, [loadPatients])

  async function choosePatient(value: string) {
    setPatientId(value)
    setPair((current) => ({ ...current, revisionId: 0 }))
    setRevisions([])
    if (!value) return
    const { data } = await supabase.from('prescription_revisions').select('id, organization_id, branch_id, prescription_id, prescription_date, prescriptions!inner(customer_id)').eq('prescriptions.customer_id', Number(value)).order('created_at', { ascending: false }).limit(20)
    setRevisions(((data ?? []) as unknown as { id: number; organization_id: number; branch_id: number; prescription_id: number; prescription_date: string }[])
      .map((row) => ({ id: row.id, organizationId: row.organization_id, branchId: row.branch_id, customerId: Number(value), label: `Receta #${row.prescription_id} · ${row.prescription_date}` })))
  }

  async function createPatient() {
    const name = (newPatient ?? '').trim()
    if (name.length < 2) return setError('Escribe el nombre del paciente.')
    setPending(true); setError(null)
    const { data, error: createError } = await supabase.rpc('create_commercial_patient', { target_account_id: accountId, target_branch_id: scope.branchId, patient_name: name } as never)
    setPending(false)
    if (createError) return setError(friendlyError(createError, 'No pudimos registrar el paciente.'))
    await loadPatients()
    setNewPatient(null)
    await choosePatient(String(data))
  }

  async function save() {
    if (!patient) return setError('Elige el paciente.')
    const adjustments = pairAdjustmentsOrError(pair, items, canApproveLargeDiscount, 'este trabajo')
    if (typeof adjustments === 'string') return setError(adjustments)
    setPending(true); setError(null)
    const { data, error: addError } = await supabase.rpc('add_commercial_order_line', {
      target_order_id: orderId,
      target_line: { patientCustomerId: patient.id, prescriptionRevisionId: pair.revisionId || null, itemIds: pair.selected, lineAdjustments: adjustments },
      request_id: requestId.current,
    } as never)
    setPending(false)
    if (addError) return setError(friendlyError(addError, 'No pudimos agregar el trabajo.'))
    onAdded(`Trabajo ${(data as { lineNumber: number }).lineNumber} agregado: ${patient.name}.`)
  }

  const update = (change: (current: PairDraft) => PairDraft) => setPair((current) => change(current))

  return <Card className="flex flex-col gap-5">
    <div>
      <h2 className="font-display text-[17px] font-semibold text-ink">Agregar trabajo</h2>
      <p className="mt-1 text-sm text-text-muted">Los precios ya llevan las condiciones de esta óptica. Al guardar, el trabajo queda fijo con su precio.</p>
    </div>

    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-text-label">Paciente</span>
        <Button variant="ghost" size="sm" icon={UserPlus} className="-mr-2" onClick={() => setNewPatient('')} disabled={newPatient !== null}>Nuevo paciente</Button>
      </div>
      {newPatient !== null ? <div className="flex flex-wrap items-end gap-2">
        <Field label="Nombre del paciente" className="min-w-[200px] flex-1"><Input value={newPatient} onChange={(event) => setNewPatient(event.target.value)} maxLength={160} autoComplete="off" /></Field>
        <Button onClick={() => void createPatient()} disabled={pending}>Registrar</Button>
        <Button variant="ghost" onClick={() => setNewPatient(null)} disabled={pending}>Cancelar</Button>
      </div> : <FormSelect ariaLabel="Paciente" value={patientId} onValueChange={(value) => void choosePatient(value)}
        options={[{ value: '', label: patients.length ? 'Elige el paciente' : 'Aún no hay pacientes de esta óptica' }, ...patients.map(({ id, name }) => ({ value: String(id), label: name }))]} />}
    </div>

    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-text-label">Receta</span>
        <Button variant="ghost" size="sm" icon={Plus} className="-mr-2" disabled={!patient} onClick={() => setPrescriptionOpen(true)}>Nueva receta</Button>
      </div>
      <FormSelect ariaLabel="Receta del trabajo" value={String(pair.revisionId)} onValueChange={(value) => update((current) => ({ ...current, revisionId: Number(value) }))}
        options={[{ value: '0', label: 'Sin receta asociada' }, ...revisions.map((entry) => ({ value: String(entry.id), label: entry.label }))]} />
    </div>

    <ItemPicker groupedItems={groupedItems} selected={pair.selected} agreedPrices={pair.agreedPrices} adjustmentReasons={pair.adjustmentReasons}
      onToggle={(itemId) => update((current) => ({ ...current, selected: toggleItem(current.selected, itemId, items) }))}
      onAgreedPriceChange={(itemId, value) => update((current) => ({ ...current, agreedPrices: { ...current.agreedPrices, [itemId]: value } }))}
      onAdjustmentReasonChange={(itemId, value) => update((current) => ({ ...current, adjustmentReasons: { ...current.adjustmentReasons, [itemId]: value } }))} />

    {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <span className="text-sm text-text-muted">Estimado: <strong className="text-ink">{estimate || '—'}</strong></span>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button onClick={() => void save()} disabled={pending || !patient || !pair.selected.length}>{pending ? 'Guardando…' : 'Agregar al pedido'}</Button>
      </div>
    </div>

    <NewPrescriptionDialog open={prescriptionOpen} scope={scope}
      patient={patient ? { id: patient.id, organizationId: scope.id, branchId: scope.branchId, name: patient.name } : null}
      onClose={() => setPrescriptionOpen(false)}
      onCreated={(revision) => { setRevisions((current) => [revision, ...current]); update((current) => ({ ...current, revisionId: revision.id })); setPrescriptionOpen(false) }} />
  </Card>
}
