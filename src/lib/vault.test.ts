import { describe, expect, it } from 'vitest'
import type { Snapshot, VaultData } from '../types'
import { coupleLeftover, nudgeRemainders, recordDeposit, vaultTotals } from './vault'

const vault: VaultData = {
  boxes: [
    { id: 'b1', emoji: '🐖', name: 'Emergência', currency: 'AUD', amount: 5000, createdAt: 'x' },
    { id: 'b2', emoji: '🇧🇷', name: 'Reais', currency: 'BRL', amount: 3000, createdAt: 'x' },
    { id: 'b3', emoji: '🎓', name: 'Mestrado', currency: 'AUD', amount: 9800, createdAt: 'x' },
  ],
  savedByMonth: {},
}

describe('vaultTotals', () => {
  it('sums per currency', () => {
    expect(vaultTotals(vault.boxes)).toEqual({ AUD: 14800, BRL: 3000 })
  })
})

describe('recordDeposit', () => {
  it('adds to the box and logs the month', () => {
    const next = recordDeposit(vault, 'b1', 500, '2026-07')
    expect(next.boxes.find((b) => b.id === 'b1')?.amount).toBe(5500)
    expect(next.savedByMonth['2026-07']).toEqual({ AUD: 500 })
  })

  it('clamps withdrawals at zero and never logs negative months', () => {
    const next = recordDeposit(vault, 'b2', -9999, '2026-07')
    expect(next.boxes.find((b) => b.id === 'b2')?.amount).toBe(0)
    expect(next.savedByMonth['2026-07']).toEqual({ BRL: 0 })
  })

  it('a withdrawal after a deposit frees the nudge again', () => {
    const afterDeposit = recordDeposit(vault, 'b1', 500, '2026-07')
    const afterWithdraw = recordDeposit(afterDeposit, 'b1', -500, '2026-07')
    expect(afterWithdraw.savedByMonth['2026-07']).toEqual({ AUD: 0 })
  })
})

describe('coupleLeftover / nudgeRemainders', () => {
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
        createdAt: 'x',
      },
    ],
    incomes: [
      {
        id: 'n1',
        name: 'Job',
        owner: 'a',
        amount: 3000,
        currency: 'AUD',
        frequency: 'monthly',
        nextDate: '2026-07-15',
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
        date: '2026-07-10',
        amount: 200,
        currency: 'AUD',
        category: 'food',
        owner: 'shared',
        paidBy: null,
        note: null,
        createdAt: 'x',
      },
    ],
    transfers: [],
    settings: {
      nameA: 'G',
      nameB: 'I',
      customCategories: [],
      vault: { boxes: vault.boxes, savedByMonth: { '2026-07': { AUD: 1500 } } },
    },
  }

  it('computes income minus bills minus spending per currency', () => {
    expect(coupleLeftover(snapshot, '2026-07-15')).toEqual({ AUD: 2000 })
  })

  it('subtracts what was already stashed this month', () => {
    expect(nudgeRemainders(snapshot, '2026-07-15')).toEqual([['AUD', 500]])
  })
})
