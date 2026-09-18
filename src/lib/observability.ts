type OperationalScope =
  | 'react-boundary'
  | 'window-error'
  | 'unhandled-rejection'
  | 'query'
  | 'mutation'
  | 'edge-function'
  | 'storage'
  | 'database-mutation'

type OperationalContext = Record<string, string | number | boolean | null | undefined>

const SENSITIVE_KEY = /authorization|cookie|password|secret|token|email|phone|address|nik|qr|link|url/i
const CONNECTIVITY_PATTERN = /fetch failed|failed to fetch|network|load failed|timeout|timed out|connection|offline/i

function sanitizeMessage(value: string) {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]{10,}){1,2}\b/g, '[token]')
    .slice(0, 320)
}

function errorMetadata(error: unknown) {
  if (error instanceof Error) {
    const candidate = error as Error & { code?: unknown; status?: unknown }
    return {
      name: error.name || 'Error',
      message: sanitizeMessage(error.message || 'Unknown error'),
      code: typeof candidate.code === 'string' ? candidate.code.slice(0, 64) : undefined,
      status: typeof candidate.status === 'number' ? candidate.status : undefined,
    }
  }

  if (typeof error === 'object' && error) {
    const candidate = error as { name?: unknown; message?: unknown; code?: unknown; status?: unknown }
    return {
      name: typeof candidate.name === 'string' ? candidate.name.slice(0, 64) : 'Error',
      message: sanitizeMessage(typeof candidate.message === 'string' ? candidate.message : 'Unknown error'),
      code: typeof candidate.code === 'string' ? candidate.code.slice(0, 64) : undefined,
      status: typeof candidate.status === 'number' ? candidate.status : undefined,
    }
  }

  return { name: 'Error', message: sanitizeMessage(String(error ?? 'Unknown error')) }
}

function safeContext(context: OperationalContext) {
  return Object.fromEntries(
    Object.entries(context)
      .filter(([key, value]) => !SENSITIVE_KEY.test(key) && value !== undefined)
      .map(([key, value]) => [
        key.slice(0, 64),
        typeof value === 'string' ? sanitizeMessage(value).slice(0, 96) : value,
      ]),
  )
}

function eventId() {
  return globalThis.crypto?.randomUUID?.() ?? `evt-${Date.now().toString(36)}`
}

export function isConnectivityFailure(error: unknown) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '')
  return CONNECTIVITY_PATTERN.test(message)
}

export function responseStatus(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const candidate = error as { status?: unknown; context?: unknown }
  if (typeof candidate.status === 'number') return candidate.status
  if (typeof Response !== 'undefined' && candidate.context instanceof Response) return candidate.context.status
  return null
}

export function reportOperationalError(scope: OperationalScope, error: unknown, context: OperationalContext = {}) {
  const id = eventId()
  const payload = {
    type: 'ra_nf_operational_error',
    event_id: id,
    occurred_at: new Date().toISOString(),
    scope,
    online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
    error: errorMetadata(error),
    context: safeContext(context),
  }
  console.error('[RA-NF observability]', payload)
  return id
}

export function installGlobalErrorObservers() {
  if (typeof window === 'undefined') return () => {}

  const onWindowError = (event: ErrorEvent) => {
    reportOperationalError('window-error', event.error ?? event.message, {
      source: event.error ? 'runtime' : 'resource',
    })
  }
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    reportOperationalError('unhandled-rejection', event.reason)
  }

  window.addEventListener('error', onWindowError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  return () => {
    window.removeEventListener('error', onWindowError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}
