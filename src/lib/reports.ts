import type { Currency, Owner, Snapshot } from '../types'
import { monthOf, shiftMonth } from './expenses'
import { todayISO } from './dates'

export function lastMonths(n: number): string[] {
  const current = monthOf(todayISO())
  return Array.from({ length: n }, (_, i) => shiftMonth(current, i - (n - 1)))
}

export interface MonthOutflow {
  month: string
  bills: number
  spending: number
}

// Real outflow: payments recorded (by due month) + everyday expenses.
export function outflowByMonth(snapshot: Snapshot, currency: Currency, months: string[]): MonthOutflow[] {
  const items = new Map(snapshot.items.map((i) => [i.id, i]))
  return months.map((month) => ({
    month,
    bills: snapshot.payments
      .filter((p) => monthOf(p.dueDate) === month && items.get(p.itemId)?.currency === currency)
      .reduce((s, p) => s + p.amount, 0),
    spending: snapshot.expenses
      .filter((e) => monthOf(e.date) === month && e.currency === currency)
      .reduce((s, e) => s + e.amount, 0),
  }))
}

export function categoryBreakdown(
  snapshot: Snapshot,
  currency: Currency,
  month: string
): { category: string; total: number }[] {
  const items = new Map(snapshot.items.map((i) => [i.id, i]))
  const totals = new Map<string, number>()
  const add = (category: string, amount: number) =>
    totals.set(category, (totals.get(category) ?? 0) + amount)

  for (const p of snapshot.payments) {
    const item = items.get(p.itemId)
    if (item && item.currency === currency && monthOf(p.dueDate) === month) add(item.category, p.amount)
  }
  for (const e of snapshot.expenses) {
    if (e.currency === currency && monthOf(e.date) === month) add(e.category, e.amount)
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
}

export function personBreakdown(
  snapshot: Snapshot,
  currency: Currency,
  month: string
): { owner: Owner; total: number }[] {
  const items = new Map(snapshot.items.map((i) => [i.id, i]))
  const totals = new Map<Owner, number>()
  const add = (owner: Owner, amount: number) => totals.set(owner, (totals.get(owner) ?? 0) + amount)

  for (const p of snapshot.payments) {
    const item = items.get(p.itemId)
    if (item && item.currency === currency && monthOf(p.dueDate) === month) add(item.owner, p.amount)
  }
  for (const e of snapshot.expenses) {
    if (e.currency === currency && monthOf(e.date) === month) add(e.owner, e.amount)
  }
  return (['a', 'b', 'shared'] as Owner[])
    .map((owner) => ({ owner, total: totals.get(owner) ?? 0 }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
}
