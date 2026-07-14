import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { HouseholdSettings, Income, Item, Payment, Snapshot } from '../types'
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
  created_at: string
}

type PaymentRow = {
  id: string
  user_id: string
  item_id: string
  due_date: string
  paid_at: string
  amount: number
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
  createdAt: r.created_at,
})

const paymentFromRow = (r: PaymentRow): Payment => ({
  id: r.id,
  itemId: r.item_id,
  dueDate: r.due_date,
  paidAt: r.paid_at,
  amount: Number(r.amount),
})

export class SupabaseAdapter implements DataAdapter {
  constructor(
    private sb: SupabaseClient,
    private userId: string
  ) {}

  async load(): Promise<Snapshot> {
    const [items, incomes, payments, settings] = await Promise.all([
      this.sb.from('items').select('*').order('created_at'),
      this.sb.from('incomes').select('*').order('created_at'),
      this.sb.from('payments').select('*'),
      this.sb.from('app_settings').select('*').maybeSingle(),
    ])
    const firstError = items.error ?? incomes.error ?? payments.error ?? settings.error
    if (firstError) throw firstError
    return {
      items: ((items.data ?? []) as ItemRow[]).map(itemFromRow),
      incomes: ((incomes.data ?? []) as IncomeRow[]).map(incomeFromRow),
      payments: ((payments.data ?? []) as PaymentRow[]).map(paymentFromRow),
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
      },
      { onConflict: 'user_id,item_id,due_date' }
    )
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

  subscribe(onRemoteChange: () => void): () => void {
    const channel = this.sb
      .channel('cc-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, onRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incomes' }, onRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, onRemoteChange)
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
