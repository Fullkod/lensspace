'use client'

import { Plus, Save } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'

import type { SaleCustomer } from '@/features/sales/components/CustomerSearchPicker'
import { CustomerSearchPicker } from '@/features/sales/components/CustomerSearchPicker'
import { PairEditor } from '@/features/sales/components/PairEditor'
import { newPair } from '@/features/sales/components/sale-draft'
import { pairAdjustmentsOrError, pairEstimate, sumTotals, toCup, toggleItem } from '@/features/sales/components/sale-pricing'
import { MAX_PAIRS, type PairDraft, type Revision, type SaleItem } from '@/features/sales/components/sale-types'
import { FormSelect } from '@/shared/components'
import { Alert, Button, Card, Field, Input, Textarea } from '@/shared/ui'

import { savedDuplicates, savedPhone, savedRevisions, searchSavedCustomers } from '../sale/local-customers'
import type { NewCustomerData, NewRevisionData, OfflineSalePayload } from '../sale/payload'
import type { OfflineSale, OfflineSnapshot } from '../types'
import { OfflineCustomerDialog, OfflinePrescriptionDialog, OfflineRelativeDialog } from './OfflineSaleDialogs'
import { OfflinePaymentCard, totalLabel, type PaymentDraft } from './OfflinePaymentCard'

type Dialog = { kind: 'customer' } | { kind: 'relative'; pairIndex: number } | { kind: 'prescription'; pairIndex: number } | null
// Prescriptions typed offline stay with the pair they were made for (one upload each).
type LocalRevision = Revision & { pairKey: string; data: NewRevisionData }

// Offline twin of SalesWorkspace (LEN0011): same pair editor, catalog and validation, fed
// by the data saved on the device. Customers and prescriptions created here get negative
// ids and travel as «new» in the payload; the server creates them on upload.
export function OfflineSaleForm({ snapshot, onSave }: { snapshot: OfflineSnapshot; onSave: (build: (ids: { deviceId: string; localNumber: string; soldAt: string }) => OfflineSalePayload) => Promise<OfflineSale> }) {
  const { organizations } = snapshot
  const [scopeKey, setScopeKey] = useState(organizations[0] ? `${organizations[0].id}:${organizations[0].branchId}` : '')
  const organization = organizations.find((entry) => `${entry.id}:${entry.branchId}` === scopeKey)
  const organizationId = organization?.id ?? 0
  const branchId = organization?.branchId ?? 0
  const referenceRate = (id: number) => snapshot.businessRates[id]?.rate ?? snapshot.lastRates[id] ?? 420
  const [rate, setRate] = useState(String(referenceRate(organizationId)))
  const [holder, setHolder] = useState<SaleCustomer | null>(null)
  const [pairs, setPairs] = useState<PairDraft[]>(() => [newPair()])
  const [relatives, setRelatives] = useState<SaleCustomer[]>([])
  const [newCustomers, setNewCustomers] = useState<Record<number, NewCustomerData>>({})
  const [localRevisions, setLocalRevisions] = useState<LocalRevision[]>([])
  const [notes, setNotes] = useState('')
  const [payment, setPayment] = useState<PaymentDraft>({ currency: 'CUP', amount: '' })
  const [dialog, setDialog] = useState<Dialog>(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const nextLocalId = useRef(-1)
  const takeLocalId = () => nextLocalId.current--

  const items = useMemo(() => snapshot.items.filter((item) => item.organizationId === organizationId), [organizationId, snapshot.items])
  const groupedItems = Object.entries(items.reduce<Record<string, SaleItem[]>>((groups, item) => { (groups[item.category] ??= []).push(item); return groups }, {}))
  const rateValue = Number(rate)
  const patientOf = (pair: PairDraft) => pair.patient ?? holder
  const pairEstimates = pairs.map((pair) => pairEstimate(pair, items))
  const estimate = sumTotals(pairEstimates)
  const estimateCup = toCup(estimate, rateValue || 0)
  const ready = Boolean(holder && pairs.every((pair) => pair.selected.length))
  const search = (term: string) => searchSavedCustomers(snapshot, organizationId, branchId, term)
  const holderPhone = holder ? (holder.id > 0 ? savedPhone(snapshot, holder.id) : newCustomers[holder.id]?.phones[0]?.number ?? null) : null

  function revisionsFor(pair: PairDraft): Revision[] {
    const patient = patientOf(pair)
    if (!patient) return []
    return [...localRevisions.filter((entry) => entry.customerId === patient.id && entry.pairKey === pair.key), ...(patient.id > 0 ? savedRevisions(snapshot, patient.id) : [])]
  }
  function updatePair(index: number, update: (pair: PairDraft) => PairDraft) {
    setPairs((current) => current.map((pair, position) => (position === index ? update(pair) : pair)))
  }
  function selectHolder(customer: SaleCustomer | null) {
    setHolder(customer)
    setPairs((current) => current.map((pair) => (pair.patient ? pair : { ...pair, revisionId: 0 })))
  }
  function setPatient(index: number, patient: SaleCustomer | null) {
    updatePair(index, (pair) => ({ ...pair, patient, revisionId: 0 }))
    if (patient) setRelatives((current) => [patient, ...current.filter((entry) => entry.id !== patient.id)])
  }
  function addLocalCustomer(data: NewCustomerData): SaleCustomer {
    const id = takeLocalId()
    setNewCustomers((current) => ({ ...current, [id]: data }))
    return { id, organizationId, branchId, name: data.fullName }
  }
  function startNewSale() {
    setHolder(null); setPairs([newPair()]); setRelatives([]); setNotes(''); setPayment({ currency: 'CUP', amount: '' }); setMessage('')
  }

  // Returns the payload builder or a Spanish error (same rules as the online sale).
  function buildOrError(): ((ids: { deviceId: string; localNumber: string; soldAt: string }) => OfflineSalePayload) | string {
    if (!organization || !holder) return 'Selecciona el cliente de la venta.'
    if (!Number.isFinite(rateValue) || rateValue <= 0) return 'Indica una tasa de cambio mayor que 0.'
    const customerRef = (customer: SaleCustomer) => (customer.id > 0 ? { id: customer.id } : { new: newCustomers[customer.id] })
    const lines: OfflineSalePayload['pairs'] = []
    for (const [index, pair] of pairs.entries()) {
      const label = pairs.length > 1 ? `el par ${index + 1}` : 'la venta'
      const adjustments = pairAdjustmentsOrError(pair, items, organization.canApproveLargeDiscount, label)
      if (typeof adjustments === 'string') return adjustments
      const local = localRevisions.find((entry) => entry.id === pair.revisionId)
      lines.push({
        patient: pair.patient ? customerRef(pair.patient) : { holder: true },
        prescription: local ? { new: local.data } : pair.revisionId > 0 ? { revisionId: pair.revisionId } : null,
        itemIds: pair.selected,
        lineAdjustments: adjustments,
      })
    }
    const paid = payment.amount.trim() ? Number(payment.amount.replace(',', '.')) : 0
    if (!Number.isFinite(paid) || paid < 0) return 'Indica un importe cobrado válido.'
    const paidCup = payment.currency === 'USD' ? paid * rateValue : paid
    if (paidCup - estimateCup > (payment.currency === 'USD' ? rateValue * 0.01 : 0.001)) return 'Lo cobrado supera el total de la venta.'
    return ({ deviceId, localNumber, soldAt }) => ({
      organizationId, branchId, soldAt, localNumber, deviceId, usdToCupRate: rateValue, notes: notes.trim() || undefined,
      holder: customerRef(holder),
      pairs: lines,
      payment: paid > 0 ? { amount: paid, currency: payment.currency, appliedRate: payment.currency === 'USD' ? rateValue : 1 } : null,
      device: { totals: estimate, cupEquivalent: estimateCup },
    })
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!organization?.canOperate) return setMessage('Esta organización está en modo de solo lectura.')
    const build = buildOrError()
    if (typeof build === 'string') return setMessage(build)
    setSaving(true)
    try {
      const sale = await onSave(build)
      startNewSale()
      setMessage(`Venta ${sale.localNumber} guardada en este teléfono. Se subirá sola cuando vuelva la señal.`)
    } catch {
      setMessage('No se pudo guardar la venta en este teléfono. No cierres la pantalla e inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const dialogPair = dialog && dialog.kind !== 'customer' ? pairs[dialog.pairIndex] : undefined
  return (
    <>
      <form onSubmit={save} noValidate className="flex flex-col gap-5">
        {message ? <Alert tone={message.startsWith('Venta ') ? 'success' : 'warning'} role="status">{message}</Alert> : null}
        <Card className="flex flex-col gap-4">
          <h2 className="font-display text-[17px] font-semibold text-ink">Cliente</h2>
          {organizations.length > 1 ? (
            <Field label="Organización y sucursal">
              <FormSelect ariaLabel="Organización y sucursal" value={scopeKey} onValueChange={(value) => { setScopeKey(value); setRate(String(referenceRate(Number(value.split(':')[0])))); startNewSale() }}
                options={organizations.map((entry) => ({ value: `${entry.id}:${entry.branchId}`, label: `${entry.name} · ${entry.branchName}` }))} />
            </Field>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-semibold text-text-label">Quien encarga y paga</span>
              <Button variant="ghost" size="sm" icon={Plus} onClick={() => setDialog({ kind: 'customer' })} className="-mr-2">Nuevo cliente</Button>
            </div>
            <CustomerSearchPicker organizationId={organizationId} branchId={branchId} recent={[]} selected={holder} onSelect={selectHolder} onClear={() => selectHolder(null)} search={search} />
          </div>
          <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-secondary">
            <span>Tasa de esta venta: 1 USD =</span>
            <span className="w-28"><Input aria-label="Tasa de cambio de USD a CUP" value={rate} onChange={(event) => setRate(event.target.value)} inputMode="decimal" numeric /></span>
            <span>CUP</span>
          </label>
        </Card>

        {pairs.map((pair, index) => (
          <PairEditor key={pair.key} index={index} pairCount={pairs.length} pair={pair} holder={holder} scope={{ organizationId, branchId }}
            relatives={relatives.filter((entry) => entry.id !== holder?.id)} revisions={revisionsFor(pair)} groupedItems={groupedItems} searchCustomers={search}
            onPatientChange={(next) => setPatient(index, next)}
            onRevisionChange={(revisionId) => updatePair(index, (current) => ({ ...current, revisionId }))}
            onToggle={(itemId) => updatePair(index, (current) => ({ ...current, selected: toggleItem(current.selected, itemId, items) }))}
            onAgreedPriceChange={(itemId, value) => updatePair(index, (current) => ({ ...current, agreedPrices: { ...current.agreedPrices, [itemId]: value } }))}
            onAdjustmentReasonChange={(itemId, value) => updatePair(index, (current) => ({ ...current, adjustmentReasons: { ...current.adjustmentReasons, [itemId]: value } }))}
            onNewRelative={() => setDialog({ kind: 'relative', pairIndex: index })}
            onNewPrescription={() => setDialog({ kind: 'prescription', pairIndex: index })}
            onRemove={() => setPairs((current) => (current.length > 1 ? current.filter((_, position) => position !== index) : current))} />
        ))}

        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">¿Espejuelos para otra persona?</p>
            <Button variant="secondary" icon={Plus} disabled={!holder || pairs.length >= MAX_PAIRS} onClick={() => setPairs((current) => [...current, newPair()])}>Agregar par</Button>
          </div>
          <Field label="Notas comerciales" optional>
            <Textarea maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </Card>

        <OfflinePaymentCard estimate={estimate} estimateCup={estimateCup} rate={rateValue} payment={payment} onChange={setPayment} />

        <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-3 border-t border-line-soft bg-surface px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] md:static md:mx-0 md:rounded-card md:border">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-text-muted">Total estimado</p>
            <p className="truncate font-display text-lg font-bold tabular-nums text-ink">{totalLabel(estimate)}</p>
          </div>
          <Button type="submit" variant="ink" icon={Save} disabled={saving || !ready} className="shrink-0">{saving ? 'Guardando…' : 'Guardar venta'}</Button>
        </div>
      </form>

      <OfflineCustomerDialog open={dialog?.kind === 'customer'} scope={{ organizationId, branchId, label: organization ? `${organization.name} · ${organization.branchName}` : '' }}
        findDuplicates={(name, phones) => savedDuplicates(snapshot, organizationId, branchId, name, phones)} onClose={() => setDialog(null)}
        onUseExisting={(customer) => { selectHolder(customer); setDialog(null) }}
        onCreated={(data) => { selectHolder(addLocalCustomer(data)); setDialog(null); setMessage(`${data.fullName} se registrará al subir la venta.`) }} />
      <OfflineRelativeDialog open={dialog?.kind === 'relative'} holder={holder} holderPhone={holderPhone} onClose={() => setDialog(null)}
        onCreated={(data) => { if (dialog?.kind === 'relative') setPatient(dialog.pairIndex, addLocalCustomer(data)); setDialog(null) }} />
      <OfflinePrescriptionDialog open={dialog?.kind === 'prescription'} patient={dialogPair ? patientOf(dialogPair) : null}
        optometristNames={snapshot.optometrists.filter((entry) => entry.organizationId === organizationId).map((entry) => entry.name)} onClose={() => setDialog(null)}
        onCreated={(data, prescriptionDate) => {
          const patient = dialogPair ? patientOf(dialogPair) : null
          if (!patient || !dialogPair || dialog?.kind !== 'prescription') return
          const revision: LocalRevision = { id: takeLocalId(), organizationId, branchId, customerId: patient.id, label: `Receta nueva · ${prescriptionDate}`, pairKey: dialogPair.key, data }
          setLocalRevisions((current) => [revision, ...current])
          updatePair(dialog.pairIndex, (current) => ({ ...current, revisionId: revision.id }))
          setDialog(null)
        }} />
    </>
  )
}
