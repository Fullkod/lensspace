import type { createClient } from '@/lib/supabase/client'

type BrowserClient = ReturnType<typeof createClient>
export type DuplicateCustomer = { id: number; organizationId: number; branchId: number; name: string; phones: string[] }

// Same rule as customer_phones.normalized_phone: an 8-digit Cuban number gets 53.
export function canonicalPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.length === 8 ? `53${digits}` : digits
}

// Possible duplicates in the branch: same name (case-insensitive) or a shared phone.
// The business rule is to warn, never to forbid (homonyms and shared phones exist).
export async function findDuplicateCustomers(supabase: BrowserClient, scope: { organizationId: number; branchId: number }, name: string, phones: string[]) {
  const normalized = phones.map(canonicalPhone).filter((phone) => phone.length >= 5)
  const [{ data: phoneMatches }, { data: nameMatches }] = await Promise.all([
    normalized.length
      ? supabase.from('customer_phones').select('customer_id').eq('organization_id', scope.organizationId).eq('branch_id', scope.branchId).in('normalized_phone', normalized)
      : Promise.resolve({ data: [] }),
    supabase.from('customers').select('id').eq('organization_id', scope.organizationId).eq('branch_id', scope.branchId).is('archived_at', null).is('commercial_account_id', null).ilike('full_name', name.trim().replace(/[%_]/g, ' ')),
  ])
  const ids = [...new Set([...((phoneMatches ?? []) as { customer_id: number }[]).map(({ customer_id }) => customer_id), ...((nameMatches ?? []) as { id: number }[]).map(({ id }) => id)])]
  if (!ids.length) return []
  const { data } = await supabase.from('customers').select('id, organization_id, branch_id, full_name, customer_phones(phone_number)').in('id', ids).is('archived_at', null).is('commercial_account_id', null)
  return ((data ?? []) as { id: number; organization_id: number; branch_id: number; full_name: string; customer_phones: { phone_number: string }[] }[])
    .map((row) => ({ id: row.id, organizationId: row.organization_id, branchId: row.branch_id, name: row.full_name, phones: row.customer_phones.map(({ phone_number }) => phone_number) }))
}
