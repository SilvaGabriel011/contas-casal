import { useMemo, useState } from 'react'
import type { Currency } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay } from '../lib/i18n'
import { formatMoney, formatMoneyShort, CURRENCY_FLAG } from '../lib/money'
import { categoryEmoji, categoryLabel } from '../lib/categories'
import { personName, ownerLabel } from '../lib/owners'
import { expensesFor, monthOf, shiftMonth } from '../lib/expenses'
import { endOfMonth, todayISO } from '../lib/dates'
import { buildOccurrences, incomeDates } from '../lib/schedule'
import { KIND_CONFIG } from '../lib/kinds'
import { EmptyState } from '../components/ui'

type Dir = 'in' | 'out' | 'move'
type Tone = 'good' | 'bad' | 'dim'

interface Ev {
  key: string
  date: string
  emoji: string
  title: string
  sub: string
  badge?: { text: string; tone: Tone }
  amount: number
  currency: Currency
  dir: Dir
  // Not realized yet (unpaid bill, payday still to come) — dimmed and kept
  // out of the "in/out" totals, summed into "still this month" instead.
  future: boolean
  extra?: string
}

const BADGE_CLS: Record<Tone, string> = {
  good: 'bg-good/10 text-good',
  bad: 'bg-bad/10 text-bad',
  dim: 'bg-card2 text-ink2',
}

export function HistoryScreen() {
  const { snapshot } = useAppData()
  const { t, locale } = useI18n()
  const today = todayISO()
  const [month, setMonth] = useState(() => monthOf(today))

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
    return label.charAt(0).toUpperCase() + label.slice(1)
  }, [month, locale])

  const events = useMemo<Ev[]>(() => {
    const first = `${month}-01`
    const last = endOfMonth(first)
    const out: Ev[] = []

    for (const e of expensesFor(snapshot.expenses, month, 'shared')) {
      out.push({
        key: `e-${e.id}`,
        date: e.date,
        emoji: categoryEmoji(e.category, snapshot.settings),
        title: e.note || categoryLabel(e.category, snapshot.settings, t),
        sub: [categoryLabel(e.category, snapshot.settings, t), e.paidBy && personName(e.paidBy, snapshot.settings)]
          .filter(Boolean)
          .join(' · '),
        amount: e.amount,
        currency: e.currency,
        dir: 'out',
        future: false,
      })
    }

    for (const o of buildOccurrences(snapshot.items, snapshot.payments, first, last)) {
      const inst =
        o.item.kind === 'installment' && o.item.installmentsTotal
          ? ` · ${o.index + 1}/${o.item.installmentsTotal}`
          : ''
      const paid = Boolean(o.payment)
      out.push({
        key: `o-${o.item.id}-${o.dueDate}`,
        date: o.dueDate,
        emoji: KIND_CONFIG[o.item.kind].emoji,
        title: o.item.name + inst,
        sub: [categoryLabel(o.item.category, snapshot.settings, t), o.payment?.paidBy && personName(o.payment.paidBy, snapshot.settings)]
          .filter(Boolean)
          .join(' · '),
        badge: paid
          ? { text: `✓ ${t('histPaid')}`, tone: 'good' }
          : o.dueDate < today
            ? { text: t('histOpen'), tone: 'bad' }
            : { text: t('histUpcoming'), tone: 'dim' },
        amount: o.payment?.amount ?? o.item.amount,
        currency: o.item.currency,
        dir: 'out',
        future: !paid,
      })
    }

    for (const inc of snapshot.incomes) {
      if (!inc.active) continue
      // The cadence extrapolates backwards from the anchor; don't invent
      // paydays for months before the income existed in the app.
      if (month < monthOf(inc.createdAt) && month < monthOf(inc.nextDate)) continue
      for (const date of incomeDates(inc, first, last)) {
        const future = date > today
        out.push({
          key: `i-${inc.id}-${date}`,
          date,
          emoji: '💰',
          title: inc.name,
          sub: ownerLabel(inc.owner, snapshot.settings, t),
          badge: future ? { text: t('histToReceive'), tone: 'dim' } : undefined,
          amount: inc.amount,
          currency: inc.currency,
          dir: 'in',
          future,
        })
      }
    }

    for (const tr of snapshot.transfers) {
      if (monthOf(tr.date) !== month) continue
      out.push({
        key: `t-${tr.id}`,
        date: tr.date,
        emoji: '✈️',
        title: t('histTransfer'),
        sub: tr.note ?? '',
        amount: tr.audSent,
        currency: 'AUD',
        dir: 'move',
        future: false,
        extra: `→ ${formatMoney(tr.brlReceived, 'BRL', locale)}`,
      })
    }

    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.key.localeCompare(b.key)))
    return out
  }, [snapshot, month, today, t, locale])

  const totals = useMemo(() => {
    const zero = (): Record<Currency, number> => ({ AUD: 0, BRL: 0 })
    const realizedIn = zero()
    const realizedOut = zero()
    const comingIn = zero()
    const comingOut = zero()
    for (const ev of events) {
      if (ev.dir === 'move') continue
      const bucket = ev.dir === 'in' ? (ev.future ? comingIn : realizedIn) : ev.future ? comingOut : realizedOut
      bucket[ev.currency] += ev.amount
    }
    return { realizedIn, realizedOut, comingIn, comingOut }
  }, [events])

  const byDay = useMemo(() => {
    const map = new Map<string, Ev[]>()
    for (const ev of events) {
      const arr = map.get(ev.date) ?? []
      arr.push(ev)
      map.set(ev.date, arr)
    }
    return [...map.entries()]
  }, [events])

  const stillParts = (['AUD', 'BRL'] as Currency[]).flatMap((c) => [
    ...(totals.comingIn[c] > 0 ? [`+${formatMoneyShort(totals.comingIn[c], c, locale)}`] : []),
    ...(totals.comingOut[c] > 0 ? [`−${formatMoneyShort(totals.comingOut[c], c, locale)}`] : []),
  ])

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('menuHistory')}</h1>
      </header>

      <div className="flex items-center justify-between rounded-2xl border border-line bg-card px-2 py-1.5">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="press px-3 py-1 text-lg font-bold text-ink2">
          ‹
        </button>
        <span className="text-[14px] font-bold text-ink">{monthLabel}</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="press px-3 py-1 text-lg font-bold text-ink2">
          ›
        </button>
      </div>

      <div className="anim-rise grid grid-cols-2 gap-3">
        <TotalCard label={`💰 ${t('histIn')}`} totals={totals.realizedIn} sign="+" cls="text-good" locale={locale} />
        <TotalCard label={`💸 ${t('histOut')}`} totals={totals.realizedOut} sign="−" cls="text-ink" locale={locale} />
      </div>

      {stillParts.length > 0 && (
        <p className="anim-rise num rounded-2xl border border-line bg-card2 px-4 py-3 text-[12px] font-semibold text-ink2">
          📅 {t('histToCome')}: {stillParts.join(' · ')}
        </p>
      )}

      {byDay.length === 0 ? (
        <EmptyState emoji="🗓️" title={t('histEmptyTitle')} body={t('histEmptyBody')} />
      ) : (
        <div className="space-y-3">
          {byDay.map(([date, list], gi) => (
            <div key={date} className="anim-rise" style={{ animationDelay: `${Math.min(gi * 50, 350)}ms` }}>
              <p className="mb-1 px-1 text-[12px] font-bold text-ink2">{formatDay(date, locale)}</p>
              <div className="divide-y divide-line rounded-2xl border border-line bg-card">
                {list.map((ev) => (
                  <div
                    key={ev.key}
                    className={`flex w-full items-center gap-3 px-4 py-3 ${ev.future ? 'opacity-60' : ''}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card2 text-xl">
                      {ev.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">{ev.title}</span>
                      <span className="flex items-center gap-1.5 text-[12px] text-ink2">
                        {ev.sub && <span className="truncate">{ev.sub}</span>}
                        {ev.badge && (
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${BADGE_CLS[ev.badge.tone]}`}
                          >
                            {ev.badge.text}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={`num block text-[15px] font-bold ${ev.dir === 'in' ? 'text-good' : 'text-ink'}`}
                      >
                        {ev.dir === 'in' ? '+' : ''}
                        {formatMoney(ev.amount, ev.currency, locale)}
                      </span>
                      {ev.extra && <span className="num block text-[11px] text-ink2">{ev.extra}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TotalCard({
  label,
  totals,
  sign,
  cls,
  locale,
}: {
  label: string
  totals: Record<Currency, number>
  sign: string
  cls: string
  locale: string
}) {
  const entries = (['AUD', 'BRL'] as Currency[]).filter((c) => totals[c] > 0)
  return (
    <div className="rounded-3xl border border-line bg-card p-4">
      <p className="text-[12px] font-semibold text-ink2">{label}</p>
      {entries.length === 0 ? (
        <p className="num mt-1 text-[20px] font-extrabold text-ink2">—</p>
      ) : (
        entries.map((c) => (
          <p key={c} className={`num mt-1 text-[18px] leading-tight font-extrabold ${cls}`}>
            {CURRENCY_FLAG[c]} {sign}
            {formatMoneyShort(totals[c], c, locale)}
          </p>
        ))
      )}
    </div>
  )
}
