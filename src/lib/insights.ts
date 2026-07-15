// Gentle nudges about the couple's consumption, computed locally from the
// snapshot. Everything here compares the couple against their OWN history —
// never one partner against the other.
import type { Budget, Currency, Expense, Snapshot } from '../types'
import { monthOf, shiftMonth } from './expenses'
import { monthlyEquivalent } from './schedule'

// --- Spending radar --------------------------------------------------------
// "You're spending a lot more than usual on X this month", measured against
// the average of the previous LOOKBACK months so it adapts to their normal.

export interface CategoryAlert {
  category: string
  currency: Currency
  spent: number
  typical: number
  pct: number // % above the typical month, rounded
}

const LOOKBACK = 3
const TRIGGER = 1.5 // alert at 50%+ above the usual
const MIN_SPENT = 50 // ignore small categories (either currency)
const MIN_TYPICAL = 15 // need some history before calling anything "unusual"

const catKey = (category: string, currency: Currency) => `${category}|${currency}`

function spentByCategory(expenses: Expense[], month: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of expenses) {
    if (monthOf(e.date) !== month) continue
    const k = catKey(e.category, e.currency)
    out.set(k, (out.get(k) ?? 0) + e.amount)
  }
  return out
}

export function categoryAlerts(expenses: Expense[], month: string): CategoryAlert[] {
  const current = spentByCategory(expenses, month)
  const history = Array.from({ length: LOOKBACK }, (_, i) => spentByCategory(expenses, shiftMonth(month, -(i + 1))))
  const alerts: CategoryAlert[] = []
  for (const [key, spent] of current) {
    const typical = history.reduce((s, m) => s + (m.get(key) ?? 0), 0) / LOOKBACK
    if (spent < MIN_SPENT || typical < MIN_TYPICAL || spent <= typical * TRIGGER) continue
    const [category, currency] = key.split('|') as [string, Currency]
    alerts.push({ category, currency, spent, typical, pct: Math.round((spent / typical - 1) * 100) })
  }
  return alerts.sort((a, b) => b.spent - b.typical - (a.spent - a.typical))
}

export interface BudgetAlert {
  category: string
  currency: Currency
  spent: number
  budget: number
}

export function budgetAlerts(
  expenses: Expense[],
  month: string,
  budgets: Record<string, Budget> | undefined
): BudgetAlert[] {
  if (!budgets) return []
  const alerts: BudgetAlert[] = []
  for (const [category, b] of Object.entries(budgets)) {
    const spent = expenses
      .filter((e) => monthOf(e.date) === month && e.category === category && e.currency === b.currency)
      .reduce((s, e) => s + e.amount, 0)
    if (spent > b.amount) alerts.push({ category, currency: b.currency, spent, budget: b.amount })
  }
  return alerts.sort((a, b) => b.spent / b.budget - a.spent / a.budget)
}

// --- Couple balance ---------------------------------------------------------
// Who brings in / pays out how much. Income is the monthly equivalent of the
// active incomes (stable, not payday-count noise); spending is what each
// person actually paid in the given month. Shared/unattributed amounts are
// split half-half so the bars always add up.

export interface PersonMoney {
  AUD: number
  BRL: number
}

export interface CoupleBalance {
  income: { a: PersonMoney; b: PersonMoney }
  spending: { a: PersonMoney; b: PersonMoney }
}

const zero = (): PersonMoney => ({ AUD: 0, BRL: 0 })

export function coupleBalance(snapshot: Snapshot, month: string): CoupleBalance {
  const income = { a: zero(), b: zero() }
  const spending = { a: zero(), b: zero() }

  const add = (side: { a: PersonMoney; b: PersonMoney }, person: 'a' | 'b' | null, currency: Currency, amount: number) => {
    if (person) side[person][currency] += amount
    else {
      side.a[currency] += amount / 2
      side.b[currency] += amount / 2
    }
  }

  for (const inc of snapshot.incomes) {
    if (!inc.active) continue
    const person = inc.owner === 'shared' ? null : inc.owner
    add(income, person, inc.currency, monthlyEquivalent(inc.amount, inc.frequency))
  }

  for (const e of snapshot.expenses) {
    if (monthOf(e.date) !== month) continue
    const person = e.paidBy ?? (e.owner === 'shared' ? null : e.owner)
    add(spending, person, e.currency, e.amount)
  }

  const items = new Map(snapshot.items.map((i) => [i.id, i]))
  for (const p of snapshot.payments) {
    if (monthOf(p.dueDate) !== month) continue
    const item = items.get(p.itemId)
    if (!item) continue
    const person = p.paidBy ?? (item.owner === 'shared' ? null : item.owner)
    add(spending, person, item.currency, p.amount)
  }

  return { income, spending }
}
