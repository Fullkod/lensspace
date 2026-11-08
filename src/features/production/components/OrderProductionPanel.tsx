'use client'

import { Factory, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'

import { createClient } from '@/lib/supabase/client'
import { FormSelect } from '@/shared/components'
import { friendlyError } from '@/shared/lib/friendly-error'
import { refreshNavigationCounters } from '@/shared/lib/navigation-counters'
import { Alert, Badge, Button } from '@/shared/ui'

import { productionStatusLabel, statusTone } from '../production-status'

type JobType = 'lens' | 'mounting'
type CurrentJob = { id: number; orderLineId: number; jobType: JobType; status: string; providerId: string }
type Assignee = { id: string; name: string; roles: string[] }
type Pair = { id: number; lineNumber: number; patientName: string }
// pairCount/readyPairs let the order warn "Faltan 1 de 3 pares" (LEN0006).
export type ProductionReadiness = { hasJobs: boolean; ready: boolean; pairCount: number; readyPairs: number }

const jobLabels: Record<JobType, string> = { lens: 'Cristales', mounting: 'Montaje' }
const providerRole: Record<JobType, string> = { lens: 'lens_provider', mounting: 'mounting_provider' }
const finished = (status: string) => status === 'received' || status === 'reviewed'
const ALL_PAIRS = 'all'

// Production state and assignment from the order itself (QA-13/QA-14): the seller
// sends the work without leaving the sale, and delivery can warn when it is unfinished.
// A family order (LEN0006) lists each pair with its jobs; one job type goes to every
// pair still missing it ("Todos los pares") or to a single pair.
export function OrderProductionPanel({ orderId, canAssign, delivered = false, onReadinessChange }: { orderId: number; canAssign: boolean; delivered?: boolean; onReadinessChange?: (readiness: ProductionReadiness) => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [jobs, setJobs] = useState<CurrentJob[] | null>(null)
  const [pairs, setPairs] = useState<Pair[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [choice, setChoice] = useState<Record<JobType, string>>({ lens: '', mounting: '' })
  const [scope, setScope] = useState<Record<JobType, string>>({ lens: ALL_PAIRS, mounting: ALL_PAIRS })
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  const multi = pairs.length > 1

  // One RPC (QA-35) instead of 4 requests in 3 sequential stages.
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_order_production_panel', { target_order_id: orderId } as never)
    if (error || !data) return setMessage('No pudimos cargar la producción de este pedido.')
    const panel = data as unknown as { jobs: (CurrentJob & { providerName: string })[]; pairs?: Pair[]; assignees: Assignee[] }
    setNames(Object.fromEntries([...panel.assignees.map((assignee) => [assignee.id, assignee.name]), ...panel.jobs.map((job) => [job.providerId, job.providerName])]))
    setAssignees(panel.assignees)
    setPairs(panel.pairs ?? [])
    setJobs(panel.jobs)
  }, [orderId, supabase])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const pairReady = useCallback((pairId: number) => {
    const own = (jobs ?? []).filter((job) => job.orderLineId === pairId)
    return own.length > 0 && own.every((job) => finished(job.status))
  }, [jobs])

  useEffect(() => {
    if (!jobs) return
    const pairCount = Math.max(pairs.length, 1)
    const readyPairs = pairs.length ? pairs.filter((pair) => pairReady(pair.id)).length : Number(jobs.length > 0 && jobs.every((job) => finished(job.status)))
    onReadinessChange?.({ hasJobs: jobs.length > 0, ready: jobs.length > 0 && readyPairs === pairCount, pairCount, readyPairs })
  }, [jobs, pairs, pairReady, onReadinessChange])

  function optionsFor(jobType: JobType) {
    return assignees
      .filter((assignee) => assignee.roles.includes(providerRole[jobType]) || assignee.roles.includes('in_house'))
      .map((assignee) => ({ value: assignee.id, label: assignee.roles.includes('in_house') ? `${assignee.name} (taller propio)` : assignee.name }))
  }

  function assign(jobType: JobType, providerId: string, lineIds: number[]) {
    startTransition(async () => {
      const { error } = multi
        ? await supabase.rpc('assign_production_jobs', { target_order_id: orderId, job_type: jobType, provider_id: providerId, target_order_line_ids: lineIds } as never)
        : await supabase.rpc('assign_production_job', { target_order_id: orderId, job_type: jobType, provider_id: providerId } as never)
      if (error) return setMessage(friendlyError(error, 'No pudimos enviar el trabajo.'))
      const target = multi ? (lineIds.length === 1 ? ` del par ${pairs.find((pair) => pair.id === lineIds[0])?.lineNumber ?? ''}` : ` de ${lineIds.length} pares`) : ''
      setMessage(`${jobLabels[jobType]}${target} enviados a ${names[providerId] ?? 'producción'}.`)
      setScope((current) => ({ ...current, [jobType]: ALL_PAIRS }))
      void refreshNavigationCounters()
      await load()
    })
  }

  if (!jobs) return <p className="text-sm text-text-muted">{message || 'Cargando producción…'}</p>
  const ready = jobs.length > 0 && (multi ? pairs.every((pair) => pairReady(pair.id)) : jobs.every((job) => finished(job.status)))
  const missingPairs = (jobType: JobType) => multi ? pairs.filter((pair) => !jobs.some((job) => job.jobType === jobType && job.orderLineId === pair.id)) : (jobs.some((job) => job.jobType === jobType) ? [] : pairs.slice(0, 1))
  const jobRow = (job: CurrentJob) => (
    <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-text-secondary"><strong className="text-ink">{jobLabels[job.jobType]}</strong> · {names[job.providerId] ?? 'Proveedor'}</span>
      <Badge tone={statusTone(job.status)}>{productionStatusLabel(job.status, job.jobType)}</Badge>
    </div>
  )

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line-card px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-[16px] font-semibold text-ink"><Factory aria-hidden="true" size={17} className="text-action" />Producción</h3>
        {delivered ? <Badge tone="neutral">Entregado al cliente</Badge> : ready ? <Badge tone="success">{multi ? 'Todos los pares listos' : 'Listo para recoger'}</Badge> : null}
      </div>
      {multi ? pairs.map((pair) => {
        const own = jobs.filter((job) => job.orderLineId === pair.id)
        return (
          <div key={pair.id} className="flex flex-col gap-1.5 rounded-control border border-line-soft px-3 py-2.5">
            <p className="flex flex-wrap items-center justify-between gap-2 text-[13px] font-semibold text-ink">
              <span className="min-w-0 [overflow-wrap:anywhere]">Par {pair.lineNumber} · {pair.patientName}</span>
              {pairReady(pair.id) && !delivered ? <Badge tone="success">Listo</Badge> : null}
            </p>
            {own.length ? own.map(jobRow) : <p className="text-sm text-text-muted">Sin enviar a producción.</p>}
          </div>
        )
      }) : jobs.map(jobRow)}
      {canAssign ? (['lens', 'mounting'] as JobType[]).map((jobType) => {
        const missing = missingPairs(jobType)
        if (!missing.length && (multi || jobs.some((job) => job.jobType === jobType))) return null
        const options = optionsFor(jobType)
        const selectedId = choice[jobType] || (options.length === 1 ? options[0].value : '')
        const selectedScope = missing.some((pair) => String(pair.id) === scope[jobType]) ? scope[jobType] : ALL_PAIRS
        const lineIds = selectedScope === ALL_PAIRS ? missing.map((pair) => pair.id) : [Number(selectedScope)]
        return (
          <div key={jobType} className="flex flex-col gap-2 border-t border-line-soft pt-3 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="shrink-0 text-sm font-semibold text-ink sm:w-24">{jobLabels[jobType]}</span>
            {multi ? (
              <div className="min-w-0 sm:basis-full sm:order-last">
                <FormSelect ariaLabel={`Pares para ${jobLabels[jobType].toLowerCase()}`} value={selectedScope} onValueChange={(value) => setScope((current) => ({ ...current, [jobType]: value }))}
                  options={[{ value: ALL_PAIRS, label: missing.length === pairs.length ? `Todos los pares (${missing.length})` : `Pares sin enviar (${missing.length})` }, ...missing.map((pair) => ({ value: String(pair.id), label: `Solo par ${pair.lineNumber} · ${pair.patientName}` }))]} />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <FormSelect ariaLabel={`Responsable de ${jobLabels[jobType].toLowerCase()}`} value={selectedId} onValueChange={(value) => setChoice((current) => ({ ...current, [jobType]: value }))} options={[{ value: '', label: options.length ? 'Selecciona responsable' : 'Sin responsables activos' }, ...options]} />
            </div>
            <Button size="sm" icon={Send} disabled={pending || !selectedId || (multi && !lineIds.length)} onClick={() => assign(jobType, selectedId, lineIds)}>{pending ? 'Enviando…' : 'Enviar'}</Button>
          </div>
        )
      }) : null}
      {!jobs.length && !canAssign ? <p className="text-sm text-text-muted">Aún no se ha enviado a producción.</p> : null}
      {message ? <Alert tone="info">{message}</Alert> : null}
    </div>
  )
}
