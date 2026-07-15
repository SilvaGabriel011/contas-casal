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

function describe(error: unknown): string {
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

export function logError(context: string, error: unknown): void {
  console.error(`[${context}]`, error)
  try {
    const list = getErrorLog()
    list.unshift({ ts: new Date().toISOString(), context, message: describe(error).slice(0, 300) })
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)))
  } catch {
    /* storage unavailable — console already has it */
  }
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
  return [`Contas do Casal — error report`, navigator.userAgent, '', ...lines].join('\n')
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
