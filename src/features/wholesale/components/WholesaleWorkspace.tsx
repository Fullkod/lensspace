'use client'

import { Archive, ArchiveRestore, Pencil, Plus, ReceiptText, Store, Tags } from 'lucide-react'
import { useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/shared/lib/friendly-error'
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, EmptyState, Toast } from '@/shared/ui'

import { formatUsd } from '../order-types'
import { discountLabel, type AccountPrice, type CommercialAccount, type WholesaleOrganization } from '../types'
import { AccountFormDialog } from './AccountFormDialog'
import { AccountPricesDialog } from './AccountPricesDialog'

type Action = { kind: 'form'; organization: WholesaleOrganization; account: CommercialAccount | null } | { kind: 'prices'; organization: WholesaleOrganization; account: CommercialAccount }

const fixedLabel = (count: number) => (count === 1 ? '1 precio fijo' : `${count} precios fijos`)

// LEN0009: the owner keeps the retail opticians the organization sells to, with their
// payment terms and prices. Their orders and debts arrive with LEN0010.
export function WholesaleWorkspace({ userId, organizations, initialAccounts, initialPrices, debts }: {
  userId: string
  debts: Record<number, number>
  organizations: WholesaleOrganization[]
  initialAccounts: CommercialAccount[]
  initialPrices: AccountPrice[]
}) {
  const [accounts, setAccounts] = useState(initialAccounts)
  const [prices, setPrices] = useState(initialPrices)
  const [action, setAction] = useState<Action | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  function saved(account: CommercialAccount) {
    const isNew = !accounts.some(({ id }) => id === account.id)
    setAccounts((current) => [...current.filter(({ id }) => id !== account.id), account].sort((a, b) => a.name.localeCompare(b.name, 'es')))
    setToast(isNew ? `Óptica agregada: ${account.name}.` : `Datos guardados: ${account.name}.`)
    setAction(null)
  }

  async function toggleArchived(account: CommercialAccount) {
    setError(null)
    const archivedAt = account.archived_at ? null : new Date().toISOString()
    const { data, error: archiveError } = await createClient().from('commercial_accounts').update({ archived_at: archivedAt } as never).eq('id', account.id).select('*').single()
    if (archiveError) {
      return setError(archiveError.code === '23505' ? `Ya hay otra óptica activa llamada «${account.name}». Cambia uno de los nombres antes de restaurarla.` : friendlyError(archiveError, 'No pudimos cambiar la óptica.'))
    }
    setAccounts((current) => current.map((entry) => (entry.id === account.id ? data as CommercialAccount : entry)))
    setToast(archivedAt ? `${account.name} se archivó. Su historial se conserva.` : `${account.name} está activa otra vez.`)
  }

  return <div className="flex flex-col gap-5">
    {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
    {organizations.map((organization) => {
      const own = accounts.filter(({ organization_id }) => organization_id === organization.id)
      const archived = own.filter(({ archived_at }) => archived_at)
      const visible = showArchived ? own : own.filter(({ archived_at }) => !archived_at)
      return <Card key={organization.id} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <CardHeader title={organizations.length > 1 ? organization.name : 'Ópticas minoristas'} meta={String(own.length - archived.length)} />
            <p className="text-[13px] text-text-muted">Ópticas a las que vendes. No necesitan usuario en LensSpace; cada una puede tener su descuento y sus precios fijos.</p>
          </div>
          {organization.canManage ? <Button icon={Plus} onClick={() => setAction({ kind: 'form', organization, account: null })}>Nueva óptica</Button> : null}
        </div>

        {visible.length === 0 ? <EmptyState icon={Store} title="Aún no hay ópticas minoristas" description="Agrega la primera para darle precios propios." />
          : <div className="overflow-hidden rounded-card border border-line">
            {visible.map((account) => {
              const fixedCount = prices.filter(({ account_id }) => account_id === account.id).length
              const details = [account.contact_name, account.phone].filter(Boolean).join(' · ')
              return <div key={account.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft px-4 py-3 last:border-b-0">
                <div className="flex min-w-0 flex-1 basis-full flex-col gap-1 sm:basis-0">
                  <span className="truncate text-[15px] font-semibold text-ink">{account.name}</span>
                  {details ? <span className="truncate text-[13px] text-text-muted">{details}</span> : null}
                  {account.payment_terms || account.credit_days !== null ? <span className="text-[13px] text-text-muted">
                    {[account.payment_terms, account.credit_days !== null ? `${account.credit_days} días de crédito` : null].filter(Boolean).join(' · ')}
                  </span> : null}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {account.archived_at ? <Badge>Archivada</Badge> : null}
                    {(debts[account.id] ?? 0) > 0 ? <Badge tone="danger">Debe {formatUsd(debts[account.id])}</Badge> : null}
                    {Number(account.discount_percent) ? <Badge tone="progress">{discountLabel(Number(account.discount_percent))}</Badge> : null}
                    {fixedCount ? <Badge tone="progress">{fixedLabel(fixedCount)}</Badge> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink size="sm" variant="ghost" icon={ReceiptText} href={`/wholesale-orders?optica=${account.id}`}>Pedidos</ButtonLink>
                  <Button size="sm" variant="ghost" icon={Tags} onClick={() => setAction({ kind: 'prices', organization, account })}>Precios</Button>
                  {organization.canManage ? <>
                    {!account.archived_at ? <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setAction({ kind: 'form', organization, account })}>Editar</Button> : null}
                    <Button size="sm" variant="ghost" icon={account.archived_at ? ArchiveRestore : Archive} onClick={() => void toggleArchived(account)}>{account.archived_at ? 'Restaurar' : 'Archivar'}</Button>
                  </> : null}
                </div>
              </div>
            })}
          </div>}

        {archived.length ? <button type="button" className="self-start text-[13px] font-semibold text-action hover:underline" onClick={() => setShowArchived((value) => !value)}>
          {showArchived ? 'Ocultar archivadas' : `Ver archivadas (${archived.length})`}
        </button> : null}
      </Card>
    })}

    {action?.kind === 'form' ? <AccountFormDialog
      organizationId={action.organization.id}
      organizationName={action.organization.name}
      userId={userId}
      account={action.account}
      onClose={() => setAction(null)}
      onSaved={saved}
    /> : null}
    {action?.kind === 'prices' ? <AccountPricesDialog
      account={action.account}
      catalog={action.organization.catalog}
      prices={prices.filter(({ account_id }) => account_id === action.account.id)}
      canManage={action.organization.canManage && !action.account.archived_at}
      onClose={() => setAction(null)}
      onChanged={(next) => setPrices((current) => [...current.filter(({ account_id }) => account_id !== action.account.id), ...next])}
    /> : null}
    {toast ? <Toast message={toast} onDismiss={() => setToast('')} /> : null}
  </div>
}
