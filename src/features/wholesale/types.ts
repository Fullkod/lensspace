import type { Tables } from '@/lib/supabase/database.types'

export type Currency = 'CUP' | 'USD'

export type CommercialAccount = Tables<'commercial_accounts'>

export type AccountPrice = Pick<Tables<'commercial_account_prices'>, 'account_id' | 'catalog_item_id' | 'sale_price' | 'currency'>

// Catalog item as the organization sells it at retail (its override applied).
export type CatalogOption = { id: number; category: string; name: string; price: number; currency: string }

export type WholesaleOrganization = { id: number; name: string; canManage: boolean; catalog: CatalogOption[] }

export const categoryLabels: Record<string, string> = {
  vision_type: 'Tipo de espejuelo',
  lens_material: 'Material',
  treatment: 'Tratamiento',
  frame: 'Armadura',
  mounting: 'Montaje',
  adjustment: 'Ajuste',
}

const amountFormat = new Intl.NumberFormat('es-CU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const formatPrice = (value: number, currency: string) => `${amountFormat.format(Number(value))} ${currency}`

// "12,5" or "12.5" → 12.5; empty → null; anything else → NaN.
export function parseDecimal(value: string) {
  const clean = value.trim().replace(/\s/g, '').replace(',', '.')
  if (!clean) return null
  return /^\d+(\.\d{1,2})?$/.test(clean) ? Number(clean) : Number.NaN
}

export const discountLabel = (percent: number) => `Descuento ${amountFormat.format(Number(percent))} %`

// Retail price with the account rules: fixed price wins, otherwise the general discount.
export function accountPrice(item: CatalogOption, discountPercent: number, fixed?: AccountPrice) {
  if (fixed) return { price: Number(fixed.sale_price), currency: fixed.currency, source: 'fixed' as const }
  const price = Math.round(item.price * (1 - Number(discountPercent) / 100) * 100) / 100
  return { price, currency: item.currency, source: Number(discountPercent) > 0 ? ('discount' as const) : ('catalog' as const) }
}
