// Vercel Cron (Node runtime): the time machine. Every night (~1am Sydney)
// it snapshots each household's data into the `backups` table (app-format
// Snapshot JSON, so restore = the existing import flow), keeps the last 30,
// and on Sundays also emails the JSON to the couple via Resend (offsite copy).
import { createClient } from '@supabase/supabase-js'

/* eslint-disable @typescript-eslint/no-explicit-any */

const KEEP = 30

const itemFromRow = (r: any) => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  category: r.category,
  amount: Number(r.amount),
  currency: r.currency,
  owner: r.owner,
  frequency: r.frequency,
  startDate: r.start_date,
  installmentsTotal: r.installments_total,
  notes: r.notes,
  archived: r.archived,
  createdAt: r.created_at,
})

const incomeFromRow = (r: any) => ({
  id: r.id,
  name: r.name,
  owner: r.owner,
  amount: Number(r.amount),
  currency: r.currency,
  frequency: r.frequency,
  nextDate: r.next_date,
  active: r.active,
  hourlyRate: r.hourly_rate === null ? null : Number(r.hourly_rate),
  hoursPerDay: r.hours_per_day === null ? null : Number(r.hours_per_day),
  daysPerWeek: r.days_per_week === null ? null : Number(r.days_per_week),
  createdAt: r.created_at,
})

const paymentFromRow = (r: any) => ({
  id: r.id,
  itemId: r.item_id,
  dueDate: r.due_date,
  paidAt: r.paid_at,
  amount: Number(r.amount),
  paidBy: r.paid_by ?? null,
})

const expenseFromRow = (r: any) => ({
  id: r.id,
  date: r.date,
  amount: Number(r.amount),
  currency: r.currency,
  category: r.category,
  owner: r.owner,
  paidBy: r.paid_by ?? null,
  note: r.note,
  createdAt: r.created_at,
})

const transferFromRow = (r: any) => ({
  id: r.id,
  date: r.date,
  audSent: Number(r.aud_sent),
  brlReceived: Number(r.brl_received),
  feeAud: r.fee_aud === null ? null : Number(r.fee_aud),
  note: r.note,
  createdAt: r.created_at,
})

export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return res.status(501).json({ error: 'not-configured' })

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

  // Every account that has any data (settings row is created on first save).
  const { data: settingsRows, error } = await sb.from('app_settings').select('user_id,data')
  if (error) return res.status(500).json({ error: error.message })

  const sydneyToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())
  const isSunday =
    new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Sydney', weekday: 'short' }).format(new Date()) ===
    'Sun'
  const resendKey = process.env.RESEND_API_KEY
  const emailFrom = process.env.RESEND_FROM || 'Contas do Casal <onboarding@resend.dev>'

  let saved = 0
  let emailed = 0

  for (const row of settingsRows ?? []) {
    const userId = row.user_id
    const [items, incomes, payments, expenses, transfers] = await Promise.all([
      sb.from('items').select('*').eq('user_id', userId),
      sb.from('incomes').select('*').eq('user_id', userId),
      sb.from('payments').select('*').eq('user_id', userId),
      sb.from('expenses').select('*').eq('user_id', userId),
      sb.from('transfers').select('*').eq('user_id', userId),
    ])
    if (items.error || incomes.error || payments.error || expenses.error || transfers.error) continue

    const snapshot = {
      items: (items.data ?? []).map(itemFromRow),
      incomes: (incomes.data ?? []).map(incomeFromRow),
      payments: (payments.data ?? []).map(paymentFromRow),
      expenses: (expenses.data ?? []).map(expenseFromRow),
      transfers: (transfers.data ?? []).map(transferFromRow),
      settings: row.data ?? {},
    }

    const { error: insErr } = await sb.from('backups').insert({ user_id: userId, data: snapshot })
    if (insErr) continue
    saved++

    // Prune: keep only the newest KEEP snapshots.
    const { data: all } = await sb
      .from('backups')
      .select('id')
      .eq('user_id', userId)
      .order('taken_at', { ascending: false })
    if (all && all.length > KEEP) {
      await sb
        .from('backups')
        .delete()
        .in(
          'id',
          all.slice(KEEP).map((b: any) => b.id)
        )
    }

    // Sunday offsite copy by email.
    const emails = Array.isArray(row.data?.notifyEmails)
      ? row.data.notifyEmails.filter((e: unknown) => typeof e === 'string' && (e as string).includes('@'))
      : []
    if (isSunday && resendKey && emails.length > 0) {
      try {
        const json = JSON.stringify(snapshot, null, 2)
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            from: emailFrom,
            to: emails,
            subject: `🗄️ Backup semanal — Contas do Casal (${sydneyToday})`,
            html: '<p>Segue o backup completo em anexo. Pra restaurar: Ajustes → Importar JSON.</p><p style="color:#888;font-size:12px">Contas do Casal 💞</p>',
            attachments: [
              {
                filename: `contas-casal-backup-${sydneyToday}.json`,
                content: Buffer.from(json).toString('base64'),
              },
            ],
          }),
        })
        if (r.ok) emailed++
      } catch {
        /* email is best-effort */
      }
    }
  }

  return res.status(200).json({ saved, emailed })
}
