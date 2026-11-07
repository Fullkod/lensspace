export type Order = {
  id: number
  orderNumber: string
  customerId: number
  customerName: string
  // Primary phone as stored, for display; null when the customer has none.
  customerPhone: string | null
  // Every normalized number of the customer, space-separated, for partial matching.
  customerPhoneDigits: string
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
