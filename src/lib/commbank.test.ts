import { describe, expect, it } from 'vitest'
import type { Expense, Item, Occurrence } from '../types'
import { cleanDescription, guessCategory, parseCommBankCsv, reconcile } from './commbank'

describe('parseCommBankCsv', () => {
  it('parses the headerless CommBank format', () => {
    const csv = [
      '"14/07/2026","-12.50","PURCHASE AT COFFEE HOUSE SYDNEY","+1,234.56"',
      '"15/07/2026","+2400.00","SALARY ACME PTY LTD","+3,634.56"',
    ].join('\n')
    const txs = parseCommBankCsv(csv)
    expect(txs).toHaveLength(2)
    expect(txs[0]).toEqual({ date: '2026-07-14', amount: -12.5, description: 'PURCHASE AT COFFEE HOUSE SYDNEY' })
    expect(txs[1].amount).toBe(2400)
  })

  it('skips header rows, blanks and thousands separators', () => {
    const csv = ['Date,Amount,Description,Balance', '', '"01/07/2026","-1,850.00","RENT RAY WHITE","+900.00"'].join('\n')
    const txs = parseCommBankCsv(csv)
    expect(txs).toHaveLength(1)
    expect(txs[0].amount).toBe(-1850)
  })

  it('handles escaped quotes inside descriptions', () => {
    const txs = parseCommBankCsv('"14/07/2026","-5.00","CAFE ""LUNA"" PTY","+10.00"')
    expect(txs[0].description).toBe('CAFE "LUNA" PTY')
  })
})

describe('cleanDescription / guessCategory', () => {
  it('strips bank noise and title-cases shouty text', () => {
    expect(cleanDescription('PURCHASE AT WOOLWORTHS 1234 SYDNEY NS AUS Card xx9999')).toMatch(/^Woolworths 1234/)
  })

  it('guesses common Australian merchants', () => {
    expect(guessCategory('WOOLWORTHS 1234 SYDNEY')).toBe('groceries')
    expect(guessCategory('UBER EATS SYDNEY')).toBe('food')
    expect(guessCategory('UBER *TRIP')).toBe('transport')
    expect(guessCategory('NETFLIX.COM')).toBe('streaming')
    expect(guessCategory('SOMETHING UNKNOWN')).toBe('other')
  })
})

describe('reconcile', () => {
  const item = (over: Partial<Item>): Item => ({
    id: 'i1',
    kind: 'bill',
    name: 'Internet',
    category: 'internet',
    amount: 89.99,
    currency: 'AUD',
    owner: 'shared',
    frequency: 'monthly',
    startDate: '2026-01-05',
    installmentsTotal: null,
    notes: null,
    archived: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  })
  const occ = (it: Item, dueDate: string): Occurrence => ({ item: it, dueDate, index: 0, payment: undefined })
  const expense = (date: string, amount: number): Expense => ({
    id: 'e1',
    date,
    amount,
    currency: 'AUD',
    category: 'food',
    owner: 'shared',
    paidBy: null,
    note: null,
    createdAt: date,
  })

  it('matches debits to unpaid bills by amount and nearby date', () => {
    const txs = parseCommBankCsv('"06/07/2026","-89.99","AUSSIE BROADBAND","+1.00"')
    const r = reconcile(txs, [occ(item({}), '2026-07-05')], [])
    expect(r.billMatches).toHaveLength(1)
    expect(r.newExpenses).toHaveLength(0)
  })

  it('separates already-recorded expenses, new expenses and credits', () => {
    const txs = parseCommBankCsv(
      [
        '"10/07/2026","-42.80","WOOLWORTHS 999 SYDNEY","+1.00"',
        '"11/07/2026","-15.00","CAFE LUNA","+1.00"',
        '"12/07/2026","+950.00","SALARY","+1.00"',
      ].join('\n')
    )
    const r = reconcile(txs, [], [expense('2026-07-10', 42.8)])
    expect(r.alreadyRecorded).toHaveLength(1)
    expect(r.newExpenses).toHaveLength(1)
    expect(r.newExpenses[0].category).toBe('food')
    expect(r.credits).toHaveLength(1)
  })

  it('uses each bill occurrence at most once', () => {
    const txs = parseCommBankCsv(
      ['"05/07/2026","-89.99","AUSSIE BROADBAND","+1.00"', '"06/07/2026","-89.99","AUSSIE BROADBAND","+1.00"'].join('\n')
    )
    const r = reconcile(txs, [occ(item({}), '2026-07-05')], [])
    expect(r.billMatches).toHaveLength(1)
    expect(r.newExpenses).toHaveLength(1)
  })
})
