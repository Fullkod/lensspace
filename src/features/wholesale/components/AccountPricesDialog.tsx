'use client'

import { Tags, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { createClient } from '@/lib/supabase/client'
import { FormSelect } from '@/shared/components'
import { friendlyError } from '@/shared/lib/friendly-error'
import { Alert, Button, Dialog, Field, IconButton, Input, SegmentedControl } from '@/shared/ui'

import { accountPrice, categoryLabels, discountLabel, formatPrice, parseDecimal, type AccountPrice, type CatalogOption, type CommercialAccount, type Currency } from '../types'

// Fixed prices per catalog item for one retail optician (LEN0009). The fixed price wins
// over the general discount; items without one get the discount on the catalog price.
export function AccountPricesDialog({ account, catalog, prices, canManage, onClose, onChanged }: {
  account: CommercialAccount
  catalog: CatalogOption[]
  prices: AccountPrice[]
  canManage: boolean
  onClose: () => void
  onChanged: (prices: AccountPrice[]) => void
}) {
  const [itemId, setItemId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const discount = Number(account.discount_percent)
  const fixedFor = (id: number) => prices.find(({ catalog_item_id }) => catalog_item_id === id)
  const fixedItems = catalog.filter(({ id }) => fixedFor(id))
  const formId = `account-prices-${account.id}`

  function pickItem(value: string) {
    setItemId(value)
    setError(null)
    const item = catalog.find(({ id }) => id === Number(value))
    const fixed = item ? fixedFor(item.id) : undefined
    setAmount(fixed ? String(fixed.sale_price).replace('.', ',') : '')
    setCurrency(((fixed?.currency ?? item?.currency) === 'CUP' ? 'CUP' : 'USD'))
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const item = catalog.find(({ id }) => id === Number(itemId))
    if (!item) return setError('Elige un artículo del catálogo.')
    const price = parseDecimal(amount)
    if (price === null || Number.isNaN(price)) return setError('Escribe un precio válido, por ejemplo 25 o 25,50.')
    setPending(true); setError(null)
    const supabase = createClient()
    const exists = Boolean(fixedFor(item.id))
    // UPDATE is granted only on price and currency, so an upsert would be refused.
    const { error: saveError } = exists
      ? await supabase.from('commercial_account_prices').update({ sale_price: price, currency } as never).eq('account_id', account.id).eq('catalog_item_id', item.id)
      : await supabase.from('commercial_account_prices').insert({ account_id: account.id, organization_id: account.organization_id, catalog_item_id: item.id, sale_price: price, currency } as never)
    setPending(false)
    if (saveError) return setError(friendlyError(saveError, 'No pudimos guardar el precio.'))
    const entry: AccountPrice = { account_id: account.id, catalog_item_id: item.id, sale_price: price, currency }
    onChanged([...prices.filter(({ catalog_item_id }) => catalog_item_id !== item.id), entry])
    setItemId(''); setAmount('')
  }

  async function remove(item: CatalogOption) {
    setPending(true); setError(null)
    const { error: removeError } = await createClient().from('commercial_account_prices').delete().eq('account_id', account.id).eq('catalog_item_id', item.id)
    setPending(false)
    if (removeError) return setError(friendlyError(removeError, 'No pudimos quitar el precio.'))
    onChanged(prices.filter(({ catalog_item_id }) => catalog_item_id !== item.id))
  }

  const options = [{ value: '', label: 'Elige un artículo' }, ...catalog.map((item) => ({
    value: String(item.id),
    label: `${categoryLabels[item.category] ?? item.category} · ${item.name} (${formatPrice(item.price, item.currency)})`,
  }))]

  return <Dialog
    open
    onClose={() => { if (!pending) onClose() }}
    eyebrow={account.name}
    title="Precios de la óptica"
    description={discount ? `${discountLabel(discount)} sobre el catálogo. Los precios fijos lo sustituyen.` : 'Sin descuento general: lo que no tenga precio fijo sale a precio de catálogo.'}
    icon={Tags}
    size="md"
    footer={<Button variant="ghost" onClick={onClose} disabled={pending}>Cerrar</Button>}
  >
    <div className="flex flex-col gap-4">
      {fixedItems.length === 0 ? <p className="text-sm text-text-muted">Aún no hay precios fijos para esta óptica.</p>
        : <div className="overflow-hidden rounded-card border border-line">
          {fixedItems.map((item) => {
            const fixed = accountPrice(item, discount, fixedFor(item.id))
            return <div key={item.id} className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-b-0">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold text-ink">{item.name}</span>
                <span className="text-[13px] text-text-muted">{categoryLabels[item.category] ?? item.category} · catálogo {formatPrice(item.price, item.currency)}</span>
              </div>
              <span className="shrink-0 font-display text-[15px] font-bold tabular-nums text-ink">{formatPrice(fixed.price, fixed.currency)}</span>
              {canManage ? <IconButton icon={Trash2} label={`Quitar precio fijo de ${item.name}`} onClick={() => void remove(item)} disabled={pending} /> : null}
            </div>
          })}
        </div>}

      {canManage ? <form id={formId} onSubmit={save} className="flex flex-col gap-3 rounded-card border border-line-soft bg-field p-4" noValidate>
        <p className="text-[13px] font-semibold text-text-label">Agregar o cambiar un precio fijo</p>
        <Field as="div" label="Artículo"><FormSelect ariaLabel="Artículo" value={itemId} onValueChange={pickItem} options={options} /></Field>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Precio para esta óptica" className="min-w-[140px] flex-1"><Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" maxLength={12} autoComplete="off" /></Field>
          <SegmentedControl label="Moneda" value={currency} onChange={setCurrency} options={[{ value: 'USD', label: 'USD' }, { value: 'CUP', label: 'CUP' }]} />
        </div>
        {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
        <div className="flex justify-end"><Button type="submit" form={formId} disabled={pending || !itemId}>{pending ? 'Guardando…' : 'Guardar precio'}</Button></div>
      </form> : error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
    </div>
  </Dialog>
}
