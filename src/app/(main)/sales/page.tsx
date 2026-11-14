import { redirect } from 'next/navigation'
import { SalesWorkspace } from '@/features/sales/components'
import { loadSaleContext } from '@/features/sales/load-sale-context'
import { requireCommercialRole } from '@/lib/supabase/access'
import { getCurrentUser } from '@/lib/supabase/current-user'
import { createClient } from '@/lib/supabase/server'
import { PageContainer, PageHeader } from '@/shared/ui'

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const requestedCustomerId = Number((await searchParams).clienteId) || 0
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  await requireCommercialRole()
  const { branchIds, organizations, items, lastRates, businessRates } = await loadSaleContext(supabase, user.id)
  // Only the latest customers; the picker searches the rest on demand and loads
  // prescriptions for the selected customer (QA-12).
  const [{ data: customerData }, { data: requestedCustomer }, { data: requestedRevisions }] = branchIds.length
    ? await Promise.all([
        supabase.from('customers').select('id, organization_id, branch_id, full_name').in('branch_id', branchIds).is('archived_at', null).is('commercial_account_id', null).order('updated_at', { ascending: false }).limit(10),
        // "Nueva venta" from a customer card (/sales?clienteId=…) starts with that customer.
        requestedCustomerId ? supabase.from('customers').select('id, organization_id, branch_id, full_name').eq('id', requestedCustomerId).in('branch_id', branchIds).is('commercial_account_id', null).maybeSingle() : Promise.resolve({ data: null }),
        requestedCustomerId ? supabase.from('prescription_revisions').select('id, organization_id, branch_id, prescription_id, prescription_date, prescriptions!inner(customer_id)').eq('prescriptions.customer_id', requestedCustomerId).order('created_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: null }, { data: [] }]
  type CustomerRow = { id: number; organization_id: number; branch_id: number; full_name: string }
  return <PageContainer>
    <PageHeader eyebrow="Ventas ópticas" title="Nueva venta" description="Cliente, receta, configuración y aceptación en un flujo trazable." />
    <SalesWorkspace organizations={organizations} userId={user.id} lastRates={lastRates} businessRates={businessRates}
      initialCustomer={requestedCustomer ? { id: (requestedCustomer as CustomerRow).id, organizationId: (requestedCustomer as CustomerRow).organization_id, branchId: (requestedCustomer as CustomerRow).branch_id, name: (requestedCustomer as CustomerRow).full_name } : null}
      initialRevisions={requestedCustomer ? ((requestedRevisions ?? []) as unknown as { id: number; organization_id: number; branch_id: number; prescription_id: number; prescription_date: string }[]).map((row) => ({ id: row.id, organizationId: row.organization_id, branchId: row.branch_id, customerId: requestedCustomerId, label: `Receta #${row.prescription_id} · ${row.prescription_date}` })) : []}
      recentCustomers={((customerData ?? []) as unknown as CustomerRow[]).map((entry) => ({ id: entry.id, organizationId: entry.organization_id, branchId: entry.branch_id, name: entry.full_name }))}
      items={items} />
  </PageContainer>
}
