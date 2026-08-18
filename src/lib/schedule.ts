import type { Frequency, IncomeFrequency, Income, Item, Occurrence, Owner, Payment } from '../types'
import { addDays, addMonthsClamped, daysBetween, parseDate } from './dates'

const STEP_DAYS: Partial<Record<Frequency, number>> = { weekly: 7, fortnightly: 14 }

// Due dates of an item within [from, to], inclusive. Index is the 0-based
// position in the item's full schedule (used for "parcela 3/12").
export function occurrenceDates(item: Item, from: string, to: string): { date: string; index: number }[] {
  const out: { date: string; index: number }[] = []
  const start = item.startDate
  if (start > to) return out

  if (item.frequency === 'once') {
    if (start >= from) out.push({ date: start, index: 0 })
    return out
  }

  const step = STEP_DAYS[item.frequency]
  if (step) {
    let k = Math.max(0, Math.floor(daysBetween(start, from) / step))
    // floor can land one step early when 'from' is between occurrences
    while (addDays(start, k * step) < from) k++
    for (; ; k++) {
      const date = addDays(start, k * step)
      if (date > to) break
      out.push({ date, index: k })
    }
    return out
  }

  const monthsPer = item.frequency === 'yearly' ? 12 : 1
  const total = item.kind === 'installment' && item.installmentsTotal ? item.installmentsTotal : Infinity
  const approx =
    (parseDate(from).getFullYear() - parseDate(start).getFullYear()) * 12 +
    (parseDate(from).getMonth() - parseDate(start).getMonth())
  let k = Math.max(0, Math.floor(approx / monthsPer) - 1)
  while (k < total) {
    const date = addMonthsClamped(start, k * monthsPer)
    if (date > to) break
    if (date >= from) out.push({ date, index: k })
    k++
  }
  return out
}

const paymentKey = (itemId: string, dueDate: string) => `${itemId}|${dueDate}`

export function buildOccurrences(
  items: Item[],
  payments: Payment[],
  from: string,
  to: string
): Occurrence[] {
  const paid = new Map(payments.map((p) => [paymentKey(p.itemId, p.dueDate), p]))
  const out: Occurrence[] = []
  for (const item of items) {
    if (item.archived) continue
    for (const { date, index } of occurrenceDates(item, from, to)) {
      out.push({ item, dueDate: date, index, payment: paid.get(paymentKey(item.id, date)) })
    }
  }
  out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.item.name.localeCompare(b.item.name)))
  return out
}

// An installment plan is finished once every scheduled parcela has been paid.
export function installmentProgress(item: Item, payments: Payment[]): { paid: number; total: number } {
  const total = item.installmentsTotal ?? 0
  const paid = payments.filter((p) => p.itemId === item.id).length
  return { paid: Math.min(paid, total), total }
}

export function isItemFinished(item: Item, payments: Payment[]): boolean {
  if (item.kind === 'installment' && item.installmentsTotal) {
    return installmentProgress(item, payments).paid >= item.installmentsTotal
  }
  if (item.frequency === 'once') {
    return payments.some((p) => p.itemId === item.id)
  }
  return false
}

// Next payday for an income: the anchor rolled forward to >= given date.
export function nextIncomeDate(income: Income, onOrAfter: string): string {
  let d = income.nextDate
  // A one-off has a single date — there is nothing to roll forward to.
  if (income.frequency === 'once') return d
  if (d >= onOrAfter) {
    // roll backwards is never needed; anchor may already be in the future
    return d
  }
  if (income.frequency === 'monthly') {
    let k = 1
    while (addMonthsClamped(income.nextDate, k) < onOrAfter) k++
    return addMonthsClamped(income.nextDate, k)
  }
  const step = income.frequency === 'weekly' ? 7 : 14
  const behind = daysBetween(d, onOrAfter)
  const k = Math.ceil(behind / step)
  return addDays(d, k * step)
}

// Paydays of an income within [from, to]. Unlike items, the cadence is
// extrapolated backwards from the anchor too, so "received so far this month"
// can be estimated.
export function incomeDates(income: Income, from: string, to: string): string[] {
  const out: string[] = []
  const anchor = income.nextDate
  if (income.frequency === 'once') return anchor >= from && anchor <= to ? [anchor] : []
  if (income.frequency === 'monthly') {
    const [ay, am] = anchor.split('-').map(Number)
    const [fy, fm] = from.split('-').map(Number)
    let k = (fy - ay) * 12 + (fm - am) - 1
    while (addMonthsClamped(anchor, k) < from) k++
    for (; ; k++) {
      const date = addMonthsClamped(anchor, k)
      if (date > to) break
      out.push(date)
    }
    return out
  }
  const step = income.frequency === 'weekly' ? 7 : 14
  let k = Math.floor(daysBetween(anchor, from) / step)
  while (addDays(anchor, k * step) < from) k++
  for (; ; k++) {
    const date = addDays(anchor, k * step)
    if (date > to) break
    out.push(date)
  }
  return out
}

// Weekly hours and per-cycle pay for an hourly income.
// One home for the payroll formula: weekly hours -> pay per cycle.
export function hourlyPerCycle(
  rate: number,
  hoursPerDay: number,
  daysPerWeek: number,
  frequency: IncomeFrequency
): number {
  const weekly = rate * hoursPerDay * daysPerWeek
  return frequency === 'weekly' ? weekly : frequency === 'fortnightly' ? weekly * 2 : (weekly * 52) / 12
}

export function hourlyInfo(income: Income): { hoursPerWeek: number; perCycle: number } | null {
  if (!income.hourlyRate || !income.hoursPerDay || !income.daysPerWeek) return null
  return {
    hoursPerWeek: income.hoursPerDay * income.daysPerWeek,
    perCycle: hourlyPerCycle(income.hourlyRate, income.hoursPerDay, income.daysPerWeek, income.frequency),
  }
}

export function nextPayday(incomes: Income[], onOrAfter: string): { date: string; income: Income } | null {
  let best: { date: string; income: Income } | null = null
  for (const income of incomes) {
    if (!income.active) continue
    const date = nextIncomeDate(income, onOrAfter)
    // A one-off already received has no upcoming payday.
    if (date < onOrAfter) continue
    if (!best || date < best.date) best = { date, income }
  }
  return best
}

const PER_MONTH: Record<IncomeFrequency | 'yearly' | 'once', number> = {
  weekly: 52 / 12,
  fortnightly: 26 / 12,
  monthly: 1,
  yearly: 1 / 12,
  once: 0,
}

export function monthlyEquivalent(amount: number, frequency: Frequency | IncomeFrequency): number {
  return amount * (PER_MONTH[frequency] ?? 0)
}

// What an income adds to a given month ("YYYY-MM"): recurring cadences use
// the monthly equivalent; a one-off (an extra shift, a bonus) counts fully in
// the month it lands and nothing elsewhere.
export function incomeInMonth(income: Income, month: string): number {
  if (income.frequency === 'once') return income.nextDate.slice(0, 7) === month ? income.amount : 0
  return monthlyEquivalent(income.amount, income.frequency)
}

export function visibleToProfile(owner: Owner, profile: Owner): boolean {
  if (profile === 'shared') return true
  return owner === profile || owner === 'shared'
}
