import type { PairDraft, SaleItem } from './sale-types'

export type LineAdjustments = Record<string, { amount: number; reason: string }>

// Client-side running total of one pair (agreed prices). The server confirms it on save
// and may add graduation surcharges, so the UI labels it as an estimate.
export function pairEstimate(pair: PairDraft, items: SaleItem[]) {
  return items.filter((item) => pair.selected.includes(item.id)).reduce<Record<string, number>>((totals, item) => {
    const agreed = Number(pair.agreedPrices[item.id]?.trim() || item.price)
    totals[item.currency] = (totals[item.currency] ?? 0) + (Number.isFinite(agreed) ? agreed : item.price)
    return totals
  }, {})
}

export function sumTotals(totals: Record<string, number>[]) {
  return totals.reduce<Record<string, number>>((sum, entry) => {
    for (const [currency, amount] of Object.entries(entry)) sum[currency] = (sum[currency] ?? 0) + amount
    return sum
  }, {})
}

export function toCup(totals: Record<string, number>, rate: number) {
  return Object.entries(totals).reduce((sum, [currency, total]) => sum + (currency === 'USD' ? total * rate : total), 0)
}

// Validates agreed prices of one pair; returns the adjustments or a Spanish error message.
export function pairAdjustmentsOrError(pair: PairDraft, items: SaleItem[], canApproveLargeDiscount: boolean, label: string): LineAdjustments | string {
  if (!pair.selected.length) return `Elige al menos un concepto para ${label}.`
  const adjustments: LineAdjustments = {}
  for (const item of items.filter((entry) => pair.selected.includes(entry.id))) {
    const rawAmount = pair.agreedPrices[item.id]?.trim()
    if (!rawAmount) continue
    const amount = Number(rawAmount)
    if (!Number.isFinite(amount) || amount < 0) return `Indica un precio válido para ${item.name} (${label}).`
    if (amount === item.price) continue
    const reason = pair.adjustmentReasons[item.id]?.trim() ?? ''
    if (reason.length < 5) return `Explica el ajuste de ${item.name} (${label}) en al menos 5 caracteres.`
    if (amount < item.price * 0.9 && !canApproveLargeDiscount) return `El descuento de ${item.name} (${label}) supera el 10 %. Debe autorizarlo un propietario.`
    adjustments[String(item.id)] = { amount, reason }
  }
  return adjustments
}

// A pair of glasses has one vision type: picking another replaces the previous one.
export function toggleItem(selected: number[], itemId: number, items: SaleItem[]) {
  const category = items.find((item) => item.id === itemId)?.category
  const exclusiveIds = category === 'vision_type' ? new Set(items.filter((item) => item.category === category).map((item) => item.id)) : null
  return selected.includes(itemId) ? selected.filter((id) => id !== itemId) : [...selected.filter((id) => !exclusiveIds?.has(id)), itemId]
}
