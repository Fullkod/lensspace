import { newRequestId } from '@/shared/utils/request-id'

import type { SaleCustomer } from './CustomerSearchPicker'
import type { PairDraft } from './sale-types'

// Per-viewer convenience only (never balances or payments): a reload, a dropped
// connection or a closed tab must not lose the sale being prepared (QA-17).
export type SaleDraft = {
  version: 2
  savedAt: number
  customer: SaleCustomer
  pairs: PairDraft[]
  rate: string
  notes: string
}

// Single-pair drafts saved before LEN0006.
type LegacyDraft = Omit<SaleDraft, 'version' | 'pairs'> & {
  revisionId: number
  selected: number[]
  agreedPrices: Record<number, string>
  adjustmentReasons: Record<number, string>
}

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

export function newPair(patient: SaleCustomer | null = null): PairDraft {
  return { key: newRequestId(), patient, revisionId: 0, selected: [], agreedPrices: {}, adjustmentReasons: {} }
}

export function readDraft(key: string): SaleDraft | null {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as SaleDraft | LegacyDraft | null
    if (!raw?.customer || Date.now() - raw.savedAt >= DRAFT_TTL_MS) return null
    if ('version' in raw && raw.version === 2) return raw
    const legacy = raw as LegacyDraft
    return {
      version: 2, savedAt: legacy.savedAt, customer: legacy.customer, rate: legacy.rate, notes: legacy.notes,
      pairs: [{ ...newPair(), revisionId: legacy.revisionId, selected: legacy.selected, agreedPrices: legacy.agreedPrices, adjustmentReasons: legacy.adjustmentReasons }],
    }
  } catch {
    return null
  }
}

export function writeDraft(key: string, draft: SaleDraft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft))
    else localStorage.removeItem(key)
  } catch {
    /* storage unavailable (private mode): the sale still works without a draft */
  }
}
