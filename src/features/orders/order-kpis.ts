import { isFinished } from './order-status'
import type { Order } from './types'

// Shared by the orders header and the dashboard so both show the same figures.
// Inputs come from list_accessible_orders, so RLS already scopes them per role.
// Money figures in USD, each order converted at its own sale rate (decision 2026-11-08).
export function orderKpis(orders: Pick<Order, 'commercialStatus' | 'balanceCup' | 'paidTodayCup' | 'saleRate'>[]) {
  const usd = (cup: number, rate: number | null) => (rate ? Number(cup) / Number(rate) : 0)
  const active = orders.filter((order) => !isFinished(order))
  return {
    activeCount: active.length,
    balanceDue: Math.round(active.reduce((sum, order) => sum + usd(order.balanceCup, order.saleRate), 0) * 100) / 100,
    readyToDeliver: active.filter((order) => order.balanceCup <= 0).length,
    withBalance: active.filter((order) => order.balanceCup > 0).length,
    collectedToday: Math.round(orders.reduce((sum, order) => sum + usd(order.paidTodayCup, order.saleRate), 0) * 100) / 100,
  }
}
