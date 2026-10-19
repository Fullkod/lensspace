import { connectivityPattern } from './error-report'
import { reportClientError } from './report-client-error'

type AppError = { code?: string; message?: string } | null | undefined

// supabase-js reports a dropped connection as an error without a Postgres code.
export function isNetworkError(error: AppError) {
  return Boolean(error) && !error?.code && connectivityPattern.test(error?.message ?? '')
}

// Our RPCs raise Spanish messages meant for users; Postgres/PostgREST internals are
// English and technical, so those are replaced by Spanish copy.
const permissionPattern = /row-level security|permission denied|not authorized|jwt/i
const technicalPattern = /violates|invalid input|duplicate key|null value|does not exist|syntax|failed to|unexpected|could not|schema cache/i

export const offlineMessage = 'Sin conexión: no pudimos completar la acción. Revisa la señal e inténtalo de nuevo.'

export function friendlyError(error: AppError, fallback = 'No pudimos completar la acción. Inténtalo nuevamente.') {
  if (!error) return fallback
  if (isNetworkError(error)) return offlineMessage
  const message = error.message?.trim() ?? ''
  if (permissionPattern.test(message)) return 'No tienes permiso para esta acción o la organización está en solo lectura.'
  if (!message || technicalPattern.test(message)) {
    // LEN0001: the user sees the fallback; the platform admin gets the real error.
    reportClientError('client_handled', error)
    return fallback
  }
  return message
}
