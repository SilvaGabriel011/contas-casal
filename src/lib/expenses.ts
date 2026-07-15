import type { Currency, Expense, Owner } from '../types'
import { visibleToProfile } from './schedule'

export const monthOf = (date: string): string => date.slice(0, 7)

export function expensesFor(expenses: Expense[], month: string, profile: Owner): Expense[] {
  return expenses
    .filter((e) => monthOf(e.date) === month && visibleToProfile(e.owner, profile))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1))
}

export function totalsByCurrency(expenses: Expense[]): Partial<Record<Currency, number>> {
  const out: Partial<Record<Currency, number>> = {}
  for (const e of expenses) out[e.currency] = (out[e.currency] ?? 0) + e.amount
  return out
}

export function spentInCategory(expenses: Expense[], category: string, currency: Currency): number {
  return expenses
    .filter((e) => e.category === category && e.currency === currency)
    .reduce((s, e) => s + e.amount, 0)
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}
