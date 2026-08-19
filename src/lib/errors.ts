import type { TKey } from './i18n'

// On-device error bank: a ring buffer of the last N errors, viewable and
// copyable from Settings so problems can be reported without devtools.
export interface ErrorEntry {
  ts: string
  context: string
  message: string
}

const KEY = 'cc.errlog.v1'
const MAX_ENTRIES = 50

export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: string; code?: string }
    if (e.message || e.code) return [e.code, e.message].filter(Boolean).join(' ')
    try {
      return JSON.stringify(error).slice(0, 200)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

// Optional remote sink: when cloud mode is up, the DataProvider registers a
// writer here so every logged error also lands in the shared client_errors
// table — one phone can then see the other's errors in the diagnostics.
// Fire-and-forget; a failing sink must never log again (loop guard).
type RemoteSink = (entry: ErrorEntry) => Promise<void>
let remoteSink: RemoteSink | null = null
export function setRemoteErrorSink(sink: RemoteSink | null): void {
  remoteSink = sink
}

export function logError(context: string, error: unknown): void {
  console.error(`[${context}]`, error)
  const entry: ErrorEntry = {
    ts: new Date().toISOString(),
    context,
    message: describeError(error).slice(0, 300),
  }
  try {
    const list = getErrorLog()
    list.unshift(entry)
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)))
  } catch {
    /* storage unavailable — console already has it */
  }
  remoteSink?.(entry).catch(() => {
    /* remote capture is best-effort */
  })
}

export function getErrorLog(): ErrorEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function clearErrorLog(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function errorReport(): string {
  const lines = getErrorLog().map((e) => `${e.ts} [${e.context}] ${e.message}`)
  return [
    `Contas do Casal — error report`,
    `v${__APP_VERSION__} (${__BUILD_SHA__})`,
    navigator.userAgent,
    '',
    ...lines,
  ].join('\n')
}

let installed = false
export function installGlobalErrorLogging(): void {
  if (installed) return
  installed = true
  window.addEventListener('error', (e) => logError('window', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => logError('promise', e.reason))
}

// Known auth/network failures mapped to translated, actionable copy.
// Anything unmapped falls back to authErrorGeneric with the raw message.
const AUTH_MAP: [RegExp, TKey][] = [
  [/invalid login credentials/i, 'errInvalidCredentials'],
  [/email not confirmed/i, 'errEmailNotConfirmed'],
  [/already (been )?registered/i, 'errUserExists'],
  [/rate limit|too many requests|request this after/i, 'errRateLimit'],
  [/password should be/i, 'errWeakPassword'],
  [/signups? (are )?not allowed|signup.*disabled/i, 'errSignupsDisabled'],
  [/failed to fetch|networkerror|load failed|fetch failed|timeout/i, 'errNetwork'],
  [/invalid email|unable to validate email/i, 'errInvalidEmail'],
]

export function authErrorKey(raw: string): TKey | null {
  for (const [re, key] of AUTH_MAP) if (re.test(raw)) return key
  return null
}

// Classifies a failed SAVE so the banner can say what actually happened
// instead of blaming the connection: a check-constraint/enum rejection means
// the database schema is older than the app (re-run schema.sql), a network
// pattern means connectivity, anything else falls back to the generic copy.
export function saveHintKey(detail: string): TKey | null {
  if (/23514|check constraint|invalid input value|violates/i.test(detail)) return 'errSchemaOutdated'
  if (/failed to fetch|networkerror|load failed|fetch failed|timeout|abort/i.test(detail)) return 'errNetwork'
  return null
}
