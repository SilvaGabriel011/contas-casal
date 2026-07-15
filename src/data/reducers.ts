import type { Expense, HouseholdSettings, Income, Item, Payment, Snapshot, Transfer } from '../types'

// Pure snapshot transformations shared by the demo adapter and the
// cloud-mode optimistic updates, so both modes apply identical rules.

export function upsertItem(s: Snapshot, item: Item): Snapshot {
  return { ...s, items: [...s.items.filter((i) => i.id !== item.id), item] }
}

// Deleting an item cascades to its payment history (mirrors the DB FK).
export function deleteItem(s: Snapshot, id: string): Snapshot {
  return {
    ...s,
    items: s.items.filter((i) => i.id !== id),
    payments: s.payments.filter((p) => p.itemId !== id),
  }
}

export function upsertIncome(s: Snapshot, income: Income): Snapshot {
  return { ...s, incomes: [...s.incomes.filter((i) => i.id !== income.id), income] }
}

export function deleteIncome(s: Snapshot, id: string): Snapshot {
  return { ...s, incomes: s.incomes.filter((i) => i.id !== id) }
}

// One payment per (item, dueDate): putting replaces any existing one.
export function putPayment(s: Snapshot, payment: Payment): Snapshot {
  return {
    ...s,
    payments: [
      ...s.payments.filter((p) => !(p.itemId === payment.itemId && p.dueDate === payment.dueDate)),
      payment,
    ],
  }
}

export function removePayment(s: Snapshot, itemId: string, dueDate: string): Snapshot {
  return {
    ...s,
    payments: s.payments.filter((p) => !(p.itemId === itemId && p.dueDate === dueDate)),
  }
}

export function putSettings(s: Snapshot, settings: HouseholdSettings): Snapshot {
  return { ...s, settings }
}

export function upsertExpense(s: Snapshot, expense: Expense): Snapshot {
  return { ...s, expenses: [...s.expenses.filter((e) => e.id !== expense.id), expense] }
}

export function deleteExpense(s: Snapshot, id: string): Snapshot {
  return { ...s, expenses: s.expenses.filter((e) => e.id !== id) }
}

export function upsertTransfer(s: Snapshot, transfer: Transfer): Snapshot {
  return { ...s, transfers: [...s.transfers.filter((t) => t.id !== transfer.id), transfer] }
}

export function deleteTransfer(s: Snapshot, id: string): Snapshot {
  return { ...s, transfers: s.transfers.filter((t) => t.id !== id) }
}
