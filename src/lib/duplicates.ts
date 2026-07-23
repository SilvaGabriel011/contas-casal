import type { Currency, Frequency, Owner, Snapshot } from '../types'
import { daysBetween } from './dates'

// Same tolerances the bank reconciliation uses (see commbank.ts).
export const AMOUNT_TOLERANCE = 0.011
export const DATE_WINDOW_DAYS = 2

export type DraftKind = 'expense' | 'bill' | 'subscription' | 'installment' | 'purchase' | 'income'

export interface DupCandidate {
  type: DraftKind
  name: string
  amount: number
  currency: Currency
  owner: Owner
  // expense date | item startDate | income nextDate
  date: string
  frequency: Frequency
}

export interface DupMatch {
  source: 'expense' | 'item' | 'income'
  id: string
  name: string
}

export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const sameAmount = (a: number, b: number) => Math.abs(a - b) <= AMOUNT_TOLERANCE
const nearDate = (a: string, b: string) => Math.abs(daysBetween(a, b)) <= DATE_WINDOW_DAYS

// Flags a review row as "probably already added". Heuristics per type:
// expenses and one-off purchases match on amount + a 2-day window (names from
// receipts/AI are too noisy to require); recurring items match on amount +
// normalized name regardless of date or bill/subscription classification;
// incomes match on amount + owner + cycle.
export function findDuplicate(
  c: DupCandidate,
  snap: Pick<Snapshot, 'expenses' | 'items' | 'incomes'>,
): DupMatch | null {
  if (c.type === 'expense') {
    const hit = snap.expenses.find(
      (e) => e.currency === c.currency && sameAmount(e.amount, c.amount) && nearDate(e.date, c.date)
    )
    return hit ? { source: 'expense', id: hit.id, name: hit.note ?? '' } : null
  }

  if (c.type === 'income') {
    const hit = snap.incomes.find(
      (i) =>
        i.currency === c.currency &&
        sameAmount(i.amount, c.amount) &&
        i.owner === c.owner &&
        i.frequency === c.frequency
    )
    return hit ? { source: 'income', id: hit.id, name: hit.name } : null
  }

  const once = c.type === 'purchase' || c.frequency === 'once'
  const name = normalizeName(c.name)
  const hit = snap.items.find((it) => {
    if (it.archived || it.currency !== c.currency || !sameAmount(it.amount, c.amount)) return false
    return once ? nearDate(it.startDate, c.date) : name !== '' && normalizeName(it.name) === name
  })
  return hit ? { source: 'item', id: hit.id, name: hit.name } : null
}

// Parallel to the input: result[i] is the match for cands[i], or null.
export function findDuplicates(
  cands: DupCandidate[],
  snap: Pick<Snapshot, 'expenses' | 'items' | 'incomes'>,
): (DupMatch | null)[] {
  return cands.map((c) => findDuplicate(c, snap))
}
