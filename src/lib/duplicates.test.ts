import { describe, expect, it } from 'vitest'
import type { Expense, Income, Item, Snapshot } from '../types'
import type { DupCandidate } from './duplicates'
import { findDuplicate, findDuplicates, normalizeName } from './duplicates'

const expense = (over: Partial<Expense>): Expense => ({
  id: 'e1',
  date: '2026-07-10',
  amount: 42.8,
  currency: 'AUD',
  category: 'food',
  owner: 'shared',
  paidBy: null,
  note: null,
  createdAt: '2026-07-10',
  ...over,
})

const item = (over: Partial<Item>): Item => ({
  id: 'i1',
  kind: 'subscription',
  name: 'Netflix',
  category: 'streaming',
  amount: 55.9,
  currency: 'BRL',
  owner: 'shared',
  frequency: 'monthly',
  startDate: '2026-01-05',
  installmentsTotal: null,
  notes: null,
  archived: false,
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
})

const income = (over: Partial<Income>): Income => ({
  id: 'n1',
  name: 'Salary',
  owner: 'a',
  amount: 2400,
  currency: 'AUD',
  frequency: 'fortnightly',
  nextDate: '2026-07-15',
  active: true,
  hourlyRate: null,
  hoursPerDay: null,
  daysPerWeek: null,
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
})

const emptySnap = (): Pick<Snapshot, 'expenses' | 'items' | 'incomes'> => ({
  expenses: [],
  items: [],
  incomes: [],
})

const cand = (over: Partial<DupCandidate>): DupCandidate => ({
  type: 'expense',
  name: '',
  amount: 42.8,
  currency: 'AUD',
  owner: 'shared',
  date: '2026-07-10',
  frequency: 'monthly',
  ...over,
})

describe('normalizeName', () => {
  it('lowercases, trims, collapses spaces and strips accents', () => {
    expect(normalizeName('  NETFLIX  ')).toBe('netflix')
    expect(normalizeName('Condomínio')).toBe('condominio')
    expect(normalizeName('São   Paulo')).toBe('sao paulo')
  })
})

describe('findDuplicate — expense', () => {
  it('matches on amount within tolerance and a 2-day window', () => {
    const snap = { ...emptySnap(), expenses: [expense({ amount: 42.81, date: '2026-07-12' })] }
    expect(findDuplicate(cand({ type: 'expense' }), snap)?.source).toBe('expense')
  })

  it('does not match outside the 2-day window', () => {
    const snap = { ...emptySnap(), expenses: [expense({ date: '2026-07-13' })] }
    expect(findDuplicate(cand({ type: 'expense', date: '2026-07-10' }), snap)).toBeNull()
  })

  it('does not match across currencies', () => {
    const snap = { ...emptySnap(), expenses: [expense({ currency: 'BRL' })] }
    expect(findDuplicate(cand({ type: 'expense', currency: 'AUD' }), snap)).toBeNull()
  })
})

describe('findDuplicate — recurring item', () => {
  it('matches by normalized name and amount, ignoring date and kind', () => {
    const snap = {
      ...emptySnap(),
      items: [item({ kind: 'subscription', name: 'netflix', startDate: '2026-01-05' })],
    }
    const c = cand({
      type: 'bill',
      name: 'NETFLIX ',
      amount: 55.9,
      currency: 'BRL',
      date: '2026-08-05',
    })
    expect(findDuplicate(c, snap)?.source).toBe('item')
  })

  it('does not match when names differ', () => {
    const snap = { ...emptySnap(), items: [item({ name: 'Spotify' })] }
    const c = cand({ type: 'subscription', name: 'Netflix', amount: 55.9, currency: 'BRL' })
    expect(findDuplicate(c, snap)).toBeNull()
  })

  it('does not match archived items', () => {
    const snap = { ...emptySnap(), items: [item({ name: 'Netflix', archived: true })] }
    const c = cand({ type: 'subscription', name: 'Netflix', amount: 55.9, currency: 'BRL' })
    expect(findDuplicate(c, snap)).toBeNull()
  })
})

describe('findDuplicate — purchase / once', () => {
  it('matches within the 2-day window ignoring names', () => {
    const snap = {
      ...emptySnap(),
      items: [item({ kind: 'purchase', name: 'Shoes', frequency: 'once', currency: 'AUD', amount: 120, startDate: '2026-07-10' })],
    }
    const c = cand({ type: 'purchase', name: 'Sneakers', amount: 120, currency: 'AUD', date: '2026-07-11', frequency: 'once' })
    expect(findDuplicate(c, snap)?.source).toBe('item')
  })

  it('does not match outside the window', () => {
    const snap = {
      ...emptySnap(),
      items: [item({ kind: 'purchase', frequency: 'once', currency: 'AUD', amount: 120, startDate: '2026-07-10' })],
    }
    const c = cand({ type: 'purchase', amount: 120, currency: 'AUD', date: '2026-07-20', frequency: 'once' })
    expect(findDuplicate(c, snap)).toBeNull()
  })
})

describe('findDuplicate — income', () => {
  it('matches on amount, owner and frequency', () => {
    const snap = { ...emptySnap(), incomes: [income({ owner: 'a', frequency: 'fortnightly', amount: 2400 })] }
    const c = cand({ type: 'income', owner: 'a', frequency: 'fortnightly', amount: 2400, currency: 'AUD' })
    expect(findDuplicate(c, snap)?.source).toBe('income')
  })

  it('does not match when owner differs', () => {
    const snap = { ...emptySnap(), incomes: [income({ owner: 'b' })] }
    const c = cand({ type: 'income', owner: 'a', frequency: 'fortnightly', amount: 2400, currency: 'AUD' })
    expect(findDuplicate(c, snap)).toBeNull()
  })

  it('does not match when frequency differs', () => {
    const snap = { ...emptySnap(), incomes: [income({ frequency: 'monthly' })] }
    const c = cand({ type: 'income', owner: 'a', frequency: 'fortnightly', amount: 2400, currency: 'AUD' })
    expect(findDuplicate(c, snap)).toBeNull()
  })
})

describe('findDuplicates', () => {
  it('returns a parallel array of matches', () => {
    const snap = { ...emptySnap(), expenses: [expense({ amount: 42.8, date: '2026-07-10' })] }
    const res = findDuplicates(
      [cand({ type: 'expense', amount: 42.8 }), cand({ type: 'expense', amount: 999 })],
      snap
    )
    expect(res).toHaveLength(2)
    expect(res[0]?.source).toBe('expense')
    expect(res[1]).toBeNull()
  })

  it('returns all null against an empty snapshot', () => {
    const res = findDuplicates([cand({}), cand({ type: 'income' })], emptySnap())
    expect(res).toEqual([null, null])
  })
})
