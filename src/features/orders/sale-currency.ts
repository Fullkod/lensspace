import { formatAmount } from './format'

export type Currency = 'CUP' | 'USD'

// Balances are stored as CUP equivalents at the sale's frozen rate. Every sale is shown
// and charged in USD by default (owner decision 2026-11-08); CUP payments stay possible
// and catalog prices, payments and cashboxes keep their own currency.
export function saleCurrency(): Currency {
  return 'USD'
}

// True when the sale was priced only in USD: its USD total is exact, not converted.
export const isUsdOnly = (totals: Record<string, number> | null | undefined) => {
  const currencies = Object.keys(totals ?? {})
  return currencies.length === 1 && currencies[0] === 'USD'
}

// CUP -> USD for display (nearest cent), e.g. totals and paid amounts.
export const toUsd = (cup: number, rate: number) => (rate ? Math.round((cup / rate) * 100) / 100 : 0)

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
