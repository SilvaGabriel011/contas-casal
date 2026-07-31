import { describe, expect, it } from 'vitest'
import type { Expense, Item } from '../types'
import { findSimilarExpense, findSimilarIncome, findSimilarItem } from './dupes'

const item = (name: string, over: Partial<Item> = {}): Item => ({
  id: crypto.randomUUID(),
  kind: 'bill',
  name,
  category: 'rent',
  amount: 800,
  currency: 'AUD',
  owner: 'shared',
  frequency: 'monthly',
  startDate: '2026-07-01',
  installmentsTotal: null,
  notes: null,
  archived: false,
  createdAt: 'x',
  ...over,
})

describe('findSimilarItem', () => {
  it('matches ignoring case and accents', () => {
    expect(findSimilarItem([item('Aluguel')], 'aluguél', 'AUD')).not.toBeNull()
  })

  it('matches substrings when long enough', () => {
    expect(findSimilarItem([item('Internet Aussie BB')], 'internet', 'AUD')).not.toBeNull()
    expect(findSimilarItem([item('Luz')], 'lu', 'AUD')).toBeNull()
  })

  it('respects currency and archived', () => {
    expect(findSimilarItem([item('Aluguel', { currency: 'BRL' })], 'Aluguel', 'AUD')).toBeNull()
    expect(findSimilarItem([item('Aluguel', { archived: true })], 'Aluguel', 'AUD')).toBeNull()
  })
})

describe('findSimilarIncome', () => {
  const income = {
    id: 'n1',
    name: 'Salário Gabriel',
    owner: 'a' as const,
    amount: 2400,
    currency: 'AUD' as const,
    frequency: 'monthly' as const,
    nextDate: '2026-07-23',
    active: true,
    hourlyRate: null,
    hoursPerDay: null,
    daysPerWeek: null,
    createdAt: 'x',
  }
  it('matches by normalized name, active only', () => {
    expect(findSimilarIncome([income], 'salario gabriel')).not.toBeNull()
    expect(findSimilarIncome([{ ...income, active: false }], 'salario gabriel')).toBeNull()
  })
})

describe('findSimilarExpense', () => {
  const exp: Expense = {
    id: 'e1',
    date: '2026-07-14',
    amount: 42.5,
    currency: 'AUD',
    category: 'food',
    owner: 'shared',
    paidBy: null,
    note: null,
    createdAt: 'x',
  }
  it('matches same amount within a day', () => {
    expect(findSimilarExpense([exp], 42.5, 'AUD', '2026-07-15')).not.toBeNull()
    expect(findSimilarExpense([exp], 42.5, 'AUD', '2026-07-16')).toBeNull()
    expect(findSimilarExpense([exp], 42.51, 'AUD', '2026-07-14')).toBeNull()
  })
})
