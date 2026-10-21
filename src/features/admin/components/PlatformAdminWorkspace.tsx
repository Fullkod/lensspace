'use client'

import { Building, IdCard, KeyRound, LifeBuoy, Plus, SearchX } from 'lucide-react'
import { FormEvent, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/lib/supabase/database.types'
import { FilterPanel, FormSelect } from '@/shared/components'
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, Dialog, EmptyState, Field, Input, Switch, Textarea, Toast } from '@/shared/ui'
import { friendlyError } from '@/shared/lib/friendly-error'
import { BUSINESS_TIME_ZONE, formatBusinessDate, todayIn } from '@/shared/utils/dates'
import { sendOwnerPasswordReset } from '../actions'
import { addMonthsIso, SUBSCRIPTION_GRACE_DAYS } from '../license-pricing'
import { ActivityPanel } from './ActivityPanel'
import { BranchManagementPanel } from './BranchManagementPanel'
import { DeleteOrganizationPanel } from './DeleteOrganizationPanel'
import { LicenseContractPanel } from './LicenseContractPanel'
import { OrganizationAuditHistory } from './OrganizationAuditHistory'
import { OrganizationNamePanel } from './OrganizationNamePanel'
import { OrganizationOnboardingForm } from './OrganizationOnboardingForm'
import { type ProviderProfile, ProviderProfileForm } from './ProviderProfileForm'
import { SubscriptionActions } from './SubscriptionActions'

const modules = [
  ['optical_sales', 'Ventas ópticas'], ['cashbox', 'Caja'], ['production', 'Producción'],
  ['whatsapp', 'WhatsApp'], ['analytics', 'Analítica'], ['multi_branch', 'Multisucursal'],
] as const

// QA-57: Caja, Producción y WhatsApp require Ventas ópticas (module_dependencies).
const salesDependents = ['cashbox', 'production', 'whatsapp']

// QA-54: one subscription state for the badge and the filter.
type SubscriptionState = 'pending' | 'trial' | 'active' | 'expiring' | 'grace' | 'expired' | 'suspended' | 'none'
const subscriptionStateLabels: Record<SubscriptionState, string> = { pending: 'En preparación', trial: 'Prueba', active: 'Al día', expiring: 'Por vencer', grace: 'En margen de pago', expired: 'Vencida', suspended: 'Suspendida', none: 'Sin suscripción' }
const subscriptionStateTones = { pending: 'neutral', trial: 'progress', active: 'success', expiring: 'warning', grace: 'warning', expired: 'danger', suspended: 'danger', none: 'neutral' } as const
function subscriptionState(subscription: PlatformOrganization['subscription'], today: string): SubscriptionState {
  if (!subscription) return 'none'
  if (subscription.status === 'suspended') return 'suspended'
  if (subscription.status === 'pending') return 'pending'
  if (subscription.status === 'expired') return 'expired'
  // Past the expiry but still operating: the grace period before the block.
  if (subscription.expires_on < today) return addMonthsIso(subscription.expires_on, 0, false, SUBSCRIPTION_GRACE_DAYS) >= today ? 'grace' : 'expired'
  const daysLeft = (Date.parse(subscription.expires_on) - Date.parse(today)) / 86_400_000
  if (daysLeft <= 5) return 'expiring'
  return subscription.status === 'trial' ? 'trial' : 'active'
}

const organizationStatusLabels: Record<string, string> = {
  active: 'Activa',
  suspended: 'Suspendida',
  archived: 'Archivada',
}

export type PlatformOrganization = {
  id: number; name: string; order_prefix: string; status: string
  branches: { id: number; name: string; code: string; is_active: boolean; is_primary: boolean }[]
  owners: { user_id: string; display_name: string }[]
  subscription?: { status: string; amount: number; currency: string; billing_period: string; starts_on: string; expires_on: string; last_renewed_on: string | null }
  modules: { module_key: string; is_enabled: boolean }[]
  usage?: { customers: number; orders: number; members: number; openProductionJobs: number; notificationAttempts: number; orders30: number; activeDays30: number; lastActivityAt: string | null }
  supportSession?: { id: number; reason: string; started_at: string; expires_at: string }
  contracts: Tables<'license_contracts'>[]
  referrals: Tables<'license_contracts'>[]
}

export function PlatformAdminWorkspace({ organizations, providerProfile }: { organizations: PlatformOrganization[]; providerProfile: ProviderProfile | null }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [openId, setOpenId] = useState<number | null>(null)
  const [enabledModules, setEnabledModules] = useState<string[]>([])
  const [statusDraft, setStatusDraft] = useState('trial')
  const [createOpen, setCreateOpen] = useState(false)
  const [providerOpen, setProviderOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [subscriptionFilter, setSubscriptionFilter] = useState('all')
  // LEN0002: «Menos activas primero» brings the opticians that stopped using LensSpace up.
  const [sortOrder, setSortOrder] = useState('recent')
  const [historyKey, setHistoryKey] = useState(0)
  const today = todayIn()
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [pending, startTransition] = useTransition()
  const filteredOrganizations = organizations.filter((organization) => {
    const term = query.trim().toLocaleLowerCase('es')
    const matchesQuery = !term || [organization.name, organization.order_prefix, ...organization.owners.map(({ display_name }) => display_name)].some((value) => value.toLocaleLowerCase('es').includes(term))
    return matchesQuery && (statusFilter === 'all' || organization.status === statusFilter)
      && (subscriptionFilter === 'all' || subscriptionState(organization.subscription, today) === subscriptionFilter)
  })
  if (sortOrder === 'inactive') filteredOrganizations.sort((left, right) => (left.usage?.lastActivityAt ?? '').localeCompare(right.usage?.lastActivityAt ?? ''))
  const activeFilterCount = Number(Boolean(query.trim())) + Number(statusFilter !== 'all') + Number(subscriptionFilter !== 'all') + Number(sortOrder !== 'recent')
  const clearFilters = () => { setQuery(''); setStatusFilter('all'); setSubscriptionFilter('all'); setSortOrder('recent') }
  const openOrganization = organizations.find(({ id }) => id === openId) ?? null
  const organizationNames = organizations.map(({ id, name }) => ({ id, name }))

  function contractChanged(message: string) {
    setToast(message)
    setHistoryKey((current) => current + 1)
    router.refresh()
  }

  function openDetails(organization: PlatformOrganization) {
    setError('')
    setEnabledModules(organization.modules.filter(({ is_enabled }) => is_enabled).map(({ module_key }) => module_key))
    setStatusDraft(organization.subscription?.status ?? 'trial')
    setOpenId(organization.id)
  }

  function sendReset(ownerUserId: string) {
    startTransition(async () => {
      setError('')
      const result = await sendOwnerPasswordReset(ownerUserId)
      if (result.error) return setError(result.error)
      setToast(`Enlace de restablecimiento enviado a ${result.email}.`)
    })
  }

  function toggleModule(key: string, enabled: boolean) {
    setEnabledModules((current) => {
      if (enabled) return [...new Set([...current, key, ...(salesDependents.includes(key) ? ['optical_sales'] : [])])]
      return current.filter((entry) => entry !== key && !(key === 'optical_sales' && salesDependents.includes(entry)))
    })
  }

  function save(event: FormEvent<HTMLFormElement>, organizationId: number) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    startTransition(async () => {
      const { error: saveError } = await supabase.rpc('update_platform_organization', {
        target_organization_id: organizationId,
        target_organization_status: String(form.get('organizationStatus')),
        target_subscription_status: String(form.get('subscriptionStatus')),
        target_amount: Number(form.get('amount')),
        target_currency: String(form.get('currency')),
        target_billing_period: String(form.get('billingPeriod')),
        target_starts_on: String(form.get('startsOn')),
        target_expires_on: String(form.get('expiresOn')),
        target_module_keys: modules.filter(([key]) => enabledModules.includes(key)).map(([key]) => key),
        change_reason: String(form.get('reason')),
      } as never)
      if (saveError) return setError(friendlyError(saveError, 'No pudimos guardar los cambios de la organización.'))
      setError('')
      setToast('Contrato y controles operativos actualizados con auditoría.')
      setHistoryKey((current) => current + 1)
      router.refresh()
    })
  }

  function startSupport(event: FormEvent<HTMLFormElement>, organizationId: number) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    startTransition(async () => {
      const { error: supportError } = await supabase.rpc('begin_platform_support_session', {
        target_organization_id: organizationId,
        support_reason: String(form.get('supportReason')),
        duration_minutes: Number(form.get('duration')),
      } as never)
      if (supportError) return setError(friendlyError(supportError, 'No pudimos iniciar la asistencia.'))
      setError('')
      setToast('Sesión de asistencia iniciada y auditada.')
      setHistoryKey((current) => current + 1)
      router.refresh()
    })
  }

  function endSupport(sessionId: number) {
    startTransition(async () => {
      const { error: endError } = await supabase.rpc('end_platform_support_session', { target_session_id: sessionId } as never)
      if (endError) return setError(friendlyError(endError, 'No pudimos cerrar la asistencia.'))
      setError('')
      setToast('Sesión de asistencia cerrada.')
      setHistoryKey((current) => current + 1)
      router.refresh()
    })
  }

  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-text-muted">{filteredOrganizations.length === 1 ? '1 organización' : `${filteredOrganizations.length} organizaciones`}</p>
      <div className="flex items-center gap-2">
        <FilterPanel title="Filtrar organizaciones" eyebrow="Administración" activeFilterCount={activeFilterCount} resultCount={filteredOrganizations.length} onClear={clearFilters}>
          <div className="flex flex-col gap-4">
            <Field label="Organización"><Input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Nombre, prefijo o propietario" /></Field>
            <Field label="Estado"><FormSelect ariaLabel="Filtrar por estado" value={statusFilter} onValueChange={setStatusFilter} options={[{ value: 'all', label: 'Todos los estados' }, { value: 'active', label: 'Activas' }, { value: 'suspended', label: 'Suspendidas' }, { value: 'archived', label: 'Archivadas' }]} /></Field>
            <Field label="Suscripción"><FormSelect ariaLabel="Filtrar por suscripción" value={subscriptionFilter} onValueChange={setSubscriptionFilter} options={[{ value: 'all', label: 'Todas' }, { value: 'pending', label: 'En preparación' }, { value: 'trial', label: 'En prueba' }, { value: 'expiring', label: 'Por vencer (5 días o menos)' }, { value: 'grace', label: 'En margen de pago' }, { value: 'expired', label: 'Vencidas' }, { value: 'active', label: 'Al día' }, { value: 'suspended', label: 'Suspendidas' }]} /></Field>
            <Field label="Orden"><FormSelect ariaLabel="Ordenar organizaciones" value={sortOrder} onValueChange={setSortOrder} options={[{ value: 'recent', label: 'Más nuevas primero' }, { value: 'inactive', label: 'Menos activas primero' }]} /></Field>
          </div>
        </FilterPanel>
        <Button variant="secondary" icon={IdCard} onClick={() => setProviderOpen(true)}>Datos del proveedor</Button>
        <Button icon={Plus} onClick={() => setCreateOpen(true)}>Nueva organización</Button>
      </div>
    </div>

    {filteredOrganizations.map((organization) => (
      <Card key={organization.id} padded={false} className="overflow-hidden">
        <button type="button" onClick={() => openDetails(organization)} className="flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action">
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-display text-[17px] font-semibold text-ink">{organization.name}</span>
            <span className="text-[13px] text-text-muted">{organization.order_prefix} · {organization.owners.map((owner) => owner.display_name).join(', ') || 'Sin propietario'} · {organization.branches.length === 1 ? '1 sucursal' : `${organization.branches.length} sucursales`}</span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={subscriptionStateTones[subscriptionState(organization.subscription, today)]}>{subscriptionStateLabels[subscriptionState(organization.subscription, today)]}</Badge>
            <Badge tone={organization.status === 'active' ? 'success' : 'danger'}>{organizationStatusLabels[organization.status] ?? 'Estado desconocido'}</Badge>
            <span className="text-[13px] font-semibold text-action">Ver detalles</span>
          </span>
        </button>
        <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4 lg:grid-cols-7">
          {[
            ['Clientes', organization.usage?.customers ?? 0], ['Pedidos', organization.usage?.orders ?? 0], ['Activa (30 días)', `${organization.usage?.activeDays30 ?? 0} días · ${organization.usage?.orders30 ?? 0} pedidos`], ['Miembros', organization.usage?.members ?? 0], ['Producción abierta', organization.usage?.openProductionJobs ?? 0], ['Mensajes', organization.usage?.notificationAttempts ?? 0], ['Última actividad', organization.usage?.lastActivityAt ? formatBusinessDate(organization.usage.lastActivityAt) : '—'],
          ].map(([label, value]) => <div key={label} className="bg-canvas px-4 py-3"><dt className="text-[12px] text-text-muted">{label}</dt><dd className="mt-0.5 font-display text-[15px] font-semibold tabular-nums text-ink">{value}</dd></div>)}
        </dl>
      </Card>
    ))}
    {!organizations.length ? <EmptyState icon={Building} title="Aún no hay organizaciones" action={<Button icon={Plus} onClick={() => setCreateOpen(true)}>Nueva organización</Button>} /> : null}
    {organizations.length > 0 && !filteredOrganizations.length ? <EmptyState icon={SearchX} title="Sin organizaciones con estos filtros" action={<Button variant="ghost" onClick={clearFilters}>Limpiar filtros</Button>} /> : null}

    <Dialog
      open={Boolean(openOrganization)}
      onClose={() => { if (!pending) setOpenId(null) }}
      eyebrow={openOrganization ? `${openOrganization.order_prefix} · ID ${openOrganization.id}` : undefined}
      title={openOrganization?.name ?? ''}
      size="xl"
    >
      {openOrganization ? <div key={openOrganization.id} className="grid min-w-0 gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="flex min-w-0 flex-col gap-8">
        <div className="flex flex-col gap-3">
          <CardHeader title="Actividad" />
          <ActivityPanel organizationId={openOrganization.id} />
        </div>
        <div className="flex flex-col gap-3">
          <CardHeader title="Suscripción" />
          <SubscriptionActions organizationId={openOrganization.id} subscription={openOrganization.subscription} signedContract={openOrganization.contracts.find(({ status }) => status === 'signed')} onChanged={contractChanged} />
        </div>
        <form onSubmit={(event) => save(event, openOrganization.id)} className="flex min-w-0 flex-col gap-4">
          <CardHeader title="Operación y ajustes manuales" />
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Organización"><FormSelect name="organizationStatus" ariaLabel="Estado de la organización" defaultValue={openOrganization.status} options={[{ value: 'active', label: 'Activa' }, { value: 'suspended', label: 'Suspendida (solo lectura)' }, { value: 'archived', label: 'Archivada (sin acceso, restaurable)' }]} /></Field>
            <Field label="Suscripción"><FormSelect name="subscriptionStatus" ariaLabel="Estado de la suscripción" value={statusDraft} onValueChange={setStatusDraft} options={[...(openOrganization.subscription?.status === 'pending' ? [{ value: 'pending', label: 'En preparación' }] : []), ...(openOrganization.subscription?.status === 'trial' ? [{ value: 'trial', label: 'Prueba' }] : []), { value: 'active', label: 'Activa' }, { value: 'expired', label: 'Vencida' }, { value: 'suspended', label: 'Suspendida' }]} /></Field>
            <Field label="Importe" help={statusDraft === 'trial' ? 'La prueba es gratis.' : statusDraft === 'pending' ? 'Sin cobro hasta el primer pago.' : undefined}><Input name="amount" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={openOrganization.subscription?.amount ?? 0} disabled={statusDraft === 'trial' || statusDraft === 'pending'} numeric /></Field>
            <Field label="Moneda"><Input name="currency" pattern="[A-Za-z]{3}" defaultValue={openOrganization.subscription?.currency ?? 'USD'} /></Field>
            <Field label="Periodicidad"><FormSelect name="billingPeriod" ariaLabel="Periodicidad" defaultValue={openOrganization.subscription?.billing_period ?? 'monthly'} options={[{ value: 'monthly', label: 'Mensual' }, { value: 'quarterly', label: 'Trimestral' }, { value: 'semiannual', label: 'Semestral' }, { value: 'annual', label: 'Anual' }, { value: 'custom', label: 'Personalizada' }]} /></Field>
            <Field label="Inicio"><Input name="startsOn" type="date" defaultValue={openOrganization.subscription?.starts_on} /></Field>
            <Field label="Vencimiento"><Input name="expiresOn" type="date" defaultValue={openOrganization.subscription?.expires_on} /></Field>
            <div className="flex flex-col justify-end text-sm"><span className="text-[12px] text-text-muted">Última renovación</span><span className="font-semibold tabular-nums text-ink">{openOrganization.subscription?.last_renewed_on ? formatBusinessDate(`${openOrganization.subscription.last_renewed_on}T12:00:00`) : '—'}</span></div>
          </div>
          <Field as="div" label="Módulos" help="Caja, Producción y WhatsApp requieren Ventas ópticas: se activan y desactivan juntos.">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map(([key, label]) => <div key={key} className="flex min-h-11 items-center rounded-control border border-line px-3"><Switch checked={enabledModules.includes(key)} onChange={(enabled) => toggleModule(key, enabled)} label={label} /></div>)}
            </div>
          </Field>
          <Field label="Motivo del cambio" help="Queda registrado en la auditoría."><Textarea name="reason" minLength={10} maxLength={500} required rows={3} /></Field>
          {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
          <div className="flex justify-end"><Button type="submit" variant="ink" disabled={pending}>{pending ? 'Guardando…' : 'Guardar cambios'}</Button></div>
        </form>
        <LicenseContractPanel organization={openOrganization} organizationNames={organizationNames} onChanged={contractChanged} />
        <BranchManagementPanel
          organizationId={openOrganization.id}
          branches={openOrganization.branches}
          multiBranchEnabled={openOrganization.modules.some(({ module_key, is_enabled }) => module_key === 'multi_branch' && is_enabled)}
          branchLimit={1 + (openOrganization.contracts.find(({ status }) => status === 'signed')?.extra_branches ?? 0)}
          draftExtraBranches={openOrganization.contracts.find(({ status }) => status === 'draft')?.extra_branches ?? null}
          onChanged={contractChanged}
        />
        <DeleteOrganizationPanel
          organizationId={openOrganization.id}
          organizationName={openOrganization.name}
          hasActivity={Boolean(openOrganization.usage?.customers || openOrganization.usage?.orders || openOrganization.usage?.notificationAttempts) || openOrganization.contracts.some(({ status }) => status === 'signed' || status === 'superseded')}
          onDeleted={(message) => { setOpenId(null); setToast(message); router.refresh() }}
        />
        </div>
        <div className="flex flex-col gap-4">
          <OrganizationNamePanel organizationId={openOrganization.id} organizationName={openOrganization.name} onChanged={contractChanged} />
          <CardHeader title="Asistencia auditada" />
          {openOrganization.supportSession ? (
            <Alert tone="warning" icon={LifeBuoy} title={`Sesión activa hasta ${new Date(openOrganization.supportSession.expires_at).toLocaleTimeString('es-CU', { timeZone: BUSINESS_TIME_ZONE, hour: '2-digit', minute: '2-digit' })}`}>
              {openOrganization.supportSession.reason}
              <span className="mt-3 block"><Button size="sm" variant="secondary" disabled={pending} onClick={() => endSupport(openOrganization.supportSession!.id)}>Cerrar asistencia</Button></span>
            </Alert>
          ) : (
            <form onSubmit={(event) => startSupport(event, openOrganization.id)} className="flex flex-col gap-4">
              <Field label="Motivo y alcance"><Textarea name="supportReason" minLength={10} maxLength={500} required rows={3} /></Field>
              <Field label="Duración"><FormSelect name="duration" ariaLabel="Duración de la asistencia" defaultValue="30" options={[{ value: '15', label: '15 minutos' }, { value: '30', label: '30 minutos' }, { value: '60', label: '1 hora' }, { value: '120', label: '2 horas' }]} /></Field>
              <Button type="submit" variant="secondary" icon={LifeBuoy} block disabled={pending}>Iniciar asistencia</Button>
            </form>
          )}
          <CardHeader title="Acceso del propietario" />
          {openOrganization.owners.length ? openOrganization.owners.map((owner) => (
            <div key={owner.user_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-ink">{owner.display_name}</span>
              <Button size="sm" variant="secondary" icon={KeyRound} disabled={pending} onClick={() => sendReset(owner.user_id)}>Enviar enlace de restablecimiento</Button>
            </div>
          )) : <p className="text-sm text-text-muted">Sin propietario activo.</p>}
          <ButtonLink href="/catalog" variant="ghost">Administrar catálogo base</ButtonLink>
          <CardHeader title="Historial" />
          <OrganizationAuditHistory organizationId={openOrganization.id} refreshKey={historyKey} />
        </div>
      </div> : null}
    </Dialog>

    <Dialog open={providerOpen} onClose={() => setProviderOpen(false)} eyebrow="Contratos" title="Datos del proveedor" description="Salen en cada proforma de contrato. Si cambian, actualízalos aquí." size="lg"><ProviderProfileForm profile={providerProfile} onSaved={(message) => { setProviderOpen(false); setToast(message); router.refresh() }} /></Dialog>
    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} eyebrow="Alta de tenant" title="Nueva organización" size="xl"><OrganizationOnboardingForm onCreated={(created) => { setCreateOpen(false); setToast(created) }} /></Dialog>
    <Toast message={toast} onDismiss={() => setToast('')} />
  </div>
}
