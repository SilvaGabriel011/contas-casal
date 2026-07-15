// Vercel Cron (Node runtime): every evening, push "pay X tomorrow" to every
// subscribed device. Needs on Vercel: SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys) and optionally
// CRON_SECRET (recommended) + VAPID_SUBJECT (mailto:you@example.com).
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { occurrenceDates } from '../src/lib/schedule'
import { addDays } from '../src/lib/dates'
import type { Item } from '../src/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapItem(r: any): Item {
  return {
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
  }
}

export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const vapidPublic = process.env.VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  if (!url || !serviceKey || !vapidPublic || !vapidPrivate) {
    return res.status(501).json({ error: 'not-configured' })
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:noreply@contas-casal.app', vapidPublic, vapidPrivate)

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: subs, error } = await sb.from('push_subscriptions').select('*')
  if (error) return res.status(500).json({ error: error.message })

  // Optional email channel (Resend): recipients come from each household's
  // settings (Ajustes -> Notificações -> E-mails de aviso).
  const resendKey = process.env.RESEND_API_KEY
  const emailFrom = process.env.RESEND_FROM || 'Contas do Casal <onboarding@resend.dev>'
  const emailsByUser = new Map<string, string[]>()
  if (resendKey) {
    const { data: settingsRows } = await sb.from('app_settings').select('user_id,data')
    for (const row of settingsRows ?? []) {
      const emails = Array.isArray(row?.data?.notifyEmails)
        ? row.data.notifyEmails.filter((e: unknown) => typeof e === 'string' && e.includes('@'))
        : []
      if (emails.length > 0) emailsByUser.set(row.user_id, emails)
    }
  }

  if ((!subs || subs.length === 0) && emailsByUser.size === 0) return res.status(200).json({ sent: 0 })

  // The couple lives in Australia — "tomorrow" is Sydney's tomorrow.
  const sydneyToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())
  const tomorrow = addDays(sydneyToday, 1)

  const byUser = new Map<string, any[]>()
  for (const s of subs ?? []) {
    const list = byUser.get(s.user_id) ?? []
    list.push(s)
    byUser.set(s.user_id, list)
  }

  let sent = 0
  let emailed = 0
  const dead: string[] = []
  const userIds = new Set<string>([...byUser.keys(), ...emailsByUser.keys()])

  for (const userId of userIds) {
    const userSubs = byUser.get(userId) ?? []
    const [items, payments] = await Promise.all([
      sb.from('items').select('*').eq('user_id', userId).eq('archived', false),
      sb.from('payments').select('item_id,due_date').eq('user_id', userId),
    ])
    const paid = new Set((payments.data ?? []).map((p: any) => `${p.item_id}|${p.due_date}`))

    const due: { item: Item; date: string }[] = []
    for (const row of items.data ?? []) {
      const item = mapItem(row)
      for (const { date } of occurrenceDates(item, tomorrow, tomorrow)) {
        if (!paid.has(`${item.id}|${date}`)) due.push({ item, date })
      }
    }
    if (due.length === 0) continue

    const emails = emailsByUser.get(userId)
    if (resendKey && emails && emails.length > 0) {
      const fmtAud = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'AUD' })
      const fmtBrl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const rows = due
        .map(
          ({ item }) =>
            `<li style="margin:4px 0"><b>${esc(item.name)}</b> — ${(item.currency === 'BRL' ? fmtBrl : fmtAud).format(item.amount)}</li>`
        )
        .join('')
      const subject =
        due.length === 1 ? `💸 ${due[0].item.name} vence amanhã` : `💸 ${due.length} contas vencem amanhã`
      const html = `<p>Oi! Amanhã (${tomorrow.split('-').reverse().join('/')}) vence${due.length > 1 ? 'm' : ''}:</p><ul>${rows}</ul><p style="color:#888;font-size:12px">Enviado pelo Contas do Casal 💞</p>`
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from: emailFrom, to: emails, subject, html }),
        })
        if (r.ok) emailed++
      } catch {
        /* email failure must never block the pushes */
      }
    }

    for (const sub of userSubs) {
      const lang = sub.lang === 'en' ? 'en' : 'pt'
      const fmt = new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-AU', { style: 'currency', currency: 'AUD' })
      const fmtBrl = new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-AU', { style: 'currency', currency: 'BRL' })
      const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }
      for (const { item, date } of due) {
        const money = (item.currency === 'BRL' ? fmtBrl : fmt).format(item.amount)
        const body =
          lang === 'pt' ? `Pagar ${item.name} amanhã — ${money}` : `Pay ${item.name} tomorrow — ${money}`
        try {
          await webpush.sendNotification(
            subscription,
            JSON.stringify({ title: '💸 Contas do Casal', body, tag: `${item.id}|${date}` })
          )
          sent++
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(sub.endpoint)
          break
        }
      }
    }
  }

  if (dead.length > 0) await sb.from('push_subscriptions').delete().in('endpoint', dead)
  return res.status(200).json({ sent, emailed, tomorrow })
}
