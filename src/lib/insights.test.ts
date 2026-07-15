import { describe, expect, it } from 'vitest'
import type { Expense, Snapshot } from '../types'
import { budgetAlerts, categoryAlerts, coupleBalance } from './insights'

const exp = (over: Partial<Expense>): Expense => ({
  id: crypto.randomUUID(),
  date: '2026-07-10',
  amount: 50,
  currency: 'AUD',
  category: 'food',
  owner: 'shared',
  paidBy: null,
  note: null,
  createdAt: '2026-07-10T00:00:00Z',
  ...over,
})

describe('categoryAlerts', () => {
  it('flags a category well above its 3-month average', () => {
    const expenses = [
      exp({ date: '2026-04-10', amount: 100 }),
      exp({ date: '2026-05-10', amount: 100 }),
      exp({ date: '2026-06-10', amount: 100 }),
      exp({ date: '2026-07-05', amount: 200 }),
    ]
    const alerts = categoryAlerts(expenses, '2026-07')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].category).toBe('food')
    expect(alerts[0].typical).toBe(100)
    expect(alerts[0].pct).toBe(100)
  })

  it('stays quiet when spending is normal or history is missing', () => {
    const normal = [
      exp({ date: '2026-06-10', amount: 100 }),
      exp({ date: '2026-05-10', amount: 100 }),
      exp({ date: '2026-04-10', amount: 100 }),
      exp({ date: '2026-07-05', amount: 110 }),
    ]
    expect(categoryAlerts(normal, '2026-07')).toHaveLength(0)
    // no history at all -> typical 0 -> below MIN_TYPICAL, no alert
    expect(categoryAlerts([exp({ date: '2026-07-05', amount: 500 })], '2026-07')).toHaveLength(0)
  })

  it('keeps currencies separate', () => {
    const expenses = [
      exp({ date: '2026-06-10', amount: 100, currency: 'BRL' }),
      exp({ date: '2026-05-10', amount: 100, currency: 'BRL' }),
      exp({ date: '2026-04-10', amount: 100, currency: 'BRL' }),
      exp({ date: '2026-07-05', amount: 400, currency: 'AUD' }),
    ]
    // the AUD spike has no AUD history, the BRL history has no BRL spike
    expect(categoryAlerts(expenses, '2026-07')).toHaveLength(0)
  })
})

describe('budgetAlerts', () => {
  it('flags only categories over their budget in the right currency', () => {
    const expenses = [
      exp({ date: '2026-07-05', amount: 120, category: 'food' }),
      exp({ date: '2026-07-06', amount: 40, category: 'transport' }),
      exp({ date: '2026-07-07', amount: 500, category: 'food', currency: 'BRL' }),
    ]
    const alerts = budgetAlerts(expenses, '2026-07', {
      food: { amount: 100, currency: 'AUD' },
      transport: { amount: 100, currency: 'AUD' },
    })
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ category: 'food', spent: 120, budget: 100 })
  })
})

describe('coupleBalance', () => {
  const snapshot: Snapshot = {
    items: [
      {
        id: 'i1',
        kind: 'bill',
        name: 'Rent',
        category: 'rent',
        amount: 800,
        currency: 'AUD',
        owner: 'shared',
        frequency: 'monthly',
        startDate: '2026-01-01',
        installmentsTotal: null,
        notes: null,
        archived: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    incomes: [
      {
        id: 'n1',
        name: 'Job A',
        owner: 'a',
        amount: 1000,
        currency: 'AUD',
        frequency: 'monthly',
        nextDate: '2026-07-15',
        active: true,
        hourlyRate: null,
        hoursPerDay: null,
        daysPerWeek: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'n2',
        name: 'Job B',
        owner: 'b',
        amount: 500,
        currency: 'AUD',
        frequency: 'weekly',
        nextDate: '2026-07-03',
        active: true,
        hourlyRate: null,
        hoursPerDay: null,
        daysPerWeek: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    payments: [
      { id: 'p1', itemId: 'i1', dueDate: '2026-07-01', paidAt: '2026-07-01T00:00:00Z', amount: 800, paidBy: 'b' },
    ],
    expenses: [
      exp({ date: '2026-07-05', amount: 100, paidBy: 'a' }),
      exp({ date: '2026-07-06', amount: 60, paidBy: null, owner: 'shared' }),
    ],
    transfers: [],
    settings: { nameA: 'G', nameB: 'I', customCategories: [] },
  }

  it('attributes income by monthly equivalent and spending by who paid', () => {
    const b = coupleBalance(snapshot, '2026-07')
    expect(b.income.a.AUD).toBe(1000)
    expect(b.income.b.AUD).toBeCloseTo((500 * 52) / 12)
    // a paid 100 + half of the unattributed 60
    expect(b.spending.a.AUD).toBe(130)
    // b paid the 800 rent + the other half
    expect(b.spending.b.AUD).toBe(830)
  })
})
