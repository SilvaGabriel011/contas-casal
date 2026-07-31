// "Wasn't this already added?" — fuzzy duplicate detection used by the AI
// quick-add and by the wizard's review step. Warns, never blocks.
import type { Currency, Expense, Income, Item } from '../types'
import { daysBetween } from './dates'

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

// Same currency + same-ish name (exact, or substring when long enough).
export function findSimilarItem(items: Item[], name: string, currency: Currency): Item | null {
  const target = norm(name)
  if (!target) return null
  return (
    items.find((i) => {
      if (i.archived || i.currency !== currency) return false
      const existing = norm(i.name)
      if (existing === target) return true
      if (target.length >= 4 && existing.includes(target)) return true
      if (existing.length >= 4 && target.includes(existing)) return true
      return false
    }) ?? null
  )
}

export function findSimilarIncome(incomes: Income[], name: string): Income | null {
  const target = norm(name)
  if (!target) return null
  return incomes.find((i) => i.active && norm(i.name) === target) ?? null
}

// Same amount (to the cent), same currency, within a day.
export function findSimilarExpense(
  expenses: Expense[],
  amount: number,
  currency: Currency,
  date: string
): Expense | null {
  return (
    expenses.find(
      (e) =>
        e.currency === currency &&
        Math.abs(e.amount - amount) < 0.005 &&
        Math.abs(daysBetween(e.date, date)) <= 1
    ) ?? null
  )
}
