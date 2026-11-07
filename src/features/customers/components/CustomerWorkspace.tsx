'use client'

import { Pencil, Plus, ReceiptText, Save, Search, SearchX, UserPlus, Users, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react'

import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/lib/supabase/database.types'
import { FormSelect } from '@/shared/components'
import { Alert, Avatar, Badge, Button, ButtonLink, Card, CardHeader, EmptyState, Field, Input, ListItem } from '@/shared/ui'
import { friendlyError, isNetworkError } from '@/shared/lib/friendly-error'
import { newRequestId } from '@/shared/utils/request-id'
import { canonicalPhone } from '../phone'
import { CustomerFormFields, customerFormValues, type CustomerPhoneDraft } from './CustomerFormFields'

type AccessScope = {
  organizationId: number
  organizationName: string
  branchId: number
  branchName: string
  canWrite: boolean
}

type CustomerPhone = Pick<
  Tables<'customer_phones'>,
  'id' | 'phone_number' | 'normalized_phone' | 'label' | 'is_primary' | 'whatsapp_enabled'
>

type CustomerResult = Pick<
  Tables<'customers'>,
  | 'id'
  | 'organization_id'
  | 'branch_id'
  | 'full_name'
  | 'national_id'
  | 'address'
  | 'birth_date'
  | 'notes'
  | 'messaging_consent'
> & {
  customer_phones: CustomerPhone[]
  orders?: { commercial_status: string }[]
  orderSummary?: { total: number; open: number; completed: number }
}

const customerSelect =
  'id, organization_id, branch_id, full_name, national_id, address, birth_date, notes, messaging_consent, customer_phones(id, phone_number, normalized_phone, label, is_primary, whatsapp_enabled), orders(commercial_status)'

// Duplicate checks compare canonical numbers (8-digit Cuban numbers get 53).
const normalizePhone = canonicalPhone

// QA-32: order counts come embedded in the customers query (RLS-scoped) instead of
// downloading the whole order history on every search.
function withOrderSummaries(customers: CustomerResult[]) {
  return customers.map((customer) => {
    const statuses = (customer.orders ?? []).map(({ commercial_status }) => commercial_status)
    const completed = statuses.filter((status) => ['delivered', 'closed'].includes(status)).length
    return { ...customer, orderSummary: { total: statuses.length, open: statuses.length - completed, completed } }
  })
}

export function CustomerWorkspace({ scopes }: { scopes: AccessScope[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerResult[]>([])
  const [selected, setSelected] = useState<CustomerResult | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<CustomerResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [duplicateReviewed, setDuplicateReviewed] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [target, setTarget] = useState(
    scopes[0] ? `${scopes[0].organizationId}:${scopes[0].branchId}` : '',
  )
  const [fullName, setFullName] = useState('')
  const [phones, setPhones] = useState<CustomerPhoneDraft[]>([
    { number: '', label: 'Principal', whatsappEnabled: true },
  ])
  const selectedRef = useRef<HTMLDivElement>(null)
  // One id per new-customer attempt, reused on retry so a lost response never duplicates it.
  const customerRequestId = useRef<string | null>(null)

  const activeScope = scopes.find(
    (scope) => `${scope.organizationId}:${scope.branchId}` === target,
  )

  const searchCustomers = useCallback(
    async (rawQuery: string) => {
      setLoading(true)
      setSearched(true)
      setMessage(null)
      const term = rawQuery.trim()
      const digits = normalizePhone(term)
      let customerIds: number[] = []

      // LEN0007: 4 digits are enough (5307 → +53 5307 7035), same as the sale picker.
      if (digits.length >= 4) {
        const { data: phoneMatches } = await supabase
          .from('customer_phones')
          .select('customer_id')
          .like('normalized_phone', `%${digits}%`)
          .limit(30)
        customerIds = [...new Set((phoneMatches ?? []).map(({ customer_id }) => customer_id))]
      }

      let request = supabase
        .from('customers')
        .select(customerSelect)
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
        .limit(30)

      if (term) {
        const safeTerm = term.replace(/[,%()]/g, ' ')
        request = customerIds.length
          ? request.or(`full_name.ilike.%${safeTerm}%,id.in.(${customerIds.join(',')})`)
          : request.ilike('full_name', `%${safeTerm}%`)
      }

      const { data, error } = await request
      if (error) {
        setResults([])
        setMessage('No pudimos consultar los clientes. Intenta nuevamente.')
      } else {
        const customers = (data ?? []) as CustomerResult[]
        setResults(withOrderSummaries(customers))
      }
      setLoading(false)
    },
    [supabase],
  )

  const duplicateCandidates = useMemo(() => {
    const draftedPhones = new Set(
      phones.map(({ number }) => normalizePhone(number)).filter((number) => number.length >= 5),
    )
    const normalizedName = fullName.trim().toLocaleLowerCase('es')

    return results.filter(
      (customer) =>
        (normalizedName.length >= 2 &&
          customer.full_name.trim().toLocaleLowerCase('es') === normalizedName) ||
        customer.customer_phones.some(({ normalized_phone }) =>
          normalized_phone ? draftedPhones.has(normalized_phone) : false,
        ),
    )
  }, [fullName, phones, results])

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSelected(null)
    await searchCustomers(query)
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeScope?.canWrite) {
      setMessage('Esta organización está en modo de solo lectura.')
      return
    }

    const form = new FormData(event.currentTarget)
    const values = customerFormValues(form, fullName, phones)
    const validPhones = values.phones
    if (validPhones.length !== phones.length || !fullName.trim()) {
      setMessage('Completa el nombre y usa teléfonos de al menos cinco dígitos.')
      return
    }

    setSaving(true)
    setMessage(null)
    const normalizedPhones = validPhones.map(({ number }) => normalizePhone(number))
    const [{ data: phoneMatches }, { data: nameMatches }] = await Promise.all([
      supabase
        .from('customer_phones')
        .select('customer_id')
        .in('normalized_phone', normalizedPhones),
      supabase
        .from('customers')
        .select('id')
        .is('archived_at', null)
        .ilike('full_name', fullName.trim()),
    ])
    const possibleDuplicateIds = [
      ...new Set([
        ...(phoneMatches ?? []).map(({ customer_id }) => customer_id),
        ...(nameMatches ?? []).map(({ id }) => id),
      ]),
    ]

    const otherDuplicateIds = possibleDuplicateIds.filter((id) => id !== editingCustomer?.id)
    if (otherDuplicateIds.length && !duplicateReviewed) {
      const { data: matches } = await supabase
        .from('customers')
        .select(customerSelect)
        .in('id', otherDuplicateIds)
        .is('archived_at', null)
      setResults(withOrderSummaries((matches ?? []) as CustomerResult[]))
      setSearched(true)
      setQuery(fullName.trim())
      setDuplicateReviewed(true)
      setMessage('Revisa las posibles coincidencias. Si es otra persona, vuelve a pulsar Guardar cliente.')
      setSaving(false)
      return
    }

    if (!editingCustomer) customerRequestId.current ??= newRequestId()
    const { data, error } = editingCustomer
      ? await supabase.rpc('update_customer_with_phones', {
          target_customer_id: editingCustomer.id,
          customer_full_name: values.fullName,
          customer_national_id: values.nationalId,
          customer_address: values.address,
          customer_birth_date: values.birthDate,
          customer_notes: values.notes,
          customer_messaging_consent: values.messagingConsent,
          phone_entries: validPhones,
        } as never)
      : await supabase.rpc('create_customer_with_phones', {
          target_organization_id: activeScope.organizationId,
          target_branch_id: activeScope.branchId,
          customer_full_name: values.fullName,
          customer_request_id: customerRequestId.current,
          customer_national_id: values.nationalId,
          customer_address: values.address,
          customer_birth_date: values.birthDate,
          customer_notes: values.notes,
          customer_messaging_consent: values.messagingConsent,
          phone_entries: validPhones,
        } as never)

    if (error) {
      if (!isNetworkError(error)) customerRequestId.current = null
      setMessage(friendlyError(error, 'No se pudo registrar el cliente.'))
      setSaving(false)
      return
    }
    customerRequestId.current = null

    setQuery(fullName.trim())
    setShowForm(false)
    setEditingCustomer(null)
    setFullName('')
    setPhones([{ number: '', label: 'Principal', whatsappEnabled: true }])
    await searchCustomers(fullName.trim())
    setSelected(null)
    setMessage(editingCustomer ? 'Ficha del cliente actualizada correctamente.' : `Cliente #${data} registrado correctamente.`)
    setDuplicateReviewed(false)
    setSaving(false)
  }

  function selectCustomer(customer: CustomerResult) {
    setSelected(customer)
    // Single-column layout below xl: bring the selected record into view.
    if (!window.matchMedia('(min-width: 1280px)').matches) {
      requestAnimationFrame(() => selectedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }

  function editSelected(customer: CustomerResult) {
    setEditingCustomer(customer)
    setTarget(`${customer.organization_id}:${customer.branch_id}`)
    setFullName(customer.full_name)
    setPhones([...customer.customer_phones].sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((phone) => ({ number: phone.phone_number, label: phone.label, whatsappEnabled: phone.whatsapp_enabled })))
    setDuplicateReviewed(false)
    setShowForm(true)
    setMessage(null)
  }

  function toggleNewCustomerForm() {
    setEditingCustomer(null)
    setShowForm((visible) => !visible)
    if (!showForm && query && !normalizePhone(query)) setFullName(query)
    if (!showForm && normalizePhone(query).length >= 5) {
      setPhones([{ number: query, label: 'Principal', whatsappEnabled: true }])
    }
  }

  if (!scopes.length) {
    return <EmptyState icon={Users} title="Sin acceso a clientes" description="Tu cuenta no tiene acceso de dueño o vendedor a una sucursal." />
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <CardHeader title="Buscar o registrar al cliente" />
          <p className="mt-1 text-[13px] text-text-muted">El teléfono no es único: varias personas pueden compartirlo.</p>

          <form onSubmit={submitSearch} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input leadingIcon={Search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o teléfono" aria-label="Buscar por nombre o teléfono" className="flex-1" />
            <Button type="submit" icon={Search}>Buscar</Button>
          </form>

          <div className="mt-4" aria-live="polite">
            {loading ? (
              <p className="py-5 text-sm text-text-muted">Buscando clientes…</p>
            ) : results.length ? (
              <div className="-mx-5 border-t border-line-soft md:-mx-[22px]">
                {results.map((customer, index) => {
                  const scope = scopes.find(({ organizationId, branchId }) => organizationId === customer.organization_id && branchId === customer.branch_id)
                  const summary = customer.orderSummary ?? { total: 0, open: 0, completed: 0 }
                  return (
                    <ListItem
                      key={customer.id}
                      avatarName={customer.full_name}
                      title={customer.full_name}
                      meta={<>
                        <span className="block truncate">{customer.customer_phones.map(({ phone_number }) => phone_number).join(' · ')}{scope ? ` · ${scope.branchName}` : ''}</span>
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge tone="neutral" dot={false}>{summary.total} {summary.total === 1 ? 'trabajo' : 'trabajos'}</Badge>
                          {summary.open ? <Badge tone="progress">{summary.open} {summary.open === 1 ? 'abierto' : 'abiertos'}</Badge> : null}
                          {summary.completed ? <Badge tone="success">{summary.completed} {summary.completed === 1 ? 'finalizado' : 'finalizados'}</Badge> : null}
                        </span>
                      </>}
                      selected={selected?.id === customer.id}
                      onSelect={() => selectCustomer(customer)}
                      last={index === results.length - 1}
                    />
                  )
                })}
              </div>
            ) : (
              <EmptyState icon={searched ? SearchX : Search} title={searched ? 'Sin coincidencias' : 'Busca antes de registrar'} description={searched ? 'No encontramos coincidencias. Puedes registrar una ficha nueva.' : 'Busca por nombre o teléfono antes de registrar una ficha nueva.'} />
            )}
          </div>

          <div className="mt-4">
            <Button variant="secondary" icon={showForm ? X : UserPlus} onClick={toggleNewCustomerForm}>{showForm ? 'Cerrar formulario' : 'Registrar cliente nuevo'}</Button>
          </div>
        </Card>

        {showForm ? (
          <form key={editingCustomer?.id ?? 'new'} onSubmit={saveCustomer}>
            <Card className="flex flex-col gap-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-[17px] font-semibold text-ink">{editingCustomer ? 'Editar ficha' : 'Nueva ficha'}</h2>
                  <p className="mt-1 text-[13px] text-text-muted">{editingCustomer ? 'Actualiza los datos vigentes del cliente.' : 'Revisa las coincidencias antes de guardar.'}</p>
                </div>
                {!activeScope?.canWrite ? <Badge tone="warning">Solo lectura</Badge> : null}
              </div>
              <Field label="Organización y sucursal">
                <FormSelect ariaLabel="Organización y sucursal" value={target} disabled={Boolean(editingCustomer)} onValueChange={setTarget} options={scopes.map((scope) => ({ value: `${scope.organizationId}:${scope.branchId}`, label: `${scope.organizationName} · ${scope.branchName}${scope.canWrite ? '' : ' (solo lectura)'}` }))} />
              </Field>
              <CustomerFormFields fullName={fullName} onFullNameChange={(value) => { setFullName(value); setDuplicateReviewed(false) }} phones={phones} onPhonesChange={(value) => { setPhones(value); setDuplicateReviewed(false) }} initialValues={editingCustomer ? { nationalId: editingCustomer.national_id, birthDate: editingCustomer.birth_date, address: editingCustomer.address, notes: editingCustomer.notes, messagingConsent: editingCustomer.messaging_consent } : undefined} />
              {duplicateCandidates.length ? (
                <Alert tone="warning" title="Posible duplicado.">Hay {duplicateCandidates.length} ficha(s) con el mismo nombre o teléfono. Revísalas arriba; el teléfono compartido no impide continuar.</Alert>
              ) : null}
              <div>
                <Button type="submit" icon={Save} disabled={saving || !activeScope?.canWrite} className="w-full sm:w-auto">
                  {saving ? 'Guardando…' : editingCustomer ? 'Guardar cambios' : duplicateReviewed ? 'Confirmar cliente distinto' : 'Guardar cliente'}
                </Button>
              </div>
            </Card>
          </form>
        ) : null}

        {message ? <Alert tone="info">{message}</Alert> : null}
      </div>

      <div ref={selectedRef} className="scroll-mt-20 xl:sticky xl:top-6">
        <Card>
          <CardHeader title="Ficha seleccionada" />
          {selected ? (
            <>
              <div className="mt-4 flex items-center gap-3">
                <Avatar name={selected.full_name} size="lg" strong />
                <p className="min-w-0 font-display text-lg font-bold leading-tight text-ink">{selected.full_name}</p>
              </div>
              <dl className="mt-5 flex flex-col gap-4 text-sm">
                <div><dt className="text-[13px] text-text-muted">Teléfonos</dt><dd className="mt-1 text-text">{selected.customer_phones.map(({ phone_number }) => phone_number).join(' · ')}</dd></div>
                <div><dt className="text-[13px] text-text-muted">Dirección</dt><dd className="mt-1 text-text">{selected.address || '—'}</dd></div>
                <div><dt className="text-[13px] text-text-muted">Nacimiento</dt><dd className="mt-1 text-text">{selected.birth_date || '—'}</dd></div>
                <div><dt className="text-[13px] text-text-muted">WhatsApp</dt><dd className="mt-1.5"><Badge tone={selected.messaging_consent ? 'success' : 'neutral'}>{selected.messaging_consent ? 'Consentimiento otorgado' : 'Sin consentimiento'}</Badge></dd></div>
                <div>
                  <dt className="text-[13px] text-text-muted">Trabajos</dt>
                  <dd className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <span className="rounded-control bg-neutral-soft px-2 py-2.5"><strong className="block font-display text-lg text-ink">{selected.orderSummary?.total ?? 0}</strong><small className="text-text-secondary">Total</small></span>
                    <span className="rounded-control bg-action-soft px-2 py-2.5"><strong className="block font-display text-lg text-progress-ink">{selected.orderSummary?.open ?? 0}</strong><small className="text-progress-ink">Abiertos</small></span>
                    <span className="rounded-control bg-success-soft px-2 py-2.5"><strong className="block font-display text-lg text-success-ink">{selected.orderSummary?.completed ?? 0}</strong><small className="text-success-ink">Finalizados</small></span>
                  </dd>
                </div>
              </dl>
              <div className="mt-5 grid gap-2">
                <ButtonLink href={`/sales?clienteId=${selected.id}`} icon={Plus} block>Nueva venta</ButtonLink>
                <ButtonLink href={`/orders?clienteId=${selected.id}&cliente=${encodeURIComponent(selected.full_name)}`} variant="secondary" icon={ReceiptText} block>Ver pedidos de este cliente</ButtonLink>
                <Button variant="secondary" icon={Pencil} block onClick={() => editSelected(selected)}>Editar cliente</Button>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm leading-6 text-text-muted">Selecciona una coincidencia para revisar su ficha y reutilizarla.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
