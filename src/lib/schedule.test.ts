import { describe, expect, it } from 'vitest'
import type { Income, Item, Payment } from '../types'
import {
  buildOccurrences,
  hourlyInfo,
  incomeDates,
  installmentProgress,
  isItemFinished,
  monthlyEquivalent,
  nextIncomeDate,
  nextPayday,
  occurrenceDates,
  visibleToProfile,
} from './schedule'

const item = (over: Partial<Item>): Item => ({
  id: 'i1',
  kind: 'bill',
  name: 'Test',
  category: 'other',
  amount: 100,
  currency: 'AUD',
  owner: 'shared',
  frequency: 'monthly',
  startDate: '2026-01-15',
  installmentsTotal: null,
  notes: null,
  archived: false,
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
})

const income = (over: Partial<Income>): Income => ({
  id: 'r1',
  name: 'Salary',
  owner: 'a',
  amount: 1000,
  currency: 'AUD',
  frequency: 'weekly',
  nextDate: '2026-07-17',
  active: true,
  hourlyRate: null,
  hoursPerDay: null,
  daysPerWeek: null,
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
})

const payment = (itemId: string, dueDate: string, amount = 100): Payment => ({
  id: `p-${itemId}-${dueDate}`,
  itemId,
  dueDate,
  paidAt: '2026-07-01T00:00:00Z',
  amount,
})

describe('occurrenceDates — weekly/fortnightly', () => {
  it('emits every step inside the window with correct indices', () => {
    const it1 = item({ frequency: 'weekly', startDate: '2026-07-01' })
    expect(occurrenceDates(it1, '2026-07-01', '2026-07-21')).toEqual([
      { date: '2026-07-01', index: 0 },
      { date: '2026-07-08', index: 1 },
      { date: '2026-07-15', index: 2 },
    ])
  })

  it('starts mid-window when "from" falls between steps', () => {
    const it1 = item({ frequency: 'fortnightly', startDate: '2026-07-01' })
    expect(occurrenceDates(it1, '2026-07-02', '2026-07-30')).toEqual([
      { date: '2026-07-15', index: 1 },
      { date: '2026-07-29', index: 2 },
    ])
  })

  it('handles start after the window start and beyond the window end', () => {
    const it1 = item({ frequency: 'weekly', startDate: '2026-07-20' })
    expect(occurrenceDates(it1, '2026-07-01', '2026-07-22')).toEqual([{ date: '2026-07-20', index: 0 }])
    expect(occurrenceDates(it1, '2026-07-01', '2026-07-19')).toEqual([])
  })
})

describe('occurrenceDates — monthly/yearly', () => {
  it('clamps day-31 to short months without skipping', () => {
    const it1 = item({ startDate: '2026-01-31' })
    expect(occurrenceDates(it1, '2026-02-01', '2026-04-30').map((o) => o.date)).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('does not skip the in-month occurrence when from-day precedes the anchor day', () => {
    const it1 = item({ startDate: '2026-01-31' })
    expect(occurrenceDates(it1, '2026-03-01', '2026-03-31')).toEqual([{ date: '2026-03-31', index: 2 }])
  })

  it('yearly emits anniversaries only', () => {
    const it1 = item({ frequency: 'yearly', startDate: '2024-03-10' })
    expect(occurrenceDates(it1, '2026-01-01', '2027-12-31').map((o) => o.date)).toEqual([
      '2026-03-10',
      '2027-03-10',
    ])
  })

  it('once emits exactly its date when in range', () => {
    const it1 = item({ frequency: 'once', startDate: '2026-07-10' })
    expect(occurrenceDates(it1, '2026-07-01', '2026-07-31')).toEqual([{ date: '2026-07-10', index: 0 }])
    expect(occurrenceDates(it1, '2026-07-11', '2026-07-31')).toEqual([])
  })
})

describe('occurrenceDates — installments', () => {
  const plan = item({
    kind: 'installment',
    frequency: 'monthly',
    startDate: '2026-05-10',
    installmentsTotal: 3,
  })

  it('never emits beyond installmentsTotal', () => {
    const dates = occurrenceDates(plan, '2026-01-01', '2027-12-31')
    expect(dates).toEqual([
      { date: '2026-05-10', index: 0 },
      { date: '2026-06-10', index: 1 },
      { date: '2026-07-10', index: 2 },
    ])
  })

  it('emits nothing after the plan has fully elapsed', () => {
    expect(occurrenceDates(plan, '2026-09-01', '2027-12-31')).toEqual([])
  })
})

describe('buildOccurrences', () => {
  it('sorts by date, attaches payments, skips archived', () => {
    const a = item({ id: 'a', frequency: 'weekly', startDate: '2026-07-02', name: 'B' })
    const b = item({ id: 'b', frequency: 'weekly', startDate: '2026-07-02', name: 'A' })
    const archived = item({ id: 'c', frequency: 'weekly', startDate: '2026-07-02', archived: true })
    const pays = [payment('a', '2026-07-02')]
    const occs = buildOccurrences([a, b, archived], pays, '2026-07-01', '2026-07-09')
    expect(occs.map((o) => `${o.item.id}|${o.dueDate}`)).toEqual([
      'b|2026-07-02',
      'a|2026-07-02',
      'b|2026-07-09',
      'a|2026-07-09',
    ])
    expect(occs[1].payment).toBeDefined()
    expect(occs[0].payment).toBeUndefined()
  })
})

describe('installmentProgress / isItemFinished', () => {
  const plan = item({ kind: 'installment', startDate: '2026-05-10', installmentsTotal: 3 })

  it('counts paid installments and caps at total', () => {
    const pays = [payment('i1', '2026-05-10'), payment('i1', '2026-06-10')]
    expect(installmentProgress(plan, pays)).toEqual({ paid: 2, total: 3 })
    expect(isItemFinished(plan, pays)).toBe(false)
    const all = [...pays, payment('i1', '2026-07-10')]
    expect(isItemFinished(plan, all)).toBe(true)
  })

  it('one-off items finish only when paid — never by date alone', () => {
    const once = item({ frequency: 'once', startDate: '2020-01-01' })
    expect(isItemFinished(once, [])).toBe(false)
    expect(isItemFinished(once, [payment('i1', '2020-01-01')])).toBe(true)
  })

  it('recurring items never finish', () => {
    expect(isItemFinished(item({}), [payment('i1', '2026-01-15')])).toBe(false)
  })
})

describe('nextIncomeDate', () => {
  it('returns the anchor when it is today or in the future', () => {
    expect(nextIncomeDate(income({ nextDate: '2026-07-17' }), '2026-07-14')).toBe('2026-07-17')
    expect(nextIncomeDate(income({ nextDate: '2026-07-14' }), '2026-07-14')).toBe('2026-07-14')
  })

  it('rolls weekly/fortnightly anchors forward, landing on today when exact', () => {
    expect(nextIncomeDate(income({ nextDate: '2026-06-30', frequency: 'fortnightly' }), '2026-07-14')).toBe(
      '2026-07-14'
    )
    expect(nextIncomeDate(income({ nextDate: '2026-07-01', frequency: 'weekly' }), '2026-07-14')).toBe(
      '2026-07-15'
    )
  })

  it('rolls monthly anchors preserving day-of-month with clamping', () => {
    expect(nextIncomeDate(income({ nextDate: '2026-01-31', frequency: 'monthly' }), '2026-02-01')).toBe(
      '2026-02-28'
    )
    expect(nextIncomeDate(income({ nextDate: '2026-01-31', frequency: 'monthly' }), '2026-03-01')).toBe(
      '2026-03-31'
    )
  })
})

describe('nextPayday', () => {
  it('picks the earliest active income and ignores paused ones', () => {
    const a = income({ id: 'a', nextDate: '2026-07-20' })
    const paused = income({ id: 'b', nextDate: '2026-07-15', active: false })
    expect(nextPayday([a, paused], '2026-07-14')?.date).toBe('2026-07-20')
    expect(nextPayday([paused], '2026-07-14')).toBeNull()
  })
})

describe('incomeDates', () => {
  it('extrapolates the cadence backwards from the anchor', () => {
    const i = income({ nextDate: '2026-07-17', frequency: 'weekly' })
    expect(incomeDates(i, '2026-07-01', '2026-07-14')).toEqual(['2026-07-03', '2026-07-10'])
  })

  it('covers the whole month forward', () => {
    const i = income({ nextDate: '2026-07-15', frequency: 'fortnightly' })
    expect(incomeDates(i, '2026-07-01', '2026-07-31')).toEqual(['2026-07-01', '2026-07-15', '2026-07-29'])
  })

  it('monthly uses clamped anchor days', () => {
    const i = income({ nextDate: '2026-01-31', frequency: 'monthly' })
    expect(incomeDates(i, '2026-02-01', '2026-03-31')).toEqual(['2026-02-28', '2026-03-31'])
  })
})

describe('monthlyEquivalent / hourlyInfo', () => {
  it('converts frequencies to monthly equivalents', () => {
    expect(monthlyEquivalent(100, 'weekly')).toBeCloseTo(433.33, 2)
    expect(monthlyEquivalent(100, 'fortnightly')).toBeCloseTo(216.67, 2)
    expect(monthlyEquivalent(100, 'monthly')).toBe(100)
    expect(monthlyEquivalent(120, 'yearly')).toBe(10)
    expect(monthlyEquivalent(100, 'once')).toBe(0)
  })

  it('derives weekly hours and per-cycle pay for hourly incomes', () => {
    const i = income({ hourlyRate: 32.5, hoursPerDay: 6, daysPerWeek: 5, frequency: 'weekly' })
    expect(hourlyInfo(i)).toEqual({ hoursPerWeek: 30, perCycle: 975 })
    const fortnightly = income({ hourlyRate: 40, hoursPerDay: 8, daysPerWeek: 5, frequency: 'fortnightly' })
    expect(hourlyInfo(fortnightly)?.perCycle).toBe(3200)
    expect(hourlyInfo(income({}))).toBeNull()
  })
})

describe('visibleToProfile', () => {
  it('couple view sees everything; personal views see own + shared', () => {
    expect(visibleToProfile('a', 'shared')).toBe(true)
    expect(visibleToProfile('b', 'shared')).toBe(true)
    expect(visibleToProfile('a', 'a')).toBe(true)
    expect(visibleToProfile('shared', 'a')).toBe(true)
    expect(visibleToProfile('b', 'a')).toBe(false)
  })
})
