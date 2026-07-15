import type { Expense, HouseholdSettings, Income, Item, Payment, Snapshot } from '../types'
import { DEFAULT_SETTINGS, EMPTY_SNAPSHOT, type DataAdapter } from './adapter'
import * as reduce from './reducers'

// v2: local mode starts from a clean slate (v1 shipped with sample data).
const KEY = 'cc.demo.v2'

function read(): Snapshot {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw)
      return {
        items: s.items ?? [],
        incomes: s.incomes ?? [],
        payments: s.payments ?? [],
        expenses: s.expenses ?? [],
        settings: { ...DEFAULT_SETTINGS, ...s.settings },
      }
    }
  } catch {
    /* corrupted storage falls through to a fresh start */
  }
  return EMPTY_SNAPSHOT
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

  async upsertExpense(expense: Expense) {
    this.snap = reduce.upsertExpense(this.snap, expense)
    this.commit()
  }

  async deleteExpense(id: string) {
    this.snap = reduce.deleteExpense(this.snap, id)
    this.commit()
  }

  async saveSettings(settings: HouseholdSettings) {
    this.snap = reduce.putSettings(this.snap, settings)
    this.commit()
  }

  async replaceAll(snapshot: Snapshot) {
    this.snap = snapshot
    this.commit()
  }
}

