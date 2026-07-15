// Australian financial year helpers (1 July – 30 June, named by ending year).
// "Deductible" is driven by the user's chosen categories plus an explicit
// "#tax" tag in an expense note — no schema change needed.
import type { Expense } from '../types'

export function fyEndYear(dateISO: string): number {
  const [y, m] = dateISO.split('-').map(Number)
  return m >= 7 ? y + 1 : y
}

export function fyRange(endYear: number): { from: string; to: string } {
  return { from: `${endYear - 1}-07-01`, to: `${endYear}-06-30` }
}

export function fyLabel(endYear: number): string {
  return `${endYear - 1}–${String(endYear).slice(2)}`
}

export function isDeductible(e: Expense, taxCategories: string[]): boolean {
  return taxCategories.includes(e.category) || (e.note ?? '').toLowerCase().includes('#tax')
}

export function deductibleExpenses(expenses: Expense[], endYear: number, taxCategories: string[]): Expense[] {
  const { from, to } = fyRange(endYear)
  return expenses
    .filter((e) => e.date >= from && e.date <= to && isDeductible(e, taxCategories))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

export function taxCsv(expenses: Expense[], label: (e: Expense) => string): string {
  const esc = (s: string) => `"${s.replaceAll('"', '""')}"`
  const rows = expenses.map((e) =>
    [e.date, esc(e.note ?? ''), esc(label(e)), e.amount.toFixed(2), e.currency].join(',')
  )
  return ['date,note,category,amount,currency', ...rows].join('\n')
}
