export type ErrorGroupStatus = 'open' | 'resolved' | 'ignored'

export type ErrorGroupSummary = {
  id: number
  source: string
  route_path: string | null
  title: string
  status: ErrorGroupStatus
  occurrences: number
  first_seen_at: string
  last_seen_at: string
  resolved_at: string | null
  last_organization_name: string | null
  organizations: number
  users: number
}

export type ErrorGroupList = {
  counts: Record<ErrorGroupStatus, number>
  groups: ErrorGroupSummary[]
}

export type ErrorOccurrence = {
  id: number
  created_at: string
  message: string
  digest: string | null
  stack: string | null
  context: Record<string, string>
  organization_name: string | null
  user_name: string | null
}

export type ErrorGroupDetail = ErrorGroupSummary & {
  resolved_by_name: string | null
  last_alerted_at: string | null
  occurrence_list: ErrorOccurrence[]
  alert_list: { id: number; reason: 'new' | 'regression'; status: string; failure_code: string | null; created_at: string }[]
}

export const sourceLabels: Record<string, string> = {
  server_render: 'Pantalla (servidor)',
  server_action: 'Acción (servidor)',
  route: 'Ruta (servidor)',
  proxy: 'Proxy (servidor)',
  server_handled: 'Fallo controlado (servidor)',
  client: 'Pantalla (navegador)',
  client_handled: 'Fallo controlado (navegador)',
}

export const statusLabels: Record<ErrorGroupStatus, string> = { open: 'Abierto', resolved: 'Resuelto', ignored: 'Ignorado' }
export const statusTones = { open: 'danger', resolved: 'success', ignored: 'neutral' } as const
