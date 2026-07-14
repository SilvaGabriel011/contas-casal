import type { HouseholdSettings, Income, Item, Payment, Snapshot } from '../types'
import { addDays, addMonthsClamped, todayISO } from '../lib/dates'
import { DEFAULT_SETTINGS, type DataAdapter } from './adapter'
import * as reduce from './reducers'

const KEY = 'cc.demo.v1'

function read(): Snapshot {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw)
      return {
        items: s.items ?? [],
        incomes: s.incomes ?? [],
        payments: s.payments ?? [],
        settings: { ...DEFAULT_SETTINGS, ...s.settings },
      }
    }
  } catch {
    /* fall through to seed */
  }
  const seeded = seedData()
  localStorage.setItem(KEY, JSON.stringify(seeded))
  return seeded
}

function write(s: Snapshot) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function resetDemoData() {
  localStorage.removeItem(KEY)
}

export class LocalAdapter implements DataAdapter {
  private snap: Snapshot = read()

  async load(): Promise<Snapshot> {
    this.snap = read()
    return this.snap
  }

  private commit() {
    write(this.snap)
  }

  async upsertItem(item: Item) {
    this.snap = reduce.upsertItem(this.snap, item)
    this.commit()
  }

  async deleteItem(id: string) {
    this.snap = reduce.deleteItem(this.snap, id)
    this.commit()
  }

  async upsertIncome(income: Income) {
    this.snap = reduce.upsertIncome(this.snap, income)
    this.commit()
  }

  async deleteIncome(id: string) {
    this.snap = reduce.deleteIncome(this.snap, id)
    this.commit()
  }

  async addPayment(payment: Payment) {
    this.snap = reduce.putPayment(this.snap, payment)
    this.commit()
  }

  async removePayment(itemId: string, dueDate: string) {
    this.snap = reduce.removePayment(this.snap, itemId, dueDate)
    this.commit()
  }

  async saveSettings(settings: HouseholdSettings) {
    this.snap = reduce.putSettings(this.snap, settings)
    this.commit()
  }
}

function seedData(): Snapshot {
  const today = todayISO()
  const iso = (offsetDays: number) => addDays(today, offsetDays)
  const now = new Date().toISOString()

  const items: Item[] = [
    {
      id: crypto.randomUUID(),
      kind: 'bill',
      name: 'Rent',
      category: 'rent',
      amount: 620,
      currency: 'AUD',
      owner: 'shared',
      frequency: 'weekly',
      startDate: iso(2),
      installmentsTotal: null,
      notes: null,
      archived: false,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      kind: 'bill',
      name: 'Energia (AGL)',
      category: 'utilities',
      amount: 95,
      currency: 'AUD',
      owner: 'shared',
      frequency: 'monthly',
      startDate: iso(9),
      installmentsTotal: null,
      notes: null,
      archived: false,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      kind: 'subscription',
      name: 'Netflix',
      category: 'streaming',
      amount: 55.9,
      currency: 'BRL',
      owner: 'a',
      frequency: 'monthly',
      startDate: iso(-3),
      installmentsTotal: null,
      notes: null,
      archived: false,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      kind: 'installment',
      name: 'iPhone (Nubank)',
      category: 'card',
      amount: 289.9,
      currency: 'BRL',
      owner: 'b',
      frequency: 'monthly',
      startDate: addMonthsClamped(iso(5), -2),
      installmentsTotal: 12,
      notes: null,
      archived: false,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      kind: 'subscription',
      name: 'Gym (Anytime)',
      category: 'gym',
      amount: 34.5,
      currency: 'AUD',
      owner: 'a',
      frequency: 'fortnightly',
      startDate: iso(6),
      installmentsTotal: null,
      notes: null,
      archived: false,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      kind: 'purchase',
      name: 'Sofá (Kmart)',
      category: 'household',
      amount: 450,
      currency: 'AUD',
      owner: 'shared',
      frequency: 'once',
      startDate: iso(12),
      installmentsTotal: null,
      notes: null,
      archived: false,
      createdAt: now,
    },
  ]

  const incomes: Income[] = [
    {
      id: crypto.randomUUID(),
      name: 'Salary',
      owner: 'a',
      amount: 1850,
      currency: 'AUD',
      frequency: 'fortnightly',
      nextDate: iso(4),
      active: true,
      hourlyRate: null,
      hoursPerDay: null,
      daysPerWeek: null,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: 'Café (casual)',
      owner: 'b',
      amount: 975,
      currency: 'AUD',
      frequency: 'weekly',
      nextDate: iso(1),
      active: true,
      hourlyRate: 32.5,
      hoursPerDay: 6,
      daysPerWeek: 5,
      createdAt: now,
    },
  ]

  const rentPastDue = addDays(items[0].startDate, -7)
  const payments: Payment[] = [
    {
      id: crypto.randomUUID(),
      itemId: items[0].id,
      dueDate: rentPastDue,
      paidAt: now,
      amount: 620,
    },
  ]

  return { items, incomes, payments, settings: DEFAULT_SETTINGS }
}
