import { loadSaleContext } from '@/features/sales/load-sale-context'
import type { createClient } from '@/lib/supabase/client'

import type { OfflineCustomer, OfflineSnapshot } from '../types'

type Client = ReturnType<typeof createClient>
type Page<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>

const PAGE = 1000 // PostgREST max_rows (supabase/config.toml)
const MAX_ROWS = 10_000 // a ceiling for one branch; the pilot has dozens

async function readAll<T>(page: Page<T>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

type CustomerRow = { id: number; organization_id: number; branch_id: number; full_name: string }
type PhoneRow = { customer_id: number; normalized_phone: string | null }
type RevisionRow = { id: number; prescription_id: number; prescription_date: string; prescriptions: { customer_id: number } | null }
type OptometristRow = { organization_id: number; full_name: string }

// Reads what the offline desk needs with the seller's own session: RLS limits it to
// their branches, exactly as online. Throws on any error so a partial snapshot never
// replaces a complete one.
export async function captureSnapshot(supabase: Client, userId: string): Promise<OfflineSnapshot> {
  const context = await loadSaleContext(supabase, userId)
  const { branchIds, organizationIds } = context
  const none = Promise.resolve([] as never[])
  const [customerRows, phoneRows, revisionRows, optometristRows] = await Promise.all([
    branchIds.length ? readAll<CustomerRow>((from, to) => supabase.from('customers').select('id, organization_id, branch_id, full_name').in('branch_id', branchIds).is('archived_at', null).is('commercial_account_id', null).order('id').range(from, to)) : none,
    branchIds.length ? readAll<PhoneRow>((from, to) => supabase.from('customer_phones').select('customer_id, normalized_phone').in('branch_id', branchIds).order('id').range(from, to)) : none,
    branchIds.length ? readAll<RevisionRow>((from, to) => supabase.from('prescription_revisions').select('id, prescription_id, prescription_date, prescriptions!inner(customer_id)').in('branch_id', branchIds).order('created_at', { ascending: false }).range(from, to) as unknown as PromiseLike<{ data: RevisionRow[] | null; error: unknown }>) : none,
    organizationIds.length ? readAll<OptometristRow>((from, to) => supabase.from('optometrists').select('organization_id, full_name').in('organization_id', organizationIds).order('full_name').range(from, to)) : none,
  ])
  const phones = new Map<number, string[]>()
  for (const row of phoneRows) if (row.normalized_phone) phones.set(row.customer_id, [...(phones.get(row.customer_id) ?? []), row.normalized_phone])
  const revisions = new Map<number, OfflineCustomer['revisions']>()
  for (const row of revisionRows) {
    const customerId = row.prescriptions?.customer_id
    if (!customerId) continue
    revisions.set(customerId, [...(revisions.get(customerId) ?? []), { id: row.id, label: `Receta #${row.prescription_id} · ${row.prescription_date}` }])
  }
  return {
    version: 1,
    userId,
    confirmedAt: new Date().toISOString(),
    organizations: context.organizations,
    items: context.items,
    lastRates: context.lastRates,
    businessRates: context.businessRates,
    customers: customerRows.map((row) => ({ id: row.id, organizationId: row.organization_id, branchId: row.branch_id, name: row.full_name, phones: phones.get(row.id) ?? [], revisions: revisions.get(row.id) ?? [] })),
    optometrists: optometristRows.map((row) => ({ organizationId: row.organization_id, name: row.full_name })),
  }
}
