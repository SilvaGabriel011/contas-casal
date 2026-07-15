import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Expense, HouseholdSettings, Income, Item, Payment, Snapshot, Transfer } from '../types'
import type { CloudConfig } from '../lib/config'
import { DEFAULT_SETTINGS, type DataAdapter } from './adapter'

let client: SupabaseClient | null = null
let clientKey = ''

export function getSupabase(cfg: CloudConfig): SupabaseClient {
  const key = `${cfg.url}|${cfg.anonKey}`
  if (!client || clientKey !== key) {
    client = createClient(cfg.url, cfg.anonKey)
    clientKey = key
  }
  return client
}

type ItemRow = {
  id: string
  user_id: string
  kind: string
  name: string
  category: string
  amount: number
  currency: string
  owner: string
  frequency: string
  start_date: string
  installments_total: number | null
  notes: string | null
  archived: boolean
  created_at: string
}

type IncomeRow = {
  id: string
  user_id: string
  name: string
  owner: string
  amount: number
  currency: string
  frequency: string
  next_date: string
  active: boolean
  hourly_rate: number | null
  hours_per_day: number | null
  days_per_week: number | null
  created_at: string
}

type PaymentRow = {
  id: string
  user_id: string
  item_id: string
  due_date: string
  paid_at: string
  amount: number
  paid_by: 'a' | 'b' | null
}

type TransferRow = {
  id: string
  user_id: string
  date: string
  aud_sent: number
  brl_received: number
  fee_aud: number | null
  note: string | null
  created_at: string
}

type ExpenseRow = {
  id: string
  user_id: string
  date: string
  amount: number
  currency: string
  category: string
  owner: string
  paid_by: 'a' | 'b' | null
  note: string | null
  created_at: string
}

const itemFromRow = (r: ItemRow): Item => ({
  id: r.id,
  kind: r.kind as Item['kind'],
  name: r.name,
  category: r.category,
  amount: Number(r.amount),
  currency: r.currency as Item['currency'],
  owner: r.owner as Item['owner'],
  frequency: r.frequency as Item['frequency'],
  startDate: r.start_date,
  installmentsTotal: r.installments_total,
  notes: r.notes,
  archived: r.archived,
  createdAt: r.created_at,
})

const incomeFromRow = (r: IncomeRow): Income => ({
  id: r.id,
  name: r.name,
  owner: r.owner as Income['owner'],
  amount: Number(r.amount),
  currency: r.currency as Income['currency'],
  frequency: r.frequency as Income['frequency'],
  nextDate: r.next_date,
  active: r.active,
  hourlyRate: r.hourly_rate === null ? null : Number(r.hourly_rate),
  hoursPerDay: r.hours_per_day === null ? null : Number(r.hours_per_day),
  daysPerWeek: r.days_per_week === null ? null : Number(r.days_per_week),
  createdAt: r.created_at,
})

const paymentFromRow = (r: PaymentRow): Payment => ({
  id: r.id,
  itemId: r.item_id,
  dueDate: r.due_date,
  paidAt: r.paid_at,
  amount: Number(r.amount),
  paidBy: r.paid_by ?? null,
})

const transferFromRow = (r: TransferRow): Transfer => ({
  id: r.id,
  date: r.date,
  audSent: Number(r.aud_sent),
  brlReceived: Number(r.brl_received),
  feeAud: r.fee_aud === null ? null : Number(r.fee_aud),
  note: r.note,
  createdAt: r.created_at,
})

const expenseFromRow = (r: ExpenseRow): Expense => ({
  id: r.id,
  date: r.date,
  amount: Number(r.amount),
  currency: r.currency as Expense['currency'],
  category: r.category,
  owner: r.owner as Expense['owner'],
  paidBy: r.paid_by ?? null,
  note: r.note,
  createdAt: r.created_at,
})

export class SupabaseAdapter implements DataAdapter {
  constructor(
    private sb: SupabaseClient,
    private userId: string
  ) {}

  async load(): Promise<Snapshot> {
    const [items, incomes, payments, expenses, transfers, settings] = await Promise.all([
      this.sb.from('items').select('*').order('created_at'),
      this.sb.from('incomes').select('*').order('created_at'),
      this.sb.from('payments').select('*'),
      this.sb.from('expenses').select('*'),
      this.sb.from('transfers').select('*'),
      this.sb.from('app_settings').select('*').maybeSingle(),
    ])
    const firstError =
      items.error ?? incomes.error ?? payments.error ?? expenses.error ?? transfers.error ?? settings.error
    if (firstError) throw firstError
    return {
      items: ((items.data ?? []) as ItemRow[]).map(itemFromRow),
      incomes: ((incomes.data ?? []) as IncomeRow[]).map(incomeFromRow),
      payments: ((payments.data ?? []) as PaymentRow[]).map(paymentFromRow),
      expenses: ((expenses.data ?? []) as ExpenseRow[]).map(expenseFromRow),
      transfers: ((transfers.data ?? []) as TransferRow[]).map(transferFromRow),
      settings: { ...DEFAULT_SETTINGS, ...((settings.data?.data as Partial<HouseholdSettings>) ?? {}) },
    }
  }

  async upsertItem(item: Item) {
    const { error } = await this.sb.from('items').upsert({
      id: item.id,
      user_id: this.userId,
      kind: item.kind,
      name: item.name,
      category: item.category,
      amount: item.amount,
      currency: item.currency,
      owner: item.owner,
      frequency: item.frequency,
      start_date: item.startDate,
      installments_total: item.installmentsTotal,
      notes: item.notes,
      archived: item.archived,
    })
    if (error) throw error
  }

  async deleteItem(id: string) {
    const { error } = await this.sb.from('items').delete().eq('id', id)
    if (error) throw error
  }

  async upsertIncome(income: Income) {
    const { error } = await this.sb.from('incomes').upsert({
      id: income.id,
      user_id: this.userId,
      name: income.name,
      owner: income.owner,
      amount: income.amount,
      currency: income.currency,
      frequency: income.frequency,
      next_date: income.nextDate,
      active: income.active,
      hourly_rate: income.hourlyRate,
      hours_per_day: income.hoursPerDay,
      days_per_week: income.daysPerWeek,
    })
    if (error) throw error
  }

  async deleteIncome(id: string) {
    const { error } = await this.sb.from('incomes').delete().eq('id', id)
    if (error) throw error
  }

  async addPayment(payment: Payment) {
    const { error } = await this.sb.from('payments').upsert(
      {
        id: payment.id,
        user_id: this.userId,
        item_id: payment.itemId,
        due_date: payment.dueDate,
        paid_at: payment.paidAt,
        amount: payment.amount,
        paid_by: payment.paidBy,
      },
      { onConflict: 'user_id,item_id,due_date' }
    )
    if (error) throw error
  }

  async upsertExpense(expense: Expense) {
    const { error } = await this.sb.from('expenses').upsert({
      id: expense.id,
      user_id: this.userId,
      date: expense.date,
      amount: expense.amount,
      currency: expense.currency,
      category: expense.category,
      owner: expense.owner,
      paid_by: expense.paidBy,
      note: expense.note,
    })
    if (error) throw error
  }

  async deleteExpense(id: string) {
    const { error } = await this.sb.from('expenses').delete().eq('id', id)
    if (error) throw error
  }

  async upsertTransfer(transfer: Transfer) {
    const { error } = await this.sb.from('transfers').upsert({
      id: transfer.id,
      user_id: this.userId,
      date: transfer.date,
      aud_sent: transfer.audSent,
      brl_received: transfer.brlReceived,
      fee_aud: transfer.feeAud,
      note: transfer.note,
    })
    if (error) throw error
  }

  async deleteTransfer(id: string) {
    const { error } = await this.sb.from('transfers').delete().eq('id', id)
    if (error) throw error
  }

  async removePayment(itemId: string, dueDate: string) {
    const { error } = await this.sb.from('payments').delete().eq('item_id', itemId).eq('due_date', dueDate)
    if (error) throw error
  }

  async saveSettings(settings: HouseholdSettings) {
    const { error } = await this.sb
      .from('app_settings')
      .upsert({ user_id: this.userId, data: settings, updated_at: new Date().toISOString() })
    if (error) throw error
  }

  private itemRow(item: Item) {
    return {
      id: item.id,
      user_id: this.userId,
      kind: item.kind,
      name: item.name,
      category: item.category,
      amount: item.amount,
      currency: item.currency,
      owner: item.owner,
      frequency: item.frequency,
      start_date: item.startDate,
      installments_total: item.installmentsTotal,
      notes: item.notes,
      archived: item.archived,
    }
  }

  async replaceAll(snapshot: Snapshot) {
    // items cascade-delete their payments; incomes are independent
    const del1 = await this.sb.from('items').delete().eq('user_id', this.userId)
    if (del1.error) throw del1.error
    const del2 = await this.sb.from('incomes').delete().eq('user_id', this.userId)
    if (del2.error) throw del2.error
    const del3 = await this.sb.from('expenses').delete().eq('user_id', this.userId)
    if (del3.error) throw del3.error
    const del4 = await this.sb.from('transfers').delete().eq('user_id', this.userId)
    if (del4.error) throw del4.error

    if (snapshot.items.length) {
      const { error } = await this.sb.from('items').insert(snapshot.items.map((i) => this.itemRow(i)))
      if (error) throw error
    }
    if (snapshot.incomes.length) {
      const { error } = await this.sb.from('incomes').insert(
        snapshot.incomes.map((i) => ({
          id: i.id,
          user_id: this.userId,
          name: i.name,
          owner: i.owner,
          amount: i.amount,
          currency: i.currency,
          frequency: i.frequency,
          next_date: i.nextDate,
          active: i.active,
          hourly_rate: i.hourlyRate,
          hours_per_day: i.hoursPerDay,
          days_per_week: i.daysPerWeek,
        }))
      )
      if (error) throw error
    }
    if (snapshot.payments.length) {
      const { error } = await this.sb.from('payments').insert(
        snapshot.payments.map((p) => ({
          id: p.id,
          user_id: this.userId,
          item_id: p.itemId,
          due_date: p.dueDate,
          paid_at: p.paidAt,
          amount: p.amount,
          paid_by: p.paidBy ?? null,
        }))
      )
      if (error) throw error
    }
    if (snapshot.transfers.length) {
      const { error } = await this.sb.from('transfers').insert(
        snapshot.transfers.map((t) => ({
          id: t.id,
          user_id: this.userId,
          date: t.date,
          aud_sent: t.audSent,
          brl_received: t.brlReceived,
          fee_aud: t.feeAud,
          note: t.note,
        }))
      )
      if (error) throw error
    }
    if (snapshot.expenses.length) {
      const { error } = await this.sb.from('expenses').insert(
        snapshot.expenses.map((e) => ({
          id: e.id,
          user_id: this.userId,
          date: e.date,
          amount: e.amount,
          currency: e.currency,
          category: e.category,
          owner: e.owner,
          paid_by: e.paidBy,
          note: e.note,
        }))
      )
      if (error) throw error
    }
    await this.saveSettings(snapshot.settings)
  }

  subscribe(onRemoteChange: () => void): () => void {
    const channel = this.sb
      .channel('cc-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, onRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incomes' }, onRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, onRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, onRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, onRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, onRemoteChange)
      // Events emitted while the socket was down are gone forever, so every
      // (re)join must trigger a catch-up refetch.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onRemoteChange()
      })
    return () => {
      this.sb.removeChannel(channel)
    }
  }
}
