import { canonicalPhone } from '@/features/customers/phone'
import type { SaleCustomer } from '@/features/sales/components/CustomerSearchPicker'
import type { Revision } from '@/features/sales/components/sale-types'

import type { OfflineCustomer, OfflineSnapshot } from '../types'

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function inScope(customer: OfflineCustomer, organizationId: number, branchId: number) {
  return customer.organizationId === organizationId && customer.branchId === branchId
}

export function toSaleCustomer(customer: OfflineCustomer): SaleCustomer {
  return { id: customer.id, organizationId: customer.organizationId, branchId: customer.branchId, name: customer.name }
}

// Same behaviour as the online picker: any part of the name, or 4+ digits of a phone.
export function searchSavedCustomers(snapshot: OfflineSnapshot, organizationId: number, branchId: number, term: string): SaleCustomer[] {
  const name = fold(term)
  const digits = term.replace(/\D/g, '')
  return snapshot.customers
    .filter((customer) => inScope(customer, organizationId, branchId)
      && (fold(customer.name).includes(name) || (digits.length >= 4 && customer.phones.some((phone) => phone.includes(digits)))))
    .slice(0, 12)
    .map(toSaleCustomer)
}

// Same rule as findDuplicateCustomers online: same name or a shared phone; warn only.
export function savedDuplicates(snapshot: OfflineSnapshot, organizationId: number, branchId: number, name: string, phones: string[]) {
  const folded = fold(name)
  const normalized = phones.map(canonicalPhone).filter((phone) => phone.length >= 5)
  return snapshot.customers
    .filter((customer) => inScope(customer, organizationId, branchId)
      && (fold(customer.name) === folded || customer.phones.some((phone) => normalized.includes(phone))))
    .map((customer) => ({ ...toSaleCustomer(customer), phones: customer.phones }))
}

export function savedRevisions(snapshot: OfflineSnapshot, customerId: number): Revision[] {
  const customer = snapshot.customers.find((entry) => entry.id === customerId)
  if (!customer) return []
  return customer.revisions.map((revision) => ({ id: revision.id, organizationId: customer.organizationId, branchId: customer.branchId, customerId, label: revision.label }))
}

export function savedPhone(snapshot: OfflineSnapshot, customerId: number) {
  return snapshot.customers.find((entry) => entry.id === customerId)?.phones[0] ?? null
}
