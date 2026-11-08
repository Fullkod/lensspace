export type Order = {
  id: number
  orderNumber: string
  customerId: number
  customerName: string
  // Primary phone as stored, for display; null when the customer has none.
  customerPhone: string | null
  // Every normalized number of the customer, space-separated, for partial matching.
  customerPhoneDigits: string
  // LEN0006: number of pairs (1 for a classic order) and the other patients' names, for search.
  pairCount: number
  patientNames: string
  patientCustomerIds: number[]
  commercialStatus: string
  paymentStatus: string
  totalCup: number
  createdAt: string
  paidCup: number
  balanceCup: number
  paidTodayCup: number
  hasOpenIncident: boolean
}

export type Payment = { id: number; amount: number; currency: string; appliedRate: number; equivalentCup: number; receivedAt: string; isPostClose: boolean; notes: string | null }

export type PaymentSummary = { orderId: number; orderNumber: string; totalCup: number; paidCup: number; balanceCup: number; paymentStatus: string; commercialStatus: string; saleRate: number | null; totals: Record<string, number>; payments: Payment[] }

export type TimelineEvent = { id: string; kind: string; title: string; detail: string; actorName: string; occurredAt: string }

// One pair of glasses inside an order (LEN0006): who wears it, its prescription and concepts.
export type OrderPair = {
  id: number
  lineNumber: number
  patientCustomerId: number
  patientName: string
  prescriptionLabel: string | null
  totals: Record<string, number>
  cupEquivalent: number
  items: { name: string; amount: number; currency: string }[]
}
