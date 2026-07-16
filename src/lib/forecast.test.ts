import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../types'
import { committedFlow, dailyAllowance } from './forecast'

const snapshot: Snapshot = {
  items: [
    {
      id: 'i1',
      kind: 'bill',
      name: 'Internet',
      category: 'internet',
      amount: 90,
      currency: 'AUD',
      owner: 'shared',
      frequency: 'monthly',
      startDate: '2026-07-20',
      installmentsTotal: null,
      notes: null,
      archived: false,
      createdAt: 'x',
    },
  ],
  incomes: [
    {
      id: 'n1',
      name: 'Job',
      owner: 'a',
      amount: 1000,
      currency: 'AUD',
      frequency: 'monthly',
      nextDate: '2026-07-25',
      active: true,
      hourlyRate: null,
      hoursPerDay: null,
      daysPerWeek: null,
      createdAt: 'x',
    },
  ],
  payments: [],
  expenses: [
    {
      id: 'e1',
      date: '2026-07-05',
      amount: 110,
      currency: 'AUD',
      category: 'food',
      owner: 'shared',
      paidBy: null,
      note: null,
      createdAt: 'x',
    },
  ],
  transfers: [],
  settings: { nameA: 'G', nameB: 'I', customCategories: [] },
}

describe('committedFlow', () => {
  it('accumulates bills down and paydays up through month end', () => {
    const flow = committedFlow(snapshot, '2026-07-15', 'AUD')
    expect(flow).toHaveLength(17) // 15..31 inclusive
    expect(flow[0]).toEqual({ date: '2026-07-15', net: 0, cum: 0 })
    const day20 = flow.find((f) => f.date === '2026-07-20')!
    expect(day20.net).toBe(-90)
    expect(day20.cum).toBe(-90)
    const day25 = flow.find((f) => f.date === '2026-07-25')!
    expect(day25.cum).toBe(910)
    expect(flow[flow.length - 1].cum).toBe(910)
  })

  it('ignores paid occurrences', () => {
    const paid: Snapshot = {
      ...snapshot,
      payments: [{ id: 'p1', itemId: 'i1', dueDate: '2026-07-20', paidAt: 'x', amount: 90, paidBy: null }],
    }
    const flow = committedFlow(paid, '2026-07-15', 'AUD')
    expect(flow.find((f) => f.date === '2026-07-20')!.net).toBe(0)
  })
})

describe('dailyAllowance', () => {
  it('spreads the leftover over the remaining days', () => {
    const a = dailyAllowance(snapshot, '2026-07-15', 'AUD')!
    // income 1000 - bills 90 - spent 110 = 800 leftover, 17 days left
    expect(a.leftover).toBe(800)
    expect(a.daysLeft).toBe(17)
    expect(a.perDay).toBeCloseTo(800 / 17)
  })

  it('returns null for a currency with no activity', () => {
    expect(dailyAllowance(snapshot, '2026-07-15', 'BRL')).toBeNull()
  })
})
