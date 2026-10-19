import { connectivityPattern, describeError, isIgnorableError, type ErrorSource } from './error-report'

const REPEAT_WINDOW_MS = 60_000
const lastSent = new Map<string, number>()

// Browser only, signed-in users only (the RPC also limits each user to 20 reports
// every 10 minutes). Fire and forget: a failed report is dropped, never reported
// again, so it cannot loop. The Supabase client is loaded only when something has
// to be reported, so public pages do not pay for it.
export function reportClientError(source: Extract<ErrorSource, 'client' | 'client_handled'>, error: unknown) {
  if (process.env.NODE_ENV !== 'production' || typeof window === 'undefined') return
  try {
    if (!navigator.onLine) return
    const described = describeError(error)
    if (isIgnorableError(described) || connectivityPattern.test(described.message)) return

    const key = `${source}|${described.message}`
    const now = Date.now()
    if (now - (lastSent.get(key) ?? 0) < REPEAT_WINDOW_MS) return
    lastSent.set(key, now)

    // Handled errors carry no stack: keep the call site instead.
    const stack = described.stack ?? new Error(described.message).stack?.slice(0, 4000)
    const path = window.location.pathname
    const report = { source, message: described.message, stack, digest: described.digest, route: path, context: { path, userAgent: navigator.userAgent } }

    void import('@/lib/supabase/client')
      .then(async ({ createClient }) => {
        const supabase = createClient()
        const { data } = await supabase.auth.getSession()
        if (data.session) await supabase.rpc('report_client_error', { report } as never)
      })
      .catch(() => undefined)
  } catch {
    // Reporting must never break the screen.
  }
}
