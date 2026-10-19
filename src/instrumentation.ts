import type { Instrumentation } from 'next'

import { describeError, isIgnorableError, type ErrorSource } from '@/shared/lib/error-report'
import { recordServerError } from '@/shared/lib/report-server-error'

const SOURCE_BY_ROUTE_TYPE: Record<string, ErrorSource> = {
  render: 'server_render',
  action: 'server_action',
  route: 'route',
  proxy: 'proxy',
}
const USER_LOOKUP_TIMEOUT_MS = 1_500

// Best effort: the user comes from the session cookie, verified locally (getClaims);
// an expired or missing session just leaves the report without a user.
async function userIdFrom(cookieHeader: string | string[] | undefined) {
  const header = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader
  if (!header) return null
  try {
    const { createServerClient, parseCookieHeader } = await import('@supabase/ssr')
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: { getAll: () => parseCookieHeader(header).map(({ name, value }) => ({ name, value: value ?? '' })), setAll: () => undefined },
    })
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), USER_LOOKUP_TIMEOUT_MS))
    const claims = await Promise.race([supabase.auth.getClaims().then(({ data }) => data?.claims ?? null), timeout])
    return typeof claims?.sub === 'string' ? claims.sub : null
  } catch {
    return null
  }
}

// LEN0001: every unexpected server error (render, action, route handler, proxy) goes
// to the platform error log. Only metadata is sent: never headers, cookies or bodies.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  try {
    const described = describeError(error)
    if (isIgnorableError(described)) return
    await recordServerError({
      source: SOURCE_BY_ROUTE_TYPE[context.routeType] ?? 'server_render',
      message: described.message,
      stack: described.stack,
      digest: described.digest,
      route: context.routePath,
      userId: await userIdFrom(request.headers.cookie),
      context: {
        path: request.path,
        method: request.method,
        routeType: context.routeType,
        renderSource: 'renderSource' in context ? String(context.renderSource) : undefined,
        release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
      },
    })
  } catch {
    // Never let the error log turn one failure into two.
  }
}
