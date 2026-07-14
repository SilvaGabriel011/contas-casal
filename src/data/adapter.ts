import type { HouseholdSettings, Income, Item, Payment, Snapshot } from '../types'

export interface DataAdapter {
  load(): Promise<Snapshot>
  upsertItem(item: Item): Promise<void>
  deleteItem(id: string): Promise<void>
  upsertIncome(income: Income): Promise<void>
  deleteIncome(id: string): Promise<void>
  addPayment(payment: Payment): Promise<void>
  removePayment(itemId: string, dueDate: string): Promise<void>
  saveSettings(settings: HouseholdSettings): Promise<void>
  // Called with a callback that should refetch when remote data changes.
  subscribe?(onRemoteChange: () => void): () => void
}

export const DEFAULT_SETTINGS: HouseholdSettings = {
  nameA: 'Gabriel',
  nameB: 'Izabela',
  customCategories: [],
}

export const EMPTY_SNAPSHOT: Snapshot = {
  items: [],
  incomes: [],
  payments: [],
  settings: DEFAULT_SETTINGS,
}
