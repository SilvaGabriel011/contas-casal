import { describe, expect, it } from 'vitest'
import { derivePinPassword, isValidPin } from './pin'

describe('derivePinPassword', () => {
  it('is deterministic for the same email + PIN (case/space-insensitive email)', async () => {
    const a = await derivePinPassword('casal@example.com', '1234')
    const b = await derivePinPassword('  Casal@Example.com ', '1234')
    expect(a).toBe(b)
  })

  it('changes with the PIN and with the email', async () => {
    const base = await derivePinPassword('casal@example.com', '1234')
    expect(await derivePinPassword('casal@example.com', '1235')).not.toBe(base)
    expect(await derivePinPassword('outro@example.com', '1234')).not.toBe(base)
  })

  it('produces a long password that satisfies Supabase minimums', async () => {
    const p = await derivePinPassword('casal@example.com', '0000')
    expect(p.length).toBeGreaterThan(40)
    expect(p.startsWith('Cc1.')).toBe(true)
    expect(p).toMatch(/^[A-Za-z0-9._-]+$/)
  })
})

describe('isValidPin', () => {
  it('accepts exactly four digits', () => {
    expect(isValidPin('0412')).toBe(true)
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('12345')).toBe(false)
    expect(isValidPin('12a4')).toBe(false)
  })
})
