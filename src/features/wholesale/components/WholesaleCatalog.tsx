'use client'

import { PackagePlus, Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { createClient } from '@/lib/supabase/client'
import { FormSelect } from '@/shared/components'
import { friendlyError } from '@/shared/lib/friendly-error'
import { Alert, Badge, Button, Card, CardHeader, Dialog, EmptyState, Field, Input, SegmentedControl, Switch } from '@/shared/ui'

import { categoryLabels, formatPrice, parseDecimal, type CatalogOption, type Currency } from '../types'

const categoryOptions = Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))

type Editing = CatalogOption | 'new' | null

// Products sold only to retail opticians. They never appear in the retail catalog or sales.
export function WholesaleCatalog({ organizationId, userId, items, canManage }: { organizationId: number; userId: string; items: CatalogOption[]; canManage: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState<Editing>(null)
  const current = editing && editing !== 'new' ? editing : null
  const [category, setCategory] = useState('vision_type')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [active, setActive] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function open(target: Editing) {
    const item = target && target !== 'new' ? target : null
    setCategory(item?.category ?? 'vision_type')
    setCurrency(item?.currency === 'CUP' ? 'CUP' : 'USD')
    setActive(item?.isActive ?? true)
    setError(null)
    setEditing(target)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const price = parseDecimal(String(form.get('price') ?? ''))
    if (name.length < 2) return setError('Escribe el nombre del producto.')
    if (price === null || Number.isNaN(price)) return setError('Escribe un precio válido, por ejemplo 25 o 25,50.')
    setPending(true); setError(null)
    const supabase = createClient()
    const changes = { name, category, sale_price: price, currency, is_active: active }
    const { error: saveError } = current
      ? await supabase.from('catalog_items').update(changes as never).eq('id', current.id)
      : await supabase.from('catalog_items').insert({ ...changes, organization_id: organizationId, code: `wh_${Date.now().toString(36)}`, cost_amount: 0, sales_channel: 'wholesale', created_by: userId } as never)
    setPending(false)
    if (saveError) return setError(friendlyError(saveError, 'No pudimos guardar el producto.'))
    setEditing(null)
    router.refresh()
  }

  return <Card className="flex flex-col gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <CardHeader title="Catálogo para ópticas" meta={String(items.filter(({ isActive }) => isActive).length)} />
        <p className="text-[13px] text-text-muted">Productos que solo se venden a otras ópticas, con su precio base. No aparecen en tus ventas normales.</p>
      </div>
      {canManage ? <Button icon={PackagePlus} onClick={() => open('new')}>Nuevo producto</Button> : null}
    </div>

    {items.length === 0 ? <EmptyState icon={PackagePlus} title="Aún no hay productos" description="Agrega los productos que vendes a las ópticas para poder recibir sus trabajos." />
      : <div className="overflow-hidden rounded-card border border-line">
        {items.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-soft px-4 py-3 last:border-b-0">
          <div className="flex min-w-0 flex-1 basis-full flex-col sm:basis-0">
            <span className="truncate text-[15px] font-semibold text-ink">{item.name}</span>
            <span className="text-[13px] text-text-muted">{categoryLabels[item.category] ?? item.category}</span>
          </div>
          {!item.isActive ? <Badge>Inactivo</Badge> : null}
          <span className="shrink-0 font-display text-[15px] font-bold tabular-nums text-ink">{formatPrice(item.price, item.currency)}</span>
          {canManage ? <Button size="sm" variant="ghost" icon={Pencil} onClick={() => open(item)}>Editar</Button> : null}
        </div>)}
      </div>}

    <Dialog
      open={editing !== null}
      onClose={() => { if (!pending) setEditing(null) }}
      eyebrow="Catálogo para ópticas"
      title={current ? `Editar ${current.name}` : 'Nuevo producto'}
      icon={PackagePlus}
      size="md"
      footer={<>
        <Button variant="ghost" onClick={() => setEditing(null)} disabled={pending}>Cancelar</Button>
        <Button type="submit" form={`wholesale-item-${organizationId}`} disabled={pending}>{pending ? 'Guardando…' : 'Guardar'}</Button>
      </>}
    >
      <form key={current?.id ?? 'new'} id={`wholesale-item-${organizationId}`} onSubmit={save} className="flex flex-col gap-4" noValidate>
        <Field label="Nombre"><Input name="name" defaultValue={current?.name ?? ''} maxLength={120} autoComplete="off" /></Field>
        <Field as="div" label="Tipo"><FormSelect ariaLabel="Tipo de producto" value={category} onValueChange={setCategory} options={categoryOptions} /></Field>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Precio base" className="min-w-[140px] flex-1"><Input name="price" defaultValue={current ? String(current.price).replace('.', ',') : ''} inputMode="decimal" maxLength={12} autoComplete="off" /></Field>
          <SegmentedControl label="Moneda" value={currency} onChange={setCurrency} options={[{ value: 'USD', label: 'USD' }, { value: 'CUP', label: 'CUP' }]} />
        </div>
        {current ? <Switch checked={active} onChange={setActive} label={active ? 'Activo' : 'Inactivo'} /> : null}
        {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
      </form>
    </Dialog>
  </Card>
}
