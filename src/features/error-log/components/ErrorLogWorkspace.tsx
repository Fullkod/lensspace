'use client'

import { Bug, CheckCircle2, EyeOff, RotateCcw, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition, type ReactNode } from 'react'

import { createClient } from '@/lib/supabase/client'
import { friendlyError } from '@/shared/lib/friendly-error'
import { Alert, Badge, Button, Card, Dialog, EmptyState, FilterChips, ListItem, Toast } from '@/shared/ui'
import { BUSINESS_TIME_ZONE } from '@/shared/utils/dates'

import { type ErrorGroupDetail, type ErrorGroupList, type ErrorGroupStatus, sourceLabels, statusLabels, statusTones } from '../types'

type Filter = ErrorGroupStatus | 'all'

const dateTime = new Intl.DateTimeFormat('es-CU', { timeZone: BUSINESS_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const formatDateTime = (value: string) => dateTime.format(new Date(value))

const alertStatusLabels: Record<string, string> = { requested: 'Enviando', sent: 'Enviado', failed: 'No enviado', skipped: 'Omitido (tope por hora)' }
// QA-61: OpenWA answers 5xx after delivering, so that outcome is unknown, not failed.
const alertLabel = (alert: { status: string; failure_code: string | null }) =>
  alert.failure_code === 'provider_unconfirmed' ? 'Sin confirmar' : alertStatusLabels[alert.status] ?? alert.status

export function ErrorLogWorkspace({ list }: { list: ErrorGroupList }) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('open')
  const [detail, setDetail] = useState<ErrorGroupDetail | null>(null)
  const [loadingId, setLoadingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const groups = useMemo(() => list.groups.filter((group) => filter === 'all' || group.status === filter), [list.groups, filter])
  const total = list.counts.open + list.counts.resolved + list.counts.ignored

  async function openDetail(groupId: number) {
    setError(null)
    setLoadingId(groupId)
    const { data, error: loadError } = await createClient().rpc('get_error_group', { target_group_id: groupId } as never)
    setLoadingId(null)
    if (loadError) return setError(friendlyError(loadError, 'No pudimos abrir el detalle del error.'))
    setDetail(data as unknown as ErrorGroupDetail)
  }

  function changeStatus(status: ErrorGroupStatus) {
    if (!detail) return
    startTransition(async () => {
      const { error: saveError } = await createClient().rpc('set_error_group_status', { target_group_id: detail.id, target_status: status } as never)
      if (saveError) return setError(friendlyError(saveError, 'No pudimos cambiar el estado del error.'))
      setDetail(null)
      setToast(`Error #${detail.id}: ${statusLabels[status].toLowerCase()}.`)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <FilterChips
        label="Estado de los errores"
        value={filter}
        onChange={setFilter}
        chips={[
          { value: 'open', label: 'Abiertos', count: list.counts.open },
          { value: 'resolved', label: 'Resueltos', count: list.counts.resolved },
          { value: 'ignored', label: 'Ignorados', count: list.counts.ignored },
          { value: 'all', label: 'Todos', count: total },
        ]}
      />
      {error && !detail ? <Alert tone="danger" role="alert">{error}</Alert> : null}
      <Card padded={false} className="overflow-hidden">
        {groups.length ? groups.map((group, index) => (
          <ListItem
            key={group.id}
            last={index === groups.length - 1}
            onSelect={() => void openDetail(group.id)}
            leading={<span className="grid size-10 shrink-0 place-items-center rounded-full bg-coral-wash text-coral-strong"><Bug aria-hidden="true" size={18} /></span>}
            title={<>#{group.id} · {group.title}</>}
            meta={<span className="flex flex-col gap-0.5">
              <span className="break-all">{group.route_path ?? 'Ruta desconocida'} · {sourceLabels[group.source] ?? group.source}</span>
              <span>Última vez {formatDateTime(group.last_seen_at)}{group.last_organization_name ? ` · ${group.last_organization_name}` : ''}</span>
            </span>}
            trailing={<span className="font-display text-[15px] font-bold tabular-nums text-ink">{loadingId === group.id ? '…' : `${group.occurrences}×`}</span>}
            badge={<Badge tone={statusTones[group.status]}>{statusLabels[group.status]}</Badge>}
          />
        )) : (
          <div className="p-6">
            <EmptyState icon={ShieldCheck} title={filter === 'open' ? 'Sin errores abiertos' : 'No hay errores aquí'} description="Cuando LensSpace falle, el error aparecerá en esta lista." />
          </div>
        )}
      </Card>

      <Dialog
        open={Boolean(detail)}
        onClose={() => { if (!pending) { setDetail(null); setError(null) } }}
        eyebrow={detail ? `Error #${detail.id} · ${sourceLabels[detail.source] ?? detail.source}` : undefined}
        title={detail?.title ?? ''}
        icon={Bug}
        size="lg"
        footer={detail ? <>
          {detail.status !== 'ignored' ? <Button variant="ghost" icon={EyeOff} disabled={pending} onClick={() => changeStatus('ignored')}>Ignorar</Button> : null}
          {detail.status === 'open'
            ? <Button icon={CheckCircle2} disabled={pending} onClick={() => changeStatus('resolved')}>Marcar resuelto</Button>
            : <Button variant="secondary" icon={RotateCcw} disabled={pending} onClick={() => changeStatus('open')}>Reabrir</Button>}
        </> : null}
      >
        {detail ? <ErrorDetailBody detail={detail} error={error} /> : null}
      </Dialog>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  )
}

function ErrorDetailBody({ detail, error }: { detail: ErrorGroupDetail; error: string | null }) {
  return (
    <div className="flex flex-col gap-4 text-sm text-text-secondary">
      {error ? <Alert tone="danger" role="alert">{error}</Alert> : null}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <Fact label="Estado" value={<Badge tone={statusTones[detail.status]}>{statusLabels[detail.status]}</Badge>} />
        <Fact label="Ruta" value={<span className="break-all">{detail.route_path ?? 'Desconocida'}</span>} />
        <Fact label="Veces" value={`${detail.occurrences}`} />
        <Fact label="Ópticas · usuarios" value={`${detail.organizations} · ${detail.users}`} />
        <Fact label="Primera vez" value={formatDateTime(detail.first_seen_at)} />
        <Fact label="Última vez" value={formatDateTime(detail.last_seen_at)} />
        {detail.resolved_at ? <Fact label="Resuelto" value={`${formatDateTime(detail.resolved_at)}${detail.resolved_by_name ? ` por ${detail.resolved_by_name}` : ''}`} /> : null}
      </dl>
      {detail.alert_list.length ? (
        <p>WhatsApp: {detail.alert_list.map((alert) => `${alert.reason === 'new' ? 'nuevo' : 'volvió'} ${formatDateTime(alert.created_at)} (${alertLabel(alert)})`).join(' · ')}</p>
      ) : null}
      <section className="flex flex-col gap-3">
        <h3 className="font-display text-[15px] font-bold text-ink">Últimas veces ({detail.occurrence_list.length})</h3>
        {detail.occurrence_list.map((occurrence) => (
          <details key={occurrence.id} className="rounded-control border border-line-soft bg-surface p-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-ink">
              {formatDateTime(occurrence.created_at)} · {occurrence.organization_name ?? 'Sin óptica'}{occurrence.user_name ? ` · ${occurrence.user_name}` : ''}
            </summary>
            <div className="mt-2 flex flex-col gap-2 text-[13px]">
              <p className="whitespace-pre-wrap break-words">{occurrence.message}</p>
              <p className="break-all text-text-muted">
                {[occurrence.context.path, occurrence.context.method, occurrence.context.release && `versión ${occurrence.context.release}`, occurrence.digest && `digest ${occurrence.digest}`].filter(Boolean).join(' · ')}
              </p>
              {occurrence.context.userAgent ? <p className="break-all text-text-muted">{occurrence.context.userAgent}</p> : null}
              {occurrence.stack ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-[8px] bg-neutral-soft p-2 text-[12px] leading-relaxed">{occurrence.stack}</pre> : null}
            </div>
          </details>
        ))}
      </section>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  )
}
