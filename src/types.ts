export type Owner = 'a' | 'b' | 'shared'
export type Profile = Owner
export type Currency = 'AUD' | 'BRL'
export type ItemKind = 'bill' | 'subscription' | 'installment'
export type Frequency = 'weekly' | 'fortnightly' | 'monthly' | 'yearly' | 'once'
export type IncomeFrequency = 'weekly' | 'fortnightly' | 'monthly'

export interface Item {
  id: string
  kind: ItemKind
  name: string
  category: string
  amount: number
  currency: Currency
  owner: Owner
  frequency: Frequency
  startDate: string
  installmentsTotal: number | null
  notes: string | null
  archived: boolean
  createdAt: string
}

export interface Income {
  id: string
  name: string
  owner: Owner
  amount: number
  currency: Currency
  frequency: IncomeFrequency
  nextDate: string
  active: boolean
  createdAt: string
}

export interface Payment {
  id: string
  itemId: string
  dueDate: string
  paidAt: string
  amount: number
}

export interface HouseholdSettings {
  nameA: string
  nameB: string
}

export interface Snapshot {
  items: Item[]
  incomes: Income[]
  payments: Payment[]
  settings: HouseholdSettings
}

export interface Occurrence {
  item: Item
  dueDate: string
  index: number
  payment: Payment | undefined
}

export const CATEGORIES = [
  'rent',
  'utilities',
  'internet',
  'phone',
  'groceries',
  'transport',
  'car',
  'health',
  'insurance',
  'education',
  'card',
  'streaming',
  'gym',
  'tax',
  'travel',
  'gift',
  'other',
] as const

export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_EMOJI: Record<string, string> = {
  rent: '🏠',
  utilities: '💡',
  internet: '📶',
  phone: '📱',
  groceries: '🛒',
  transport: '🚌',
  car: '🚗',
  health: '🩺',
  insurance: '🛡️',
  education: '🎓',
  card: '💳',
  streaming: '🎬',
  gym: '🏋️',
  tax: '🧾',
  travel: '✈️',
  gift: '🎁',
  other: '📦',
}
