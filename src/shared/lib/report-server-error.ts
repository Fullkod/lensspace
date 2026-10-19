import type { ErrorReport } from './error-report'

const TIMEOUT_MS = 3_000

// Server only: records through record_server_error with the ingest secret, which can
// only write reports (never the service role). The secret has no NEXT_PUBLIC_
// prefix, so it is never bundled for the browser. Best effort: it never throws and
// never delays a request by more than a few seconds.
export async function recordServerError(report: ErrorReport & { userId?: string | null }) {
  const secret = process.env.ERROR_LOG_INGEST_SECRET
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (process.env.NODE_ENV !== 'production' || !secret || !url || !anonKey) return

  try {
    await fetch(`${url}/rest/v1/rpc/record_server_error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ ingest_secret: secret, report }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch {
    // Logging must never break the request that failed.
  }
}
