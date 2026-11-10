'use client'

import { Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { ItemPicker, NewPrescriptionDialog, pairAdjustmentsOrError, pairEstimate, toggleItem, type PairDraft, type Revision, type SaleItem, type SaleScope } from '@/features/sales/components'
import { createClient } from '@/lib/supabase/client'
import { FormSelect } from '@/shared/components'
import { friendlyError } from '@/shared/lib/friendly-error'
import { newRequestId } from '@/shared/utils/request-id'
import { Alert, Button, Card } from '@/shared/ui'

import { formatPrice } from '../types'

type Patient = { id: number; name: string }

const emptyPair = (): PairDraft => ({ key: 'job', patient: null, revisionId: 0, selected: [], agreedPrices: {}, adjustmentReasons: {} })

// "Agregar trabajo" (LEN0010): prescription and concepts at the account prices. The job goes
// under the optician's hidden patient. The server prices it again and freezes it.
export function AddJobEditor({ orderId, scope, items, canApproveLargeDiscount, onAdded, onCancel }: {
  orderId: number
  scope: SaleScope
  items: SaleItem[]
  canApproveLargeDiscount: boolean
  onAdded: (message: string) => void
  onCancel: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [patient, setPatient] = useState<Patient | null>(null)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [pair, setPair] = useState<PairDraft>(emptyPair)
  const [prescriptionOpen, setPrescriptionOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(newRequestId())
  const groupedItems = Object.entries(items.reduce<Record<string, SaleItem[]>>((groups, item) => { (groups[item.category] ??= []).push(item); return groups }, {}))
  const estimate = Object.entries(pairEstimate(pair, items)).map(([currency, total]) => formatPrice(total, currency)).join(' + ')

  useEffect(() => {
    let active = true
    void supabase.rpc('ensure_commercial_order_patient', { target_order_id: orderId } as never).then(({ data, error: patientError }) => {
      if (!active) return
      if (patientError) setError(friendlyError(patientError, 'No pudimos preparar el trabajo.'))
      else setPatient(data as unknown as Patient)
    })
    return () => { active = false }
  }, [orderId, supabase])

  async function save() {
    if (!patient) return
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
    onAdded(`Trabajo ${(data as { lineNumber: number }).lineNumber} agregado.`)
  }

  const update = (change: (current: PairDraft) => PairDraft) => setPair((current) => change(current))

  return <Card className="flex flex-col gap-5">
    <div>
      <h2 className="font-display text-[17px] font-semibold text-ink">Agregar trabajo</h2>
      <p className="mt-1 text-sm text-text-muted">Los precios ya llevan las condiciones de esta óptica. Al guardar, el trabajo queda fijo con su precio.</p>
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
