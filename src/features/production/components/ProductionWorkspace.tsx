'use client'

import { Factory, Plus, RefreshCcw, RotateCcw, SearchX, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import { FormEvent, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FormSelect, OperationalFilters } from '@/shared/components'
import { Alert, Button, ButtonLink, Dialog, EmptyState, Field, IconButton, PageHeader, SegmentedControl, StatCard, Textarea } from '@/shared/ui'
import { friendlyError } from '@/shared/lib/friendly-error'
import { useServerState } from '@/shared/hooks/use-server-state'
import { refreshNavigationCounters } from '@/shared/lib/navigation-counters'

import { productionStatusLabel, responsibilityLabels, statusLabels } from '../production-status'
import { ProductionJobCard } from './ProductionJobCard'

type Incident = { id: number; description: string; costResponsibility: string; openedAt: string; reworkJobId: number | null }
type IncidentResponsibility = 'organization' | 'lens_provider' | 'mounting_provider' | 'customer'
export type PrescriptionSnapshot = {
  prescription_date?: string | null
  prescriber_name?: string | null
  right_sphere?: number | null
  right_cylinder?: number | null
  right_axis?: number | null
  right_addition?: number | null
  right_prism?: number | null
  right_prism_base?: string | null
  left_sphere?: number | null
  left_cylinder?: number | null
  left_axis?: number | null
  left_addition?: number | null
  left_prism?: number | null
  left_prism_base?: string | null
  pupillary_distance_total?: number | null
  right_pupillary_distance?: number | null
  left_pupillary_distance?: number | null
  right_height?: number | null
  left_height?: number | null
}
export type ProductionJob = { id: number; orderId: number; orderLineId?: number; orderNumber: string; customerName?: string | null; jobType: 'lens' | 'mounting'; providerId: string; providerName: string; status: string; snapshot: { items?: { name: string }[]; prescription?: PrescriptionSnapshot | null; lineNumber?: number; lineCount?: number }; originalJobId: number | null; assignedAt: string; incidents: Incident[]; isCurrent?: boolean }
// One entry per pair of an order (LEN0006); single-pair orders have lineCount 1.
export type AssignmentOrder = { id: number; lineId: number; lineNumber: number; lineCount: number; patientName?: string | null; organizationId: number; orderNumber: string; customerName?: string | null }
export type Provider = { id: string; organizationId: number; name: string; role: 'lens_provider' | 'mounting_provider' | 'in_house' }
type JobAction = { target: string; label: string; onBehalf?: boolean }

// Optical actors (owner/seller) may also record the provider's steps: directly on
// their own in-house jobs, or "en nombre del proveedor" on someone else's.
function jobActions(job: ProductionJob, opticalActor: boolean, currentUserId: string): { primary?: JobAction; secondary?: JobAction } {
  const opticalTransitions: Record<string, { target: string; label: string }> = job.jobType === 'lens'
    ? { pending: { target: 'ready_to_send', label: 'Listo para enviar' }, ready_to_send: { target: 'dispatched', label: 'Marcar enviado' }, completed: { target: 'received', label: 'Marcar recibido' } }
    : { pending: { target: 'ready_to_send', label: 'Listo para enviar' }, ready_to_send: { target: 'dispatched', label: 'Marcar enviado' }, completed: { target: 'received', label: 'Marcar recibido' }, received: { target: 'reviewed', label: 'Marcar revisado' } }
  const providerTransitions: Record<string, { target: string; label: string }> = job.jobType === 'lens'
    ? { pending: { target: 'in_production', label: 'Iniciar fabricación' }, dispatched: { target: 'in_production', label: 'Iniciar fabricación' }, in_production: { target: 'completed', label: 'Marcar trabajo listo' } }
    : { pending: { target: 'in_mounting', label: 'Iniciar montaje' }, dispatched: { target: 'in_mounting', label: 'Iniciar montaje' }, in_mounting: { target: 'completed', label: 'Marcar trabajo listo' } }
  const optical = opticalTransitions[job.status]
  const provider = providerTransitions[job.status]
  if (!opticalActor) return { primary: provider }
  if (job.providerId === currentUserId) return { primary: provider ?? optical }
  // Short label on the button; 'en nombre del proveedor' goes in its tooltip and
  // accessible name (the job events already record who acted).
  const onBehalf = provider ? { ...provider, onBehalf: true } : undefined
  return optical ? { primary: optical, secondary: onBehalf } : { primary: onBehalf }
}

// Still needs someone: everything current except closed steps (a received mounting
// job still waits for the optical's review).
const isActiveJob = (job: ProductionJob) => job.isCurrent !== false && job.status !== 'reviewed' && !(job.status === 'received' && job.jobType === 'lens')

export function ProductionWorkspace({ initialJobs, orders, providers, currentUserId, canAssignProduction }: { initialJobs: ProductionJob[]; orders: AssignmentOrder[]; providers: Provider[]; currentUserId: string; canAssignProduction: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const [jobs, setJobs] = useServerState(initialJobs)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  const [jobType, setJobType] = useState<'lens' | 'mounting'>('lens')
  const [selectedOrderId, setSelectedOrderId] = useState(0)
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [incidentJob, setIncidentJob] = useState<ProductionJob | null>(null)
  const [incidentResponsibility, setIncidentResponsibility] = useState<IncidentResponsibility>('organization')
  const [incidentError, setIncidentError] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  // QA-45: open on the work still to do; received/superseded jobs are one filter away.
  const [statusFilter, setStatusFilter] = useState('active')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [assignmentError, setAssignmentError] = useState('')
  // QA-41: a rework can go to another responsible person (original one by default).
  const [reworkTarget, setReworkTarget] = useState<{ incidentId: number; job: ProductionJob } | null>(null)
  const [reworkProviderId, setReworkProviderId] = useState('')

  // Returns false instead of throwing: the mutation already committed, so a failed
  // reload (weak signal) must not take the page down.
  async function refreshJobs() {
    void refreshNavigationCounters()
    const { data, error } = await supabase.rpc('list_accessible_production_jobs')
    if (error) return false
    setJobs((data as unknown as ProductionJob[]).map((job) => ({ ...job, customerName: orders.find((order) => order.id === job.orderId)?.customerName ?? null })))
    return true
  }
  const savedMessage = (fresh: boolean, message: string) => fresh ? message : `${message} No pudimos actualizar la lista; recarga cuando vuelva la señal.`

  function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    startTransition(async () => {
      const entry = assignableOrders.find((order) => order.lineId === Number(form.get('orderLineId')))
      if (!entry) return setAssignmentError('Selecciona el pedido.')
      const { error } = entry.lineCount > 1
        ? await supabase.rpc('assign_production_jobs', { target_order_id: entry.id, job_type: jobType, provider_id: effectiveProviderId, target_order_line_ids: [entry.lineId] } as never)
        : await supabase.rpc('assign_production_job', { target_order_id: entry.id, job_type: jobType, provider_id: effectiveProviderId } as never)
      if (error) return setAssignmentError(friendlyError(error, 'No pudimos asignar el trabajo.'))
      const fresh = await refreshJobs(); setAssignmentOpen(false); setSelectedProviderId(''); setSelectedOrderId(0); setAssignmentError(''); setMessage(savedMessage(fresh, 'Trabajo asignado correctamente.'))
    })
  }

  function transitionProduction(job: ProductionJob, transition: JobAction) {
    startTransition(async () => {
      const { error } = await supabase.rpc('transition_production_job', { target_job_id: job.id, target_status: transition.target, notes: null } as never)
      if (error) return setMessage(friendlyError(error, 'No pudimos actualizar el estado.'))
      const fresh = await refreshJobs(); setMessage(savedMessage(fresh, `Estado actualizado a ${productionStatusLabel(transition.target, job.jobType)}.`))
    })
  }

  function openIncidentDialog(job: ProductionJob) {
    setIncidentJob(job)
    setIncidentResponsibility(job.jobType === 'lens' ? 'lens_provider' : 'mounting_provider')
    setIncidentError('')
  }

  function reportIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!incidentJob) return
    const description = String(new FormData(event.currentTarget).get('description') ?? '').trim()
    if (description.length < 5) return setIncidentError('Describe la incidencia con al menos 5 caracteres.')
    if (description.length > 1000) return setIncidentError('La descripción no puede superar los 1000 caracteres.')
    setIncidentError('')
    startTransition(async () => {
      const { error } = await supabase.rpc('report_production_incident', { target_job_id: incidentJob.id, description, cost_responsibility: incidentResponsibility } as never)
      if (error) return setIncidentError(friendlyError(error, 'No pudimos registrar la incidencia.'))
      const fresh = await refreshJobs()
      setIncidentJob(null)
      setMessage(savedMessage(fresh, 'Incidencia registrada sin alterar el historial anterior.'))
    })
  }

  function openRework(job: ProductionJob, incidentId: number) {
    setReworkTarget({ incidentId, job })
    setReworkProviderId(job.providerId)
  }

  function reworkProviderOptions(job: ProductionJob) {
    const organizationId = orders.find((order) => order.id === job.orderId)?.organizationId
    const options = providers
      .filter((provider) => (!organizationId || provider.organizationId === organizationId) && (provider.role === 'in_house' || provider.role === (job.jobType === 'lens' ? 'lens_provider' : 'mounting_provider')))
      .map((provider) => ({ value: provider.id, label: provider.name }))
    const unique = [...new Map(options.map((option) => [option.value, option])).values()]
    return unique.some((option) => option.value === job.providerId) ? unique : [{ value: job.providerId, label: job.providerName }, ...unique]
  }

  function createRework() {
    if (!reworkTarget) return
    const { incidentId, job } = reworkTarget
    startTransition(async () => {
      const { error } = await supabase.rpc('create_production_rework', { target_incident_id: incidentId, new_provider_id: reworkProviderId || job.providerId } as never)
      if (error) return setMessage(friendlyError(error, 'No pudimos crear la repetición.'))
      setReworkTarget(null)
      const fresh = await refreshJobs(); setMessage(savedMessage(fresh, 'Repetición creada y vinculada al trabajo original.'))
    })
  }

  // Orders that still lack an active job of the chosen type; none preselected.
  const assignableOrders = orders.filter((order) => !jobs.some((job) => (job.orderLineId ? job.orderLineId === order.lineId : job.orderId === order.id) && job.isCurrent !== false && job.jobType === jobType && job.status !== 'incident'))
  const selectedOrder = assignableOrders.find((order) => order.lineId === selectedOrderId)
  const matchingProviders = providers.filter((provider) => provider.organizationId === selectedOrder?.organizationId && (provider.role === 'in_house' || provider.role === (jobType === 'lens' ? 'lens_provider' : 'mounting_provider')))
  const effectiveProviderId = selectedProviderId || (matchingProviders.length === 1 ? matchingProviders[0].id : '')
  const filteredJobs = useMemo(() => {
    const customerTerm = customerFilter.trim().toLocaleLowerCase('es')
    return jobs.filter((job) => {
      const assignedDate = job.assignedAt.slice(0, 10)
      return (!customerTerm || job.customerName?.toLocaleLowerCase('es').includes(customerTerm))
        && (statusFilter === 'all' || (statusFilter === 'active' ? isActiveJob(job) : job.status === statusFilter))
        && (!dateFrom || assignedDate >= dateFrom)
        && (!dateTo || assignedDate <= dateTo)
    })
  }, [customerFilter, dateFrom, dateTo, jobs, statusFilter])
  const productionStatusOptions = [{ value: 'active', label: 'Trabajos activos' }, { value: 'all', label: 'Todos, con historial' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]
  const activeFilterCount = Number(Boolean(customerFilter.trim()) && canAssignProduction) + Number(statusFilter !== 'active') + Number(Boolean(dateFrom)) + Number(Boolean(dateTo))
  const clearFilters = () => { setCustomerFilter(''); setStatusFilter('active'); setDateFrom(''); setDateTo('') }
  // Superseded jobs (QA-25) are history: they never count as active work or incidents.
  const currentJobs = jobs.filter((job) => job.isCurrent !== false)
  const activeJobs = jobs.filter(isActiveJob)
  const incidentCount = currentJobs.filter((job) => job.status === 'incident').length
  const header = (
    <PageHeader
      eyebrow="Taller y proveedores"
      title="Producción"
      description="Cada proveedor ve únicamente los trabajos asignados, sin precios ni pagos."
      actions={canAssignProduction && orders.length ? <Button variant="mint" icon={Plus} onClick={() => { setAssignmentError(''); setAssignmentOpen(true) }}>Asignar trabajo</Button> : undefined}
      // Providers get two cards (one row on a phone) so the first job stays above the fold.
      stats={jobs.length ? <>
        <StatCard surface="ink" label="Trabajos activos" value={activeJobs.length} />
        {canAssignProduction ? <>
          <StatCard surface="ink" label="En fabricación o montaje" value={currentJobs.filter((job) => ['in_production', 'in_mounting'].includes(job.status)).length} />
          <StatCard surface="ink" tone="positive" label="Listos" value={currentJobs.filter((job) => job.status === 'completed').length} />
        </> : null}
        <StatCard surface="ink" tone={incidentCount ? 'attention' : 'default'} label="Con incidencia" value={incidentCount} />
      </> : undefined}
    />
  )

  return <div className="flex flex-col gap-5">
    {header}
    {canAssignProduction && !orders.length ? (
      <Alert tone="info" title="Para asignar producción necesitas un pedido confirmado.">
        Crea una venta y confirma la cotización; después regresa aquí.
        <span className="mt-3 block"><ButtonLink href="/sales" icon={Plus} size="sm">Nueva venta</ButtonLink></span>
      </Alert>
    ) : null}
    {jobs.length ? (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-muted">{filteredJobs.length === 1 ? '1 trabajo' : `${filteredJobs.length} trabajos`}</p>
        <div className="flex items-center gap-2">
          {activeFilterCount ? <Button variant="ghost" size="sm" icon={RotateCcw} onClick={clearFilters}>Limpiar</Button> : null}
          <IconButton icon={SlidersHorizontal} label="Abrir filtros" count={activeFilterCount} onClick={() => setFiltersOpen(true)} />
        </div>
      </div>
    ) : null}
    <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {filteredJobs.map((job) => {
        const { primary, secondary } = jobActions(job, canAssignProduction, currentUserId)
        return <ProductionJobCard key={job.id} job={job} showCustomer={canAssignProduction} showProvider={canAssignProduction} canAuthorizeRework={canAssignProduction} transitionLabel={primary?.label} transitionOnBehalf={primary?.onBehalf} secondaryTransitionLabel={secondary?.label} secondaryOnBehalf={secondary?.onBehalf} pending={pending} onTransition={() => primary && transitionProduction(job, primary)} onSecondaryTransition={() => secondary && transitionProduction(job, secondary)} onReportIncident={() => openIncidentDialog(job)} onCreateRework={(incidentId) => openRework(job, incidentId)} />
      })}
    </div>
    {!jobs.length ? <EmptyState icon={Factory} title="Sin trabajos asignados" description={canAssignProduction ? 'Cuando completes los requisitos anteriores y pulses “Asignar trabajo”, aparecerán aquí.' : 'Aún no tienes trabajos de producción asignados.'} /> : null}
    {jobs.length > 0 && !filteredJobs.length && !activeFilterCount ? <EmptyState icon={Factory} title="Sin trabajos pendientes" description="Todo lo asignado ya está cerrado." action={<Button variant="ghost" onClick={() => setStatusFilter('all')}>Ver historial</Button>} /> : null}
    {jobs.length > 0 && !filteredJobs.length && activeFilterCount ? <EmptyState icon={SearchX} title="Sin trabajos con estos filtros" action={<Button variant="ghost" onClick={clearFilters}>Limpiar filtros</Button>} /> : null}
    {message ? <Alert tone="info">{message}</Alert> : null}

    <Dialog
      open={assignmentOpen}
      onClose={() => { if (!pending) setAssignmentOpen(false) }}
      eyebrow="Nuevo trabajo"
      title="Asignar producción"
      description="Selecciona el pedido, el trabajo requerido y el proveedor responsable."
      size="md"
      footer={<>
        <Button variant="ghost" onClick={() => setAssignmentOpen(false)} disabled={pending}>Cancelar</Button>
        <Button type="submit" form="production-assign" icon={Plus} disabled={pending || !effectiveProviderId || !selectedOrder}>{pending ? 'Asignando…' : 'Asignar trabajo'}</Button>
      </>}
    >
      <form id="production-assign" onSubmit={assign} className="flex flex-col gap-4">
        <Field label="Pedido"><FormSelect name="orderLineId" ariaLabel="Pedido" value={String(selectedOrderId)} onValueChange={(value) => { setSelectedOrderId(Number(value)); setSelectedProviderId('') }} options={[{ value: '0', label: assignableOrders.length ? 'Selecciona pedido' : 'No hay pedidos pendientes de este trabajo' }, ...assignableOrders.map((order) => ({ value: String(order.lineId), label: [order.orderNumber, order.customerName, order.lineCount > 1 ? `Par ${order.lineNumber} · ${order.patientName ?? 'Paciente'}` : null].filter(Boolean).join(' · ') }))]} /></Field>
        <Field as="div" label="Tipo de trabajo"><SegmentedControl label="Tipo de trabajo" value={jobType} onChange={(value) => { setJobType(value); setSelectedProviderId('') }} options={[{ value: 'lens', label: 'Cristales' }, { value: 'mounting', label: 'Montaje' }]} /></Field>
        <Field label="Proveedor"><FormSelect name="providerId" ariaLabel="Proveedor" required value={effectiveProviderId} onValueChange={setSelectedProviderId} options={[{ value: '', label: matchingProviders.length ? 'Selecciona proveedor' : `No hay ${jobType === 'lens' ? 'cristaleros' : 'montadores'} activos` }, ...matchingProviders.map((provider) => ({ value: provider.id, label: provider.name }))]} /></Field>
        {assignmentError ? <Alert tone="danger" role="alert">{assignmentError}</Alert> : null}
      </form>
    </Dialog>

    <Dialog
      open={filtersOpen}
      onClose={() => setFiltersOpen(false)}
      eyebrow="Producción"
      title="Filtrar trabajos"
      size="md"
      footer={<>
        {activeFilterCount ? <Button variant="ghost" icon={RotateCcw} onClick={clearFilters} className="mr-auto">Limpiar todo</Button> : null}
        <Button onClick={() => setFiltersOpen(false)}>Ver {filteredJobs.length === 1 ? '1 trabajo' : `${filteredJobs.length} trabajos`}</Button>
      </>}
    >
      <OperationalFilters embedded showClear={false} query={customerFilter} onQueryChange={setCustomerFilter} showQuery={canAssignProduction} status={statusFilter} onStatusChange={setStatusFilter} statusOptions={productionStatusOptions} dateFrom={dateFrom} onDateFromChange={setDateFrom} dateTo={dateTo} onDateToChange={setDateTo} onClear={clearFilters} resultCount={filteredJobs.length} />
    </Dialog>

    <Dialog
      open={Boolean(incidentJob)}
      onClose={() => { if (!pending) setIncidentJob(null) }}
      eyebrow={incidentJob ? `${incidentJob.orderNumber} · ${incidentJob.jobType === 'lens' ? 'Cristales' : 'Montaje'}` : undefined}
      title="Registrar incidencia"
      icon={TriangleAlert}
      tone="danger"
      size="md"
      footer={<>
        <Button variant="ghost" onClick={() => setIncidentJob(null)} disabled={pending}>Cancelar</Button>
        <Button type="submit" form="production-incident" variant="attention" icon={TriangleAlert} disabled={pending}>{pending ? 'Registrando…' : 'Registrar incidencia'}</Button>
      </>}
    >
      <form id="production-incident" onSubmit={reportIncident} className="flex flex-col gap-4" noValidate>
        <Field label="Descripción"><Textarea name="description" minLength={5} maxLength={1000} required rows={4} placeholder="Describe qué ocurrió y cualquier detalle útil…" /></Field>
        <Field label="Responsable del costo"><FormSelect ariaLabel="Responsable del costo" menuPlacement="top" value={incidentResponsibility} onValueChange={(value) => setIncidentResponsibility(value as IncidentResponsibility)} options={Object.entries(responsibilityLabels).map(([value, label]) => ({ value, label }))} /></Field>
        {incidentError ? <Alert tone="danger" role="alert">{incidentError}</Alert> : null}
      </form>
    </Dialog>

    <Dialog
      open={Boolean(reworkTarget)}
      onClose={() => { if (!pending) setReworkTarget(null) }}
      eyebrow={reworkTarget ? `${reworkTarget.job.orderNumber} · ${reworkTarget.job.jobType === 'lens' ? 'Cristales' : 'Montaje'}` : undefined}
      title="Aceptar repetición"
      icon={RefreshCcw}
      size="md"
      footer={<>
        <Button variant="ghost" onClick={() => setReworkTarget(null)} disabled={pending}>Cancelar</Button>
        <Button variant="attention" icon={RefreshCcw} onClick={createRework} disabled={pending}>{pending ? 'Creando…' : 'Crear repetición'}</Button>
      </>}
    >
      {reworkTarget ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">Se crea un trabajo nuevo con la misma configuración. El anterior queda en el historial como sustituido.</p>
          <Field as="div" label="Responsable de la repetición">
            <FormSelect ariaLabel="Responsable de la repetición" value={reworkProviderId} onValueChange={setReworkProviderId} options={reworkProviderOptions(reworkTarget.job)} />
          </Field>
        </div>
      ) : null}
    </Dialog>
  </div>
}
