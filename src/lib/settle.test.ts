import { describe, expect, it } from 'vitest'
import type { Expense, Item, Payment, Snapshot } from '../types'
import { DEFAULT_SETTINGS } from '../data/adapter'
import { settleMonth } from './settle'

const item = (id: string, owner: Item['owner'], currency: Item['currency'] = 'AUD'): Item => ({
  id,
  kind: 'bill',
  name: id,
  category: 'other',
  amount: 100,
  currency,
  owner,
  frequency: 'monthly',
  startDate: '2026-07-01',
  installmentsTotal: null,
  notes: null,
  archived: false,
  createdAt: '',
})

const pay = (itemId: string, paidBy: 'a' | 'b' | null, amount = 100, dueDate = '2026-07-10'): Payment => ({
  id: `${itemId}-${dueDate}`,
  itemId,
  dueDate,
  paidAt: '2026-07-10T00:00:00Z',
  amount,
  paidBy,
})

const expense = (
  owner: Expense['owner'],
  paidBy: 'a' | 'b' | null,
  amount: number,
  date = '2026-07-05'
): Expense => ({
  id: `${owner}-${paidBy}-${amount}-${date}`,
  date,
  amount,
  currency: 'AUD',
  category: 'groceries',
  owner,
  paidBy,
  note: null,
  createdAt: '',
})

const snap = (items: Item[], payments: Payment[], expenses: Expense[]): Snapshot => ({
  items,
  incomes: [],
  payments,
  expenses,
  transfers: [],
  settings: DEFAULT_SETTINGS,
})

describe('settleMonth', () => {
  it('splits shared costs in half and charges personal costs in full', () => {
    const s = snap(
      [item('rent', 'shared'), item('gymB', 'b')],
      [pay('rent', 'a', 200), pay('gymB', 'a', 50)],
      []
    )
    // A paid shared rent 200 → B owes 100; A paid B's gym 50 → B owes 50
    expect(settleMonth(s, '2026-07').net.AUD).toBe(150)
  })

  it('nets payments in both directions and ignores own-paid-own', () => {
    const s = snap(
      [item('rent', 'shared'), item('foneA', 'a')],
      [pay('rent', 'b', 200), pay('foneA', 'a', 80)],
      [expense('shared', 'a', 60)]
    )
    // B paid shared 200 → A owes 100 (−100); A paid own phone → 0; A paid shared 60 → +30
    expect(settleMonth(s, '2026-07').net.AUD).toBe(-70)
  })

  it('keeps currencies separate and skips unknown payers and other months', () => {
    const s = snap(
      [item('rent', 'shared'), item('netflix', 'shared', 'BRL')],
      [pay('rent', null, 200), pay('netflix', 'a', 55.9)],
      [expense('shared', 'a', 40, '2026-06-30')]
    )
    const { net, entries } = settleMonth(s, '2026-07')
    expect(net.AUD).toBeUndefined()
    expect(net.BRL).toBeCloseTo(27.95)
    expect(entries).toHaveLength(1)
  })
})
