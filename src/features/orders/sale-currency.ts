import { formatAmount } from './format'

export type Currency = 'CUP' | 'USD'

// Balances are stored as CUP equivalents at the sale's frozen rate. A sale priced
// only in USD is shown and charged in USD by default; CUP and mixed sales stay in CUP
// (product decision 2026-11-06).
export function saleCurrency(totals: Record<string, number> | null | undefined): Currency {
  const currencies = Object.keys(totals ?? {})
  return currencies.length === 1 && currencies[0] === 'USD' ? 'USD' : 'CUP'
}

// CUP → USD at the sale rate, rounded up to the cent so paying it settles the
// balance (the server tolerates that sub-cent overshoot, QA-18).
export function cupToUsd(cup: number, rate: number) {
  if (!rate) return 0
  return Math.ceil(Math.round((cup / rate) * 1e6) / 1e4) / 100
}

export function formatInCurrency(cup: number, currency: Currency, rate: number) {
  return currency === 'USD' ? `${formatAmount(cupToUsd(cup, rate))} USD` : `${formatAmount(cup)} CUP`
}

// "3 000 CUP + 50 USD" for mixed sales.
export function formatTotals(totals: Record<string, number> | null | undefined) {
  return Object.entries(totals ?? {}).map(([currency, total]) => `${formatAmount(total)} ${currency}`).join(' + ')
}
