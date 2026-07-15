import { describe, expect, it } from 'vitest'
import type { Snapshot } from '../types'
import { buildAiContext } from './ai'
import { DEFAULT_SETTINGS } from '../data/adapter'
import { todayISO, addDays } from './dates'

const t = (key: string) => key

function snapshotWith(paymentCount: number): Snapshot {
  const today = todayISO()
  return {
    settings: { ...DEFAULT_SETTINGS, nameA: 'Ana', nameB: 'Bia' },
    items: [
      {
        id: 'item-1234-5678',
        kind: 'bill',
        name: 'Rent',
        category: 'rent',
        amount: 620,
        currency: 'AUD',
        owner: 'shared',
        frequency: 'weekly',
        startDate: today,
        installmentsTotal: null,
        notes: null,
        archived: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'archived-1',
        kind: 'bill',
        name: 'Old',
        category: 'other',
        amount: 1,
        currency: 'AUD',
        owner: 'a',
        frequency: 'monthly',
        startDate: today,
        installmentsTotal: null,
        notes: null,
        archived: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    incomes: [
      {
        id: 'inc-1',
        name: 'Salary',
        owner: 'a',
        amount: 975,
        currency: 'AUD',
        frequency: 'weekly',
        nextDate: today,
        active: true,
        hourlyRate: 32.5,
        hoursPerDay: 6,
        daysPerWeek: 5,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    payments: Array.from({ length: paymentCount }, (_, i) => ({
      id: `p${i}`,
      itemId: 'item-1234-5678',
      dueDate: addDays(today, -(i % 300)),
      paidAt: '2026-07-01T00:00:00Z',
      amount: 620,
    })),
  }
}

describe('buildAiContext', () => {
  it('includes names, active items, incomes and payments; skips archived', () => {
    const ctx = JSON.parse(buildAiContext(snapshotWith(3), t))
    expect(ctx.couple).toEqual({ a: 'Ana', b: 'Bia' })
    expect(ctx.items).toHaveLength(1)
    expect(ctx.items[0].name).toBe('Rent')
    expect(ctx.incomes[0].hourlyRate).toBe(32.5)
    expect(ctx.payments).toHaveLength(3)
    expect(ctx.payments[0].item).toBe('Rent')
  })

  it('caps the JSON size by trimming old payments', () => {
    const out = buildAiContext(snapshotWith(3000), t)
    expect(out.length).toBeLessThanOrEqual(38_000)
    expect(JSON.parse(out).items).toHaveLength(1)
  })
})
