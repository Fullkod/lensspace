'use client'

import { Copy, Tags } from 'lucide-react'
import { useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { FormSelect } from '@/shared/components'
import { friendlyError } from '@/shared/lib/friendly-error'
import { Alert, Button, Dialog, Input, Switch } from '@/shared/ui'

import { accountPrice, categoryLabels, discountLabel, formatPrice, parseDecimal, type AccountPrice, type CatalogOption, type CommercialAccount } from '../types'

type Draft = { price: string; currency: string; offered: boolean }

function draftFor(item: CatalogOption, row?: AccountPrice): Draft {
  return { price: row?.sale_price == null ? '' : String(row.sale_price).replace('.', ','), currency: row?.currency ?? item.currency, offered: row?.is_offered ?? true }
}

// Every wholesale product for one optician in a single table. An empty price means the
// base price (with the general discount, if any); only the differences are stored.
export function AccountPricesDialog({ account, catalog, prices, otherAccounts, otherPrices, canManage, onClose, onChanged }: {
  account: CommercialAccount
  catalog: CatalogOption[]
  prices: AccountPrice[]
  otherAccounts: Pick<CommercialAccount, 'id' | 'name'>[]
  otherPrices: AccountPrice[]
  canManage: boolean
  onClose: () => void
  onChanged: (prices: AccountPrice[]) => void
}) {
  const discount = Number(account.discount_percent)
  const [drafts, setDrafts] = useState<Record<number, Draft>>(() => Object.fromEntries(catalog.map((item) => [item.id, draftFor(item, prices.find(({ catalog_item_id }) => catalog_item_id === item.id))])))
  const [sourceId, setSourceId] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const change = (id: number, patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }))

  function copyFrom() {
    const source = otherPrices.filter(({ account_id }) => account_id === Number(sourceId))
    setDrafts(Object.fromEntries(catalog.map((item) => [item.id, draftFor(item, source.find(({ catalog_item_id }) => catalog_item_id === item.id))])))
  }

  async function save() {
    const next: AccountPrice[] = []
    for (const item of catalog) {
      const draft = drafts[item.id]
      const price = parseDecimal(draft.price)
      if (Number.isNaN(price)) return setError(`Revisa el precio de ${item.name}: escribe por ejemplo 25 o 25,50.`)
      if (price !== null || !draft.offered) next.push({ account_id: account.id, catalog_item_id: item.id, sale_price: price, currency: price === null ? null : draft.currency, is_offered: draft.offered })
    }
    setPending(true); setError(null)
    const entries = catalog.map((item) => {
      const saved = next.find(({ catalog_item_id }) => catalog_item_id === item.id)
      return { item_id: item.id, price: saved?.sale_price ?? null, currency: saved?.currency ?? null, offered: drafts[item.id].offered }
    })
    const { error: saveError } = await createClient().rpc('save_commercial_account_prices', { target_account_id: account.id, entries } as never)
    setPending(false)
    if (saveError) return setError(friendlyError(saveError, 'No pudimos guardar los precios.'))
    onChanged(next)
    onClose()
  }

  return <Dialog
    open
    onClose={() => { if (!pending) onClose() }}
    eyebrow={account.name}
    title="Precios de la óptica"
    description={`Deja vacío lo que vaya a precio base${discount ? ` (con ${discountLabel(discount).toLowerCase()})` : ''}. Solo escribe lo que sea diferente.`}
    icon={Tags}
    size="lg"
    footer={<>
      <Button variant="ghost" onClick={onClose} disabled={pending}>{canManage ? 'Cancelar' : 'Cerrar'}</Button>
      {canManage && catalog.length ? <Button onClick={() => void save()} disabled={pending}>{pending ? 'Guardando…' : 'Guardar precios'}</Button> : null}
    </>}
  >
    <div className="flex flex-col gap-4">
      {catalog.length === 0 ? <p className="text-sm text-text-muted">Primero crea los productos en «Catálogo para ópticas».</p> : <>
        {canManage && otherAccounts.length ? <div className="flex flex-wrap items-end gap-2 rounded-card border border-line-soft bg-field p-3">
          <div className="min-w-[200px] flex-1"><FormSelect ariaLabel="Óptica de la que copiar" value={sourceId} onValueChange={setSourceId} options={[{ value: '', label: 'Copiar precios de otra óptica' }, ...otherAccounts.map(({ id, name }) => ({ value: String(id), label: name }))]} /></div>
          <Button variant="ghost" icon={Copy} disabled={!sourceId || pending} onClick={copyFrom}>Copiar</Button>
        </div> : null}

        <div className="overflow-hidden rounded-card border border-line">
          {catalog.map((item) => {
            const draft = drafts[item.id]
            const base = accountPrice(item, discount)
            return <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft px-4 py-3 last:border-b-0">
              <div className="flex min-w-0 flex-1 basis-full flex-col sm:basis-0">
                <span className="truncate text-[15px] font-semibold text-ink">{item.name}</span>
                <span className="text-[13px] text-text-muted">{categoryLabels[item.category] ?? item.category} · base {formatPrice(item.price, item.currency)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-24"><Input aria-label={`Precio de ${item.name} para ${account.name}`} value={draft.price} placeholder={String(base.price).replace('.', ',')} disabled={!canManage || !draft.offered} onChange={(event) => change(item.id, { price: event.target.value })} inputMode="decimal" maxLength={12} autoComplete="off" /></div>
                <span className="text-[13px] font-semibold text-text-muted">{draft.currency}</span>
              </div>
              <Switch checked={draft.offered} disabled={!canManage} onChange={(offered) => change(item.id, { offered })} label={draft.offered ? 'Se ofrece' : 'No se ofrece'} />
            </div>
          })}
        </div>
      </>}
      {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
    </div>
  </Dialog>
}
