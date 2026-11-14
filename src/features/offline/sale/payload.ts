import { prescriptionRevisionValues } from '@/features/prescriptions/prescription-validation'
import type { LineAdjustments } from '@/features/sales/components/sale-pricing'

// What the device sends to record_offline_sale (supabase/migrations/20261113120000).
export type NewCustomerData = {
  fullName: string
  nationalId?: string
  address?: string
  birthDate?: string | null
  notes?: string
  messagingConsent?: boolean
  phones: { number: string; label: string; whatsappEnabled: boolean }[]
}

// Camel-case prescription fields, as `private.offline_new_revision` reads them.
export type NewRevisionData = Record<string, string | number | null>

export type OfflineSalePayload = {
  organizationId: number
  branchId: number
  soldAt: string
  localNumber: string
  deviceId: string
  usdToCupRate: number
  notes?: string
  holder: { id: number } | { new: NewCustomerData }
  pairs: {
    patient: { holder: true } | { id: number } | { new: NewCustomerData }
    prescription: { revisionId: number } | { new: NewRevisionData } | null
    itemIds: number[]
    lineAdjustments: LineAdjustments
  }[]
  payment: { amount: number; currency: 'USD' | 'CUP'; appliedRate: number; notes?: string } | null
  device: { totals: Record<string, number>; cupEquivalent: number }
}

// The online form produces `revision_right_sphere`-style keys for the RPC; the offline
// payload uses the form names (`rightSphere`), which the SQL helper reads.
export function revisionDataFromForm(form: FormData): NewRevisionData {
  return Object.fromEntries(Object.entries(prescriptionRevisionValues(form)).map(([key, value]) => [
    key.replace(/^revision_/, '').replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
    value as string | number | null,
  ]))
}
