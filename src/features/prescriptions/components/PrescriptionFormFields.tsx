import { Upload } from 'lucide-react'

import { FormSelect } from '@/shared/components'
import { Field, Input, Textarea } from '@/shared/ui'
import { todayIn } from '@/shared/utils/dates'

import { OptometristInput } from './OptometristInput'

const eyes = [
  { key: 'right', label: 'OD', name: 'Ojo derecho' },
  { key: 'left', label: 'OI', name: 'Ojo izquierdo' },
] as const

const measures = [
  { suffix: 'Sphere', label: 'Esfera', min: '-40', max: '40', step: '0.25' },
  { suffix: 'Cylinder', label: 'Cilindro', min: '-20', max: '20', step: '0.25' },
  { suffix: 'Axis', label: 'Eje', min: '0', max: '180', step: '1' },
  { suffix: 'Addition', label: 'Adición', min: '0', max: '8', step: '0.25' },
  { suffix: 'PupillaryDistance', label: 'DP', min: '15', max: '50', step: '0.5' },
  { suffix: 'Height', label: 'Altura', min: '0', max: '60', step: '0.5' },
] as const

const prismBases = [{ value: '', label: 'Sin base' }, { value: 'up', label: 'Arriba' }, { value: 'down', label: 'Abajo' }, { value: 'in', label: 'Interna' }, { value: 'out', label: 'Externa' }]

// One block per eye: 3 columns on mobile, 6 from md, so no horizontal scroll is needed.
export function PrescriptionFormFields({ organizationId, allowAttachment = true, optometristNames }: { organizationId?: number; allowAttachment?: boolean; optometristNames?: string[] }) {
  return (
    <div className="flex flex-col gap-5">
      {eyes.map((eye) => (
        <fieldset key={eye.key} className="rounded-card border border-line-card bg-field p-4">
          <legend className="sr-only">{eye.name}</legend>
          <p aria-hidden="true" className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold text-ink">
            <span className="grid h-7 min-w-9 place-items-center rounded-badge bg-ink px-1.5 text-xs font-bold text-white">{eye.label}</span>
            {eye.name}
          </p>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {measures.map((measure) => (
              <Field key={measure.suffix} label={measure.label}>
                <Input name={`${eye.key}${measure.suffix}`} type="number" inputMode="decimal" min={measure.min} max={measure.max} step={measure.step} numeric />
              </Field>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="grid gap-[18px] md:grid-cols-2 lg:grid-cols-3">
        <Field label="DP conjunta"><Input name="pupillaryDistanceTotal" type="number" inputMode="decimal" min="30" max="90" step="0.5" numeric /></Field>
        {eyes.map((eye) => (
          <div key={eye.key} className="grid grid-cols-2 gap-2">
            <Field label={`Prisma ${eye.label}`}><Input name={`${eye.key}Prism`} type="number" inputMode="decimal" min="0" max="20" step="0.25" numeric /></Field>
            <Field label="Base"><FormSelect name={`${eye.key}PrismBase`} ariaLabel={`Base del prisma ${eye.label}`} options={prismBases} /></Field>
          </div>
        ))}
        <Field label="Fecha de la receta"><Input name="prescriptionDate" type="date" required defaultValue={todayIn()} /></Field>
        <OptometristInput organizationId={organizationId} knownNames={optometristNames} className="md:col-span-2" />
        <Field label="Observaciones" className="md:col-span-2 lg:col-span-3"><Textarea name="notes" rows={3} /></Field>
      </div>

      {allowAttachment ? (
        <label className="flex cursor-pointer flex-col gap-2 rounded-card border border-dashed border-line-focus bg-action-wash p-4 text-[15px] text-text transition hover:border-action">
          <span className="flex items-center gap-2 font-semibold text-ink">
            <Upload aria-hidden="true" size={18} className="text-action" />
            Original privado <span className="text-[13px] font-normal text-text-muted">(opcional, JPG, PNG, WebP o PDF, máx. 10 MB)</span>
          </span>
          <input className="block w-full text-sm text-text-muted file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-[8px] file:border-0 file:bg-action-soft file:px-3 file:font-display file:text-[13px] file:font-semibold file:text-action" name="attachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
        </label>
      ) : null}
    </div>
  )
}
