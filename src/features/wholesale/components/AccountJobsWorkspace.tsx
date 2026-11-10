'use client'

import { ChevronDown, FileText, Plus, Save, Truck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, type FormEvent } from 'react'

import { PrescriptionFormFields } from '@/features/prescriptions/components'
import { friendlyPrescriptionError, prescriptionRevisionValues, validatePrescriptionForm } from '@/features/prescriptions/prescription-validation'
import { ItemPicker, pairEstimate, toggleItem, type PairDraft, type SaleItem } from '@/features/sales/components'
import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/shared/lib/friendly-error'
import { newRequestId } from '@/shared/utils/request-id'
import { Alert, Badge, Button, Card, Dialog, EmptyState, PageHeader, StatCard, Toast } from '@/shared/ui'

import { balanceUsd, formatUsd, jobsLabel, paymentLabels, paymentTones, statusLabels, statusTones, totalUsd, type CommercialStatus, type PaymentStatus } from '../order-types'
import { formatPrice } from '../types'

type PortalLine = { id: number; lineNumber: number; totals: Record<string, number>; addedAt: string; deliveredAt: string | null; hasPrescription: boolean; hasProduction: boolean; items: { name: string; amount: number; currency: string }[] }
type PortalOrder = { id: number; orderNumber: string; status: CommercialStatus; paymentStatus: PaymentStatus; totals: Record<string, number>; cupEquivalent: number; rate: number; paidCup: number; createdAt: string; lines: PortalLine[] }
export type AccountPortal = { membershipId: number; organizationName: string; branchName: string; accountName: string; canWork: boolean; prices: SaleItem[]; orders: PortalOrder[] }

const emptyPair = (): PairDraft => ({ key: 'job', patient: null, revisionId: 0, selected: [], agreedPrices: {}, adjustmentReasons: {} })
const money = (totals: Record<string, number>) => Object.entries(totals).map(([currency, total]) => formatPrice(Number(total), currency)).join(' + ')

function NewJob({ portal, onAdded, onCancel }: { portal: AccountPortal; onAdded: (message: string) => void; onCancel: () => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [pair, setPair] = useState<PairDraft>(emptyPair)
  const [prescriptionOpen, setPrescriptionOpen] = useState(false)
  const [revisionLabel, setRevisionLabel] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(newRequestId())
  const groupedItems = Object.entries(portal.prices.reduce<Record<string, SaleItem[]>>((groups, item) => { (groups[item.category] ??= []).push(item); return groups }, {}))
  const estimate = Object.entries(pairEstimate(pair, portal.prices)).map(([currency, total]) => formatPrice(total, currency)).join(' + ')

  async function createPrescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const validationError = validatePrescriptionForm(form)
    if (validationError) return setError(validationError)
    setPending(true); setError(null)
    const { data, error: createError } = await supabase.rpc('create_my_account_prescription', { target_membership_id: portal.membershipId, revision: prescriptionRevisionValues(form) } as never)
    setPending(false)
    if (createError) return setError(friendlyPrescriptionError(createError.message))
    setPair((current) => ({ ...current, revisionId: (data as unknown as { revisionId: number }).revisionId }))
    setRevisionLabel(`Receta del ${String(form.get('prescriptionDate'))}`)
    setPrescriptionOpen(false)
  }

  async function save() {
    setPending(true); setError(null)
    const { data, error: addError } = await supabase.rpc('add_my_account_job', {
      target_membership_id: portal.membershipId,
      target_line: { prescriptionRevisionId: pair.revisionId || null, itemIds: pair.selected },
      request_id: requestId.current,
    } as never)
    setPending(false)
    if (addError) return setError(friendlyError(addError, 'No pudimos agregar el trabajo.'))
    onAdded(`Trabajo ${(data as { lineNumber: number }).lineNumber} agregado.`)
  }

  return <Card className="flex flex-col gap-5">
    <div>
      <h2 className="font-display text-[17px] font-semibold text-ink">Agregar trabajo</h2>
      <p className="mt-1 text-sm text-text-muted">Estos son tus precios. Al agregarlo, el trabajo queda en tu pedido abierto.</p>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-text">{revisionLabel ?? 'Sin receta todavía'}</span>
      <Button variant="ghost" size="sm" icon={FileText} onClick={() => { setError(null); setPrescriptionOpen(true) }}>{revisionLabel ? 'Cambiar receta' : 'Agregar receta'}</Button>
    </div>

    <ItemPicker readOnlyPrices groupedItems={groupedItems} selected={pair.selected} agreedPrices={{}} adjustmentReasons={{}}
      onToggle={(itemId) => setPair((current) => ({ ...current, selected: toggleItem(current.selected, itemId, portal.prices) }))}
      onAgreedPriceChange={() => undefined} onAdjustmentReasonChange={() => undefined} />

    {error && !prescriptionOpen ? <Alert tone="danger" role="alert">{error}</Alert> : null}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <span className="text-sm text-text-muted">Total: <strong className="text-ink">{estimate || '—'}</strong></span>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancelar</Button>
        <Button onClick={() => void save()} disabled={pending || !pair.selected.length}>{pending ? 'Guardando…' : 'Agregar al pedido'}</Button>
      </div>
    </div>

    <Dialog open={prescriptionOpen} onClose={() => { if (!pending) setPrescriptionOpen(false) }} eyebrow={portal.accountName} title="Receta del trabajo" size="lg" footer={<>
      <Button variant="ghost" onClick={() => setPrescriptionOpen(false)} disabled={pending}>Cancelar</Button>
      <Button type="submit" form="account-job-prescription" formNoValidate icon={Save} disabled={pending}>{pending ? 'Guardando…' : 'Guardar receta'}</Button>
    </>}>
      <form id="account-job-prescription" onSubmit={createPrescription} className="flex flex-col gap-4" noValidate>
        <PrescriptionFormFields allowAttachment={false} />
        {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
      </form>
    </Dialog>
  </Card>
}

function lineStatus(line: PortalLine) {
  if (line.deliveredAt) return <Badge tone="success">Entregado</Badge>
  return line.hasProduction ? <Badge tone="progress">En producción</Badge> : <Badge>Recibido</Badge>
}

function PortalSection({ portal, onAdded }: { portal: AccountPortal; onAdded: (message: string) => void }) {
  const [adding, setAdding] = useState(false)
  const debt = portal.orders.reduce((sum, order) => sum + balanceUsd(order), 0)
  const inProgress = portal.orders.filter(({ status }) => status !== 'delivered' && status !== 'closed').length

  return <div className="flex flex-col gap-5">
    <PageHeader variant="featured" eyebrow={portal.organizationName} title={portal.accountName} description={`Tus trabajos para ${portal.organizationName}, sucursal ${portal.branchName}.`}
      stats={<>
        <StatCard surface="ink" tone={debt > 0 ? 'attention' : 'positive'} label="Lo que debes" value={formatUsd(debt)} />
        <StatCard surface="ink" label="Pedidos en curso" value={inProgress} />
      </>} />

    {!portal.canWork ? <Alert tone="warning">Ahora mismo no se pueden agregar trabajos. Consulta a tu proveedor.</Alert>
      : portal.prices.length === 0 ? <Alert tone="warning">Tu proveedor todavía no ha preparado tu catálogo.</Alert>
      : adding ? <NewJob portal={portal} onCancel={() => setAdding(false)} onAdded={(message) => { setAdding(false); onAdded(message) }} />
      : <Button icon={Plus} className="self-start" onClick={() => setAdding(true)}>Agregar trabajo</Button>}

    {portal.orders.length === 0 ? <EmptyState icon={Truck} title="Aún no tienes trabajos" description="Cuando agregues el primero, aparecerá aquí." />
      : <div className="flex flex-col gap-2.5">
        {portal.orders.map((order) => <details key={order.id} className="group rounded-card border border-line bg-surface" open={order.status === 'open'}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action">
            <div className="flex min-w-0 flex-1 basis-full flex-col gap-1 sm:basis-0">
              <span className="truncate text-[15px] font-semibold text-ink">{order.orderNumber} · {jobsLabel(order.lines.length)}</span>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={statusTones[order.status]}>{statusLabels[order.status]}</Badge>
                {order.status !== 'open' ? <Badge tone={paymentTones[order.paymentStatus]}>{paymentLabels[order.paymentStatus]}</Badge> : null}
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-display text-[15px] font-bold tabular-nums text-ink">{formatUsd(totalUsd(order))}</span>
              {balanceUsd(order) > 0 ? <span className="text-[13px] font-semibold text-coral">Debes {formatUsd(balanceUsd(order))}</span> : null}
            </div>
            <ChevronDown aria-hidden="true" size={18} className="text-text-muted transition group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-2 border-t border-line-soft px-4 pb-4 pt-3">
            {order.lines.map((line) => <div key={line.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-sm">
              <div className="flex min-w-0 flex-1 basis-full flex-col gap-1 sm:basis-0">
                <span className="font-semibold text-ink">Trabajo {line.lineNumber}</span>
                <span className="text-[13px] text-text-muted [overflow-wrap:anywhere]">{line.items.map(({ name }) => name).join(' · ')}</span>
              </div>
              <div className="flex items-center gap-2">
                {!line.hasPrescription ? <Badge>Sin receta</Badge> : null}
                {lineStatus(line)}
                <span className="tabular-nums text-ink">{money(line.totals)}</span>
              </div>
            </div>)}
          </div>
        </details>)}
      </div>}
  </div>
}

// The only screen of an optician's own user: add jobs at its prices and see what it owes.
export function AccountJobsWorkspace({ portals }: { portals: AccountPortal[] }) {
  const router = useRouter()
  const [toast, setToast] = useState('')
  if (!portals.length) return <EmptyState icon={Truck} title="Sin acceso" description="Tu cuenta no está vinculada a ninguna óptica." />
  return <div className="flex flex-col gap-8">
    {portals.map((portal) => <PortalSection key={portal.membershipId} portal={portal} onAdded={(message) => { setToast(message); router.refresh() }} />)}
    <Toast message={toast} onDismiss={() => setToast('')} />
  </div>
}
