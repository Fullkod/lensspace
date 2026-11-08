'use client'

import { Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { Button, Input, cx } from '@/shared/ui'

export type SaleCustomer = { id: number; organizationId: number; branchId: number; name: string }

const normalizePhone = (value: string) => value.replace(/\D/g, '')

// Query on demand instead of preloading every customer: works past the old 200 cap
// and keeps the /sales payload small on slow links. Name or any part of a phone.
export function CustomerSearchPicker({ organizationId, branchId, recent, selected, onSelect, onClear }: {
  organizationId: number
  branchId: number
  recent: SaleCustomer[]
  selected: SaleCustomer | null
  onSelect: (customer: SaleCustomer) => void
  onClear: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<SaleCustomer[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const query = term.trim()

  useEffect(() => {
    if (query.length < 2) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      const digits = normalizePhone(query)
      let phoneCustomerIds: number[] = []
      if (digits.length >= 4) {
        const { data } = await supabase.from('customer_phones').select('customer_id').like('normalized_phone', `%${digits}%`).limit(20)
        phoneCustomerIds = [...new Set(((data ?? []) as { customer_id: number }[]).map(({ customer_id }) => customer_id))]
      }
      const safeTerm = query.replace(/[,%()]/g, ' ')
      let request = supabase.from('customers').select('id, organization_id, branch_id, full_name')
        .eq('organization_id', organizationId).eq('branch_id', branchId).is('archived_at', null).is('commercial_account_id', null)
        .order('updated_at', { ascending: false }).limit(12)
      request = phoneCustomerIds.length ? request.or(`full_name.ilike.%${safeTerm}%,id.in.(${phoneCustomerIds.join(',')})`) : request.ilike('full_name', `%${safeTerm}%`)
      const { data, error } = await request
      if (cancelled) return
      setLoading(false)
      setFailed(Boolean(error))
      setResults(((data ?? []) as { id: number; organization_id: number; branch_id: number; full_name: string }[]).map((row) => ({ id: row.id, organizationId: row.organization_id, branchId: row.branch_id, name: row.full_name })))
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [branchId, organizationId, query, supabase])

  if (selected) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-action bg-action-tint px-3.5 py-2">
        <span className="min-w-0 truncate text-[15px] font-semibold text-ink">{selected.name}</span>
        <Button variant="ghost" size="sm" icon={X} onClick={() => { setTerm(''); setResults(null); onClear() }} className="-mr-2 shrink-0">Cambiar</Button>
      </div>
    )
  }

  const searching = query.length >= 2
  const options = searching ? results ?? [] : recent
  return (
    <div className="flex flex-col gap-2">
      <Input leadingIcon={Search} value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar por nombre o teléfono" aria-label="Buscar cliente" autoComplete="off" />
      <p className="text-[12px] text-text-muted">
        {searching ? (loading ? 'Buscando…' : failed ? 'No pudimos buscar. Revisa la señal e inténtalo de nuevo.' : options.length ? 'Toca un cliente para seleccionarlo.' : 'Sin resultados. Usa «Nuevo cliente» para registrarlo.') : options.length ? 'Recientes' : 'Escribe al menos 2 letras o dígitos del teléfono.'}
      </p>
      {options.length ? (
        <ul className="flex max-h-64 flex-col overflow-y-auto rounded-control border border-line bg-surface">
          {options.map((customer, index) => (
            <li key={customer.id}>
              <button type="button" onClick={() => onSelect(customer)} className={cx('flex min-h-11 w-full items-center px-3.5 text-left text-[15px] text-ink hover:bg-action-tint focus-visible:bg-action-tint focus-visible:outline-none', index > 0 && 'border-t border-line-soft')}>
                {customer.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
