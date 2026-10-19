import { reportClientError } from '@/shared/lib/report-client-error'

// LEN0001: browser errors that no error boundary caught.
window.addEventListener('error', (event) => reportClientError('client', event.error ?? event.message))
window.addEventListener('unhandledrejection', (event) => reportClientError('client', event.reason))
