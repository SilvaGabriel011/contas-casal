import { beforeEach, describe, expect, it, vi } from 'vitest'

// Minimal localStorage for the node test environment.
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})
vi.stubGlobal('navigator', { userAgent: 'test' })

const { authErrorKey, logError, getErrorLog, clearErrorLog } = await import('./errors')

describe('authErrorKey', () => {
  it('maps the common Supabase auth failures', () => {
    expect(authErrorKey('Invalid login credentials')).toBe('errInvalidCredentials')
    expect(authErrorKey('Email not confirmed')).toBe('errEmailNotConfirmed')
    expect(authErrorKey('User already registered')).toBe('errUserExists')
    expect(authErrorKey('For security purposes, you can only request this after 12 seconds.')).toBe(
      'errRateLimit'
    )
    expect(authErrorKey('Signups not allowed for this instance')).toBe('errSignupsDisabled')
    expect(authErrorKey('TypeError: Failed to fetch')).toBe('errNetwork')
    expect(authErrorKey('something exotic')).toBeNull()
  })
})

describe('error log ring buffer', () => {
  beforeEach(() => {
    store.clear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('stores newest first and caps at 50 entries', () => {
    for (let i = 0; i < 60; i++) logError('test', new Error(`e${i}`))
    const log = getErrorLog()
    expect(log).toHaveLength(50)
    expect(log[0].message).toContain('e59')
    expect(log[0].context).toBe('test')
  })

  it('describes non-Error objects and clears', () => {
    logError('supabase', { code: '42P01', message: 'relation does not exist' })
    expect(getErrorLog()[0].message).toContain('42P01')
    clearErrorLog()
    expect(getErrorLog()).toHaveLength(0)
  })
})
