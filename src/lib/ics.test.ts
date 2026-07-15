import { describe, expect, it } from 'vitest'
import type { Item } from '../types'
import { buildRemindersIcs, icsEventCount } from './ics'
import { addDays, todayISO } from './dates'

const item = (over: Partial<Item>): Item => ({
  id: 'i1',
  kind: 'bill',
  name: 'Rent; com, vírgula',
  category: 'rent',
  amount: 620,
  currency: 'AUD',
  owner: 'shared',
  frequency: 'weekly',
  startDate: todayISO(),
  installmentsTotal: null,
  notes: null,
  archived: false,
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
})

const title = (i: Item, due: string) => `Pagar ${i.name} amanhã (${due})`
const body = () => 'Contas do Casal'

describe('buildRemindersIcs', () => {
  it('creates one all-day event on the day before each due date', () => {
    const due = addDays(todayISO(), 10)
    const ics = buildRemindersIcs([item({ frequency: 'once', startDate: due })], title, body)
    expect(icsEventCount(ics)).toBe(1)
    expect(ics).toContain(`DTSTART;VALUE=DATE:${addDays(due, -1).replaceAll('-', '')}`)
    expect(ics).toContain('TRIGGER:PT9H')
  })

  it('caps recurring items and escapes special characters', () => {
    const ics = buildRemindersIcs([item({ frequency: 'weekly' })], title, body)
    expect(icsEventCount(ics)).toBeLessThanOrEqual(26)
    expect(icsEventCount(ics)).toBeGreaterThan(20)
    expect(ics).toContain('Rent\\; com\\, vírgula')
    expect(ics).not.toMatch(/SUMMARY:[^\n]*[^\\];/)
  })

  it('limits installment plans to their remaining parcels', () => {
    const plan = item({
      kind: 'installment',
      frequency: 'monthly',
      startDate: todayISO(),
      installmentsTotal: 3,
    })
    expect(icsEventCount(buildRemindersIcs([plan], title, body))).toBe(3)
  })
})
