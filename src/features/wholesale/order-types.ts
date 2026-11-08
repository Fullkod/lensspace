import type { Tone } from '@/shared/ui'

import { toUsd } from '@/features/orders/sale-currency'

export type CommercialStatus = 'open' | 'confirmed' | 'ready' | 'delivered' | 'closed'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

type Money = { totals: Record<string, number>; cupEquivalent: number; rate: number; paidCup: number }

export type CommercialOrderSummary = Money & {
  id: number
  orderNumber: string
  organizationId: number
  branchId: number
  accountId: number
  accountName: string
  status: CommercialStatus
  paymentStatus: PaymentStatus
  lineCount: number
  deliveredCount: number
  sellerName: string
  createdAt: string
}

export type CommercialLineItem = { name: string; category: string | null; kind: string; amount: number; baseAmount: number; currency: string; adjustmentReason: string | null }

export type CommercialLine = {
  id: number
  lineNumber: number
  patientId: number
  patientName: string | null
  prescriptionRevisionId: number | null
  totals: Record<string, number>
  cupEquivalent: number
  addedAt: string
  addedByName: string | null
  removedAt: string | null
  removedByName: string | null
  removalReason: string | null
  deliveredAt: string | null
  deliveredByName: string | null
  hasProduction: boolean
  items: CommercialLineItem[]
}

export type CommercialOrder = Money & {
  id: number
  orderNumber: string
  organizationId: number
  organizationName: string
  branchId: number
  branchName: string
  accountId: number
  accountName: string
  status: CommercialStatus
  paymentStatus: PaymentStatus
  sellerName: string | null
  createdAt: string
  closedAt: string | null
  closedByName: string | null
  readyAt: string | null
  deliveredAt: string | null
  canManage: boolean
  canWork: boolean
  lines: CommercialLine[]
}

// Branch where the user can open commercial orders, with its reference USD rate.
export type CommercialScope = { organizationId: number; organizationName: string; branchId: number; branchName: string; rate: number; canOperate: boolean }

export const statusLabels: Record<CommercialStatus, string> = {
  open: 'Abierto',
  confirmed: 'Cerrado · en fabricación',
  ready: 'Listo para recoger',
  delivered: 'Entregado',
  closed: 'Terminado',
}

export const statusTones: Record<CommercialStatus, Tone> = {
  open: 'progress',
  confirmed: 'warning',
  ready: 'success',
  delivered: 'neutral',
  closed: 'neutral',
}

export const paymentLabels: Record<PaymentStatus, string> = { unpaid: 'Sin pagar', partial: 'Pago parcial', paid: 'Pagado' }
export const paymentTones: Record<PaymentStatus, Tone> = { unpaid: 'danger', partial: 'warning', paid: 'success' }

// Every amount is shown in USD at the order's own rate (2026-11-08 decision).
export const totalUsd = (money: Money) => toUsd(Number(money.cupEquivalent), Number(money.rate))
export const paidUsd = (money: Money) => toUsd(Number(money.paidCup), Number(money.rate))
export const balanceUsd = (money: Money) => toUsd(Math.max(Number(money.cupEquivalent) - Number(money.paidCup), 0), Number(money.rate))

const usdFormat = new Intl.NumberFormat('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const formatUsd = (value: number) => `${usdFormat.format(value)} USD`

export const jobsLabel = (count: number) => (count === 1 ? '1 trabajo' : `${count} trabajos`)
