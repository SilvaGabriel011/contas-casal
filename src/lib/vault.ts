// The vault ("cofre"): where the couple's stashed money sits, split into
// caixinhas. Pure helpers — persistence rides the settings JSON blob.
import type { Currency, HouseholdSettings, SavingsGoal, Snapshot, VaultBox, VaultData } from '../types'
import { endOfMonth, startOfMonth } from './dates'
import { buildOccurrences, incomeInMonth } from './schedule'
import { expensesFor, monthOf, totalsByCurrency } from './expenses'

export function getVault(settings: HouseholdSettings): VaultData {
  return settings.vault ?? { boxes: [], savedByMonth: {} }
}

export function vaultTotals(boxes: VaultBox[]): Partial<Record<Currency, number>> {
  const out: Partial<Record<Currency, number>> = {}
  for (const b of boxes) out[b.currency] = (out[b.currency] ?? 0) + b.amount
  return out
}

// Apply a deposit (delta > 0) or withdrawal (delta < 0) to a box, clamping the
// box at zero, and log the applied delta against the month so the nudge knows
// how much was already stashed.
export function recordDeposit(vault: VaultData, boxId: string, delta: number, month: string): VaultData {
  const boxes = vault.boxes.map((b) => {
    if (b.id !== boxId) return b
    return { ...b, amount: Math.max(0, Math.round((b.amount + delta) * 100) / 100) }
  })
  const box = vault.boxes.find((b) => b.id === boxId)
  const applied = box ? (boxes.find((b) => b.id === boxId)?.amount ?? 0) - box.amount : 0
  const monthLog = { ...(vault.savedByMonth[month] ?? {}) }
  if (box) {
    monthLog[box.currency] = Math.max(0, Math.round(((monthLog[box.currency] ?? 0) + applied) * 100) / 100)
  }
  return { boxes, savedByMonth: { ...vault.savedByMonth, [month]: monthLog } }
}

// Estimated couple-wide leftover for the current month, per currency:
// monthly-equivalent income minus this month's bills minus everyday spending.
export function coupleLeftover(snapshot: Snapshot, today: string): Partial<Record<Currency, number>> {
  const items = snapshot.items.filter((i) => !i.archived)
  const incomes = snapshot.incomes.filter((i) => i.active)
  const occs = buildOccurrences(items, snapshot.payments, startOfMonth(today), endOfMonth(today))
  const spent = totalsByCurrency(expensesFor(snapshot.expenses, monthOf(today), 'shared'))
  const out: Partial<Record<Currency, number>> = {}
  for (const c of ['AUD', 'BRL'] as Currency[]) {
    const income = incomes
      .filter((i) => i.currency === c)
      .reduce((s, i) => s + incomeInMonth(i, monthOf(today)), 0)
    const bills = occs
      .filter((o) => o.item.currency === c)
      .reduce((s, o) => s + (o.payment?.amount ?? o.item.amount), 0)
    const expenses = spent[c] ?? 0
    if (income !== 0 || bills !== 0 || expenses !== 0) out[c] = income - bills - expenses
  }
  return out
}

// A goal linked to a vault box reads its saved amount straight from the box,
// so stashing money and advancing the goal are one single action.
export function goalSaved(goal: SavingsGoal, settings: HouseholdSettings): number {
  if (goal.boxId) {
    const box = getVault(settings).boxes.find((b) => b.id === goal.boxId)
    if (box) return box.amount
  }
  return goal.saved
}

// What is still worth nudging about: leftover minus what was already stashed
// this month. Only positive remainders are returned.
export function nudgeRemainders(snapshot: Snapshot, today: string): [Currency, number][] {
  const leftover = coupleLeftover(snapshot, today)
  const saved = getVault(snapshot.settings).savedByMonth[monthOf(today)] ?? {}
  return (['AUD', 'BRL'] as Currency[])
    .map((c) => [c, (leftover[c] ?? 0) - (saved[c] ?? 0)] as [Currency, number])
    .filter(([, v]) => v > 0.5)
}
