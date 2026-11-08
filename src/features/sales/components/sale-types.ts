import type { SaleCustomer } from './CustomerSearchPicker'

export type SaleItem = {
  id: number
  organizationId: number | null
  name: string
  category: string
  price: number
  currency: string
}

export type PriceResult = {
  lineItems: { name: string; baseAmount: number; amount: number; currency: string; adjustmentReason?: string | null }[]
  totals: Record<string, number>
  cupEquivalent: number | null
  warnings: { message: string }[]
}

// save_multi_line_quotation: one priced entry per pair plus the order totals.
export type MultiPriceResult = {
  lines: { lineNumber: number; patientCustomerId: number; pricing: PriceResult }[]
  totals: Record<string, number>
  cupEquivalent: number | null
  warnings: { message: string; lineNumber?: number }[]
}

export type AcceptedOrder = { orderId: number; orderNumber: string }

export type Revision = { id: number; organizationId: number; branchId: number; customerId: number; label: string }

// One pair of glasses in the sale. `patient` null = the holder wears them.
export type PairDraft = {
  key: string
  patient: SaleCustomer | null
  revisionId: number
  selected: number[]
  agreedPrices: Record<number, string>
  adjustmentReasons: Record<number, string>
}

export const MAX_PAIRS = 10
