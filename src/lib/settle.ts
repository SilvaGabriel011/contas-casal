import type { Currency, Snapshot } from '../types'
import { monthOf } from './expenses'

// Settle-up convention: positive amounts mean B owes A; negative, A owes B.
// Only records with a known payer (paidBy) participate.
export interface SettleEntry {
  label: string
  date: string
  currency: Currency
  payer: 'a' | 'b'
  owner: 'a' | 'b' | 'shared'
  // Signed contribution to "B owes A".
  amount: number
}

function contribution(
  payer: 'a' | 'b',
  owner: 'a' | 'b' | 'shared',
  amount: number
): number {
  if (owner === payer) return 0
  const share = owner === 'shared' ? amount / 2 : amount
  return payer === 'a' ? share : -share
}

export function settleMonth(
  snapshot: Snapshot,
  month: string
): { entries: SettleEntry[]; net: Partial<Record<Currency, number>> } {
  const items = new Map(snapshot.items.map((i) => [i.id, i]))
  const entries: SettleEntry[] = []

  for (const p of snapshot.payments) {
    if (!p.paidBy || monthOf(p.dueDate) !== month) continue
    const item = items.get(p.itemId)
    if (!item) continue
    const amount = contribution(p.paidBy, item.owner, p.amount)
    if (amount === 0) continue
    entries.push({
      label: item.name,
      date: p.dueDate,
      currency: item.currency,
      payer: p.paidBy,
      owner: item.owner,
      amount,
    })
  }

  for (const e of snapshot.expenses) {
    if (!e.paidBy || monthOf(e.date) !== month) continue
    const amount = contribution(e.paidBy, e.owner, e.amount)
    if (amount === 0) continue
    entries.push({
      label: e.note || e.category,
      date: e.date,
      currency: e.currency,
      payer: e.paidBy,
      owner: e.owner,
      amount,
    })
  }

  entries.sort((a, b) => (a.date < b.date ? 1 : -1))

  const net: Partial<Record<Currency, number>> = {}
  for (const e of entries) net[e.currency] = (net[e.currency] ?? 0) + e.amount

  return { entries, net }
}
