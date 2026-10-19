// Shared shape of the error log reports (LEN0001). The database redacts and
// truncates again; these limits only keep the requests small.
export type ErrorSource = 'server_render' | 'server_action' | 'route' | 'proxy' | 'server_handled' | 'client' | 'client_handled'

export type ErrorReport = {
  source: ErrorSource
  message: string
  stack?: string
  digest?: string
  route?: string
  context?: { path?: string; method?: string; routeType?: string; renderSource?: string; userAgent?: string; release?: string }
}

// supabase-js reports a dropped connection as an error without a Postgres code.
export const connectivityPattern = /fetch|network|load failed|aborted|timeout|timed out/i

// Navigation control flow, deploy chunk skew, browser extensions and opaque
// cross-origin scripts are not bugs we can fix.
const ignoredMessagePattern = /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING|^Script error\.?$|ResizeObserver loop|Loading chunk|dynamically imported module|AbortError/i
const ignoredStackPattern = /(chrome|moz|safari)-extension:\/\//

export function describeError(error: unknown) {
  if (error instanceof Error) {
    const digest = 'digest' in error && typeof error.digest === 'string' ? error.digest : undefined
    return { message: error.message.slice(0, 1000), stack: error.stack?.slice(0, 4000), digest }
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return { message: error.message.slice(0, 1000), stack: undefined, digest: undefined }
  }
  return { message: String(error ?? '').slice(0, 1000), stack: undefined, digest: undefined }
}

export function isIgnorableError({ message, stack, digest }: { message: string; stack?: string; digest?: string }) {
  return !message.trim()
    || ignoredMessagePattern.test(message)
    || ignoredMessagePattern.test(digest ?? '')
    || ignoredStackPattern.test(stack ?? '')
}
