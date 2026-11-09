'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/shared/lib/friendly-error'
import { Alert, Card, CardHeader, Switch } from '@/shared/ui'

type SellerPermission = { membershipId: number; name: string; branchName: string | null; enabled: boolean }

// Exception: the owner lets a seller work every order of their branch (retail and
// commercial): see balances, collect, notify, manage production and deliver. Audited server-side.
export function CommercialOrderPermissions({ organizationId, canManage }: { organizationId: number; canManage: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const [sellers, setSellers] = useState<SellerPermission[] | null>(null)
  const [pending, setPending] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc('list_commercial_order_permissions', { target_organization_id: organizationId } as never)
    if (loadError) return setError(friendlyError(loadError, 'No pudimos cargar los vendedores.'))
    setSellers(data as unknown as SellerPermission[])
  }, [organizationId, supabase])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function toggle(seller: SellerPermission, enabled: boolean) {
    setPending(seller.membershipId); setError(null)
    const { error: saveError } = await supabase.rpc('set_commercial_orders_permission', { target_membership_id: seller.membershipId, enabled } as never)
    setPending(null)
    if (saveError) return setError(friendlyError(saveError, 'No pudimos cambiar el permiso.'))
    setSellers((current) => current?.map((entry) => (entry.membershipId === seller.membershipId ? { ...entry, enabled } : entry)) ?? null)
  }

  if (sellers && sellers.length === 0) return null
  return <Card className="flex flex-col gap-4">
    <div className="flex flex-col gap-1">
      <CardHeader title="Permiso especial: todos los pedidos de la sucursal" />
      <p className="text-[13px] text-text-muted">Úsalo solo como excepción. El vendedor autorizado ve todos los pedidos de su sucursal, ventas normales y pedidos a ópticas, con lo pagado y lo que se debe. Puede cobrarlos, avisar por WhatsApp, mover su producción y entregarlos, y cerrar o reabrir los pedidos a ópticas. Lo que cobre entra en su caja. Las cajas de los demás vendedores y las fichas y precios de las ópticas no los ve.</p>
    </div>
    {sellers === null ? <p className="text-sm text-text-muted">{error ?? 'Cargando vendedores…'}</p>
      : <div className="overflow-hidden rounded-card border border-line">
        {sellers.map((seller) => <div key={seller.membershipId} className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-4 py-3 last:border-b-0">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-semibold text-ink">{seller.name}</span>
            {seller.branchName ? <span className="text-[13px] text-text-muted">{seller.branchName}</span> : null}
          </div>
          <Switch checked={seller.enabled} disabled={!canManage || pending === seller.membershipId} onChange={(enabled) => void toggle(seller, enabled)} label={seller.enabled ? 'Autorizado' : 'Sin permiso'} />
        </div>)}
      </div>}
    {error && sellers ? <Alert tone="danger" role="alert">{error}</Alert> : null}
  </Card>
}
