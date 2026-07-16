// Month runway: committed cash events for the rest of the month and the
// "safe to spend per day" number derived from the couple's leftover.
import type { Currency, Snapshot } from '../types'
import { addDays, daysBetween, endOfMonth } from './dates'
import { buildOccurrences, incomeDates } from './schedule'
import { coupleLeftover } from './vault'

export interface DayFlow {
  date: string
  net: number
  cum: number
}

// Paydays up, unpaid bills down, day by day from today through month end,
// accumulated — the shape of the rest of the month.
export function committedFlow(snapshot: Snapshot, today: string, currency: Currency): DayFlow[] {
  const eom = endOfMonth(today)
  const items = snapshot.items.filter((i) => !i.archived && i.currency === currency)
  const flows = new Map<string, number>()
  for (const o of buildOccurrences(items, snapshot.payments, today, eom)) {
    if (o.payment) continue
    flows.set(o.dueDate, (flows.get(o.dueDate) ?? 0) - o.item.amount)
  }
  for (const inc of snapshot.incomes) {
    if (!inc.active || inc.currency !== currency) continue
    for (const date of incomeDates(inc, today, eom)) {
      flows.set(date, (flows.get(date) ?? 0) + inc.amount)
    }
  }
  const days = daysBetween(today, eom)
  const out: DayFlow[] = []
  let cum = 0
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i)
    const net = flows.get(date) ?? 0
    cum += net
    out.push({ date, net, cum })
  }
  return out
}

export interface Allowance {
  perDay: number
  daysLeft: number
  leftover: number
}

// "If you spend up to X/day on the day-to-day, the month closes at zero
// without touching the stash."
export function dailyAllowance(snapshot: Snapshot, today: string, currency: Currency): Allowance | null {
  const leftover = coupleLeftover(snapshot, today)[currency]
  if (leftover === undefined) return null
  const daysLeft = daysBetween(today, endOfMonth(today)) + 1
  return { perDay: leftover / daysLeft, daysLeft, leftover }
}
