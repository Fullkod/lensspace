import type { SaleBusinessRate, SaleScope } from '@/features/sales/load-sale-context'
import type { SaleItem } from '@/features/sales/components/sale-types'

// Basic customer card kept on the device: no amounts, no prescription values.
export type OfflineCustomer = {
  id: number
  organizationId: number
  branchId: number
  name: string
  phones: string[]
  revisions: { id: number; label: string }[]
}

// Everything the offline desk reads, saved for one signed-in seller (LEN0011, D10).
export type OfflineSnapshot = {
  version: 1
  userId: string
  // Last time the server answered for this session; offline access ends 7 days later (R3).
  confirmedAt: string
  organizations: SaleScope[]
  items: SaleItem[]
  lastRates: Record<number, number>
  businessRates: Record<number, SaleBusinessRate>
  customers: OfflineCustomer[]
  optometrists: { organizationId: number; name: string }[]
}

export type OfflineSaleStatus = 'pending' | 'uploading' | 'uploaded' | 'retained' | 'discarded'

// One sale recorded without network. `payload` is filled by the offline sale screen
// (phase 4) and sent as is to record_offline_sale (phase 3).
export type OfflineSale = {
  id: string
  userId: string
  localNumber: string
  createdAt: string
  status: OfflineSaleStatus
  payload: unknown
  // Set by the upload: real order once accepted, or the reason it was retained.
  orderId?: number
  orderNumber?: string
  error?: string
  updatedAt: string
}
