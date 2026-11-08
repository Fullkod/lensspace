'use client'

import { FileText, RefreshCcw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

import { Badge, Button, Card, Dialog } from '@/shared/ui'
import { formatBusinessDate } from '@/shared/utils/dates'

import { productionStatusLabel, responsibilityLabels, statusTone } from '../production-status'
import type { PrescriptionSnapshot, ProductionJob } from './ProductionWorkspace'

type ProductionJobCardProps = {
  job: ProductionJob
  showCustomer: boolean
  // Providers already know the job is theirs; the optical needs to see who has it.
  showProvider: boolean
  // Only the optical (owner/seller) decides on a rework; providers just see it pending.
  canAuthorizeRework: boolean
  transitionLabel?: string
  secondaryTransitionLabel?: string
  transitionOnBehalf?: boolean
  secondaryOnBehalf?: boolean
  pending: boolean
  onTransition: () => void
  onSecondaryTransition: () => void
  onReportIncident: () => void
  onCreateRework: (incidentId: number) => void
}

export function ProductionJobCard({ job, showCustomer, showProvider, canAuthorizeRework, transitionLabel, secondaryTransitionLabel, transitionOnBehalf, secondaryOnBehalf, pending, onTransition, onSecondaryTransition, onReportIncident, onCreateRework }: ProductionJobCardProps) {
  const hasIncident = job.status === 'incident'
  // LEN0006: "OJV-2026-000012 · Par 2 de 3"; providers never see who wears it.
  const title = (job.snapshot.lineCount ?? 1) > 1 ? `${job.orderNumber} · Par ${job.snapshot.lineNumber} de ${job.snapshot.lineCount}` : job.orderNumber
  const meta = [job.jobType === 'lens' ? 'Cristales' : 'Montaje', showProvider ? job.providerName : null, formatBusinessDate(job.assignedAt)].filter(Boolean).join(' · ')
  // QA-25: a job replaced by an accepted rework is history; keep it short and inert.
  if (job.isCurrent === false) {
    return (
      <Card className="flex flex-col gap-1.5 opacity-80">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <strong className="font-display text-[15px] text-ink">{title}</strong>
          <Badge tone="neutral">Sustituido por repetición</Badge>
        </div>
        <p className="text-[13px] text-text-muted">{meta}</p>
        {job.incidents[0] ? <p className="text-[13px] text-text-secondary [overflow-wrap:anywhere]">Incidencia: {job.incidents[0].description}</p> : null}
      </Card>
    )
  }
  return (
    <Card tone={hasIncident ? 'danger' : 'default'} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <strong className="font-display text-[15px] text-ink">{title}</strong>
        <div className="flex flex-wrap gap-1.5">
          {job.originalJobId ? <Badge tone="warning">Repetición</Badge> : null}
          <Badge tone={statusTone(job.status)}>{productionStatusLabel(job.status, job.jobType)}</Badge>
        </div>
      </div>
      <div>
        {showCustomer && job.customerName ? <p className="text-[15px] font-semibold text-ink">{job.customerName}</p> : null}
        <p className="mt-0.5 text-[13px] text-text-muted">{meta}</p>
      </div>
      <p className="text-sm leading-6 text-text-secondary">{job.snapshot.items?.map((item) => item.name).join(' · ') || 'Configuración preservada en la asignación.'}</p>
      <PrescriptionDetails prescription={job.snapshot.prescription} eyebrow={`${title} · ${job.jobType === 'lens' ? 'Cristales' : 'Montaje'}`} />
      {job.incidents.map((incident) => (
        <div key={incident.id} className="flex flex-col gap-2 rounded-[12px] border border-coral-line bg-coral-tint px-4 py-3 text-sm text-coral-deep">
          <p className="flex gap-2"><TriangleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-coral-ink" />{incident.description}</p>
          <p className="font-semibold">Costo: {responsibilityLabels[incident.costResponsibility] ?? incident.costResponsibility}</p>
          {incident.reworkJobId ? <p>Repetición vinculada</p> : canAuthorizeRework ? (
            <div><Button variant="attention" size="sm" icon={RefreshCcw} disabled={pending} onClick={() => onCreateRework(incident.id)}>Aceptar repetición</Button></div>
          ) : <p>Pendiente de decisión de la óptica</p>}
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
        {transitionLabel ? <Button disabled={pending} onClick={onTransition} title={transitionOnBehalf ? `${transitionLabel} en nombre del proveedor` : undefined} aria-label={transitionOnBehalf ? `${transitionLabel} en nombre del proveedor` : undefined} className="sm:flex-1">{transitionLabel}</Button> : null}
        {secondaryTransitionLabel ? <Button variant="secondary" disabled={pending} onClick={onSecondaryTransition} title={secondaryOnBehalf ? `${secondaryTransitionLabel} en nombre del proveedor` : undefined} aria-label={secondaryOnBehalf ? `${secondaryTransitionLabel} en nombre del proveedor` : undefined} className="sm:flex-1">{secondaryTransitionLabel}</Button> : null}
        {!hasIncident ? <Button variant="danger" icon={TriangleAlert} disabled={pending} onClick={onReportIncident}>Incidencia</Button> : null}
      </div>
    </Card>
  )
}

const prismBaseLabels: Record<string, string> = { up: 'Arriba', down: 'Abajo', in: 'Interna', out: 'Externa' }
const prescriptionValue = (value: number | null | undefined, suffix = '') => value === null || value === undefined ? '—' : `${Number(value).toLocaleString('es-CU', { maximumFractionDigits: 2 })}${suffix}`

// Opens in a dialog so expanding one card never stretches its grid row.
// One block per eye (3 columns on mobile) instead of a wide table.
function PrescriptionDetails({ prescription, eyebrow }: { prescription?: PrescriptionSnapshot | null; eyebrow: string }) {
  const [open, setOpen] = useState(false)
  if (!prescription) return <p className="rounded-control border border-dashed border-line px-3 py-2.5 text-[13px] text-text-muted">Este trabajo no tiene una receta asociada.</p>
  const eyes = [
    { label: 'OD', values: [['Esfera', prescriptionValue(prescription.right_sphere)], ['Cilindro', prescriptionValue(prescription.right_cylinder)], ['Eje', prescriptionValue(prescription.right_axis, '°')], ['Adición', prescriptionValue(prescription.right_addition)], ['DP', prescriptionValue(prescription.right_pupillary_distance, ' mm')], ['Altura', prescriptionValue(prescription.right_height, ' mm')]] },
    { label: 'OI', values: [['Esfera', prescriptionValue(prescription.left_sphere)], ['Cilindro', prescriptionValue(prescription.left_cylinder)], ['Eje', prescriptionValue(prescription.left_axis, '°')], ['Adición', prescriptionValue(prescription.left_addition)], ['DP', prescriptionValue(prescription.left_pupillary_distance, ' mm')], ['Altura', prescriptionValue(prescription.left_height, ' mm')]] },
  ]
  return (
    <>
      <Button variant="secondary" icon={FileText} onClick={() => setOpen(true)} className="w-full">Ver receta de fabricación</Button>
      <Dialog open={open} onClose={() => setOpen(false)} eyebrow={eyebrow} title="Receta de fabricación" size="md" footer={<Button onClick={() => setOpen(false)}>Cerrar</Button>}>
        <div className="flex flex-col gap-3">
          {eyes.map((eye) => (
            <div key={eye.label}>
              <p className="mb-1.5 font-display text-xs font-bold text-ink">{eye.label}</p>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-6">
                {eye.values.map(([label, value]) => <div key={label}><dt className="text-[12px] text-text-muted">{label}</dt><dd className="font-display text-sm font-semibold tabular-nums text-ink">{value}</dd></div>)}
              </dl>
            </div>
          ))}
          <div className="grid gap-1.5 border-t border-line pt-3 text-[13px] text-text-secondary sm:grid-cols-2">
            <p><strong className="text-ink">DP conjunta:</strong> {prescriptionValue(prescription.pupillary_distance_total, ' mm')}</p>
            <p><strong className="text-ink">Fecha:</strong> {prescription.prescription_date ?? '—'}</p>
            <p><strong className="text-ink">Prisma OD:</strong> {prescriptionValue(prescription.right_prism)} {prescription.right_prism_base ? `· ${prismBaseLabels[prescription.right_prism_base] ?? prescription.right_prism_base}` : ''}</p>
            <p><strong className="text-ink">Prisma OI:</strong> {prescriptionValue(prescription.left_prism)} {prescription.left_prism_base ? `· ${prismBaseLabels[prescription.left_prism_base] ?? prescription.left_prism_base}` : ''}</p>
            {prescription.prescriber_name ? <p className="sm:col-span-2"><strong className="text-ink">Médico u optometrista:</strong> {prescription.prescriber_name}</p> : null}
          </div>
        </div>
      </Dialog>
    </>
  )
}
