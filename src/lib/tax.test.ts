import { describe, expect, it } from 'vitest'
import type { Expense } from '../types'
import { deductibleExpenses, fyEndYear, fyLabel, fyRange, isDeductible, taxCsv } from './tax'

const exp = (over: Partial<Expense>): Expense => ({
  id: 'x',
  date: '2026-07-10',
  amount: 50,
  currency: 'AUD',
  category: 'other',
  owner: 'shared',
  paidBy: null,
  note: null,
  createdAt: '2026-07-10T00:00:00Z',
  ...over,
})

describe('financial year', () => {
  it('rolls over on 1 July', () => {
    expect(fyEndYear('2026-06-30')).toBe(2026)
    expect(fyEndYear('2026-07-01')).toBe(2027)
  })

  it('builds ranges and labels', () => {
    expect(fyRange(2026)).toEqual({ from: '2025-07-01', to: '2026-06-30' })
    expect(fyLabel(2026)).toBe('2025–26')
  })
})

describe('deductible detection', () => {
  it('matches by category or #tax note tag', () => {
    expect(isDeductible(exp({ category: 'education' }), ['education'])).toBe(true)
    expect(isDeductible(exp({ note: 'monitor novo #tax' }), [])).toBe(true)
    expect(isDeductible(exp({ note: 'mercado' }), ['education'])).toBe(false)
  })

  it('filters by financial year window', () => {
    const list = [
      exp({ id: 'a', date: '2026-06-30', category: 'education' }),
      exp({ id: 'b', date: '2026-07-01', category: 'education' }),
    ]
    expect(deductibleExpenses(list, 2026, ['education']).map((e) => e.id)).toEqual(['a'])
    expect(deductibleExpenses(list, 2027, ['education']).map((e) => e.id)).toEqual(['b'])
  })
})

describe('taxCsv', () => {
  it('escapes quotes and formats amounts', () => {
    const csv = taxCsv([exp({ note: 'cabo "usb"', amount: 12.5 })], () => 'Other')
    expect(csv.split('\n')[1]).toBe('2026-07-10,"cabo ""usb""","Other",12.50,AUD')
  })
})
