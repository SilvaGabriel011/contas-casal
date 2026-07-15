import { useMemo, useState } from 'react'
import type { Currency } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay } from '../lib/i18n'
import { formatMoney, formatMoneyShort, CURRENCY_FLAG } from '../lib/money'
import { categoryEmoji, categoryLabel } from '../lib/categories'
import { monthOf } from '../lib/expenses'
import { todayISO } from '../lib/dates'
import { EmptyState, Segmented } from '../components/ui'

const yearOf = (date: string) => date.slice(0, 4)

export function WrappedScreen() {
  const { snapshot } = useAppData()
  const { t, locale } = useI18n()
  const thisYear = yearOf(todayISO())
  const years = useMemo(() => {
    const set = new Set<string>([thisYear])
    for (const e of snapshot.expenses) set.add(yearOf(e.date))
    for (const p of snapshot.payments) set.add(yearOf(p.dueDate))
    return [...set].sort().reverse().slice(0, 3)
  }, [snapshot, thisYear])
  const [year, setYear] = useState(thisYear)

  const stats = useMemo(() => {
    const items = new Map(snapshot.items.map((i) => [i.id, i]))
    const expenses = snapshot.expenses.filter((e) => yearOf(e.date) === year)
    const payments = snapshot.payments.filter((p) => yearOf(p.dueDate) === year)
    const transfers = snapshot.transfers.filter((tr) => yearOf(tr.date) === year)

    const out: Record<Currency, number> = { AUD: 0, BRL: 0 }
    const byCat = new Map<string, { total: number; currency: Currency }>()
    const byMonth = new Map<string, number>() // AUD-equivalent-free: count both, AUD dominant
    for (const e of expenses) {
      out[e.currency] += e.amount
      const c = byCat.get(e.category)
      if (c && c.currency === e.currency) c.total += e.amount
      else if (!c) byCat.set(e.category, { total: e.amount, currency: e.currency })
      byMonth.set(monthOf(e.date), (byMonth.get(monthOf(e.date)) ?? 0) + (e.currency === 'AUD' ? e.amount : 0))
    }
    for (const p of payments) {
      const item = items.get(p.itemId)
      if (!item) continue
      out[item.currency] += p.amount
      const c = byCat.get(item.category)
      if (c && c.currency === item.currency) c.total += p.amount
      else if (!c) byCat.set(item.category, { total: p.amount, currency: item.currency })
      byMonth.set(monthOf(p.dueDate), (byMonth.get(monthOf(p.dueDate)) ?? 0) + (item.currency === 'AUD' ? p.amount : 0))
    }

    const topCats = [...byCat.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)

    const biggest = expenses.reduce<(typeof expenses)[number] | null>(
      (best, e) => (best === null || e.amount > best.amount ? e : best),
      null
    )

    const monthsRanked = [...byMonth.entries()].filter(([, v]) => v > 0).sort((a, b) => a[1] - b[1])
    const lightMonth = monthsRanked[0] ?? null
    const heavyMonth = monthsRanked[monthsRanked.length - 1] ?? null

    const audSent = transfers.reduce((s, tr) => s + tr.audSent, 0)
    const brlReceived = transfers.reduce((s, tr) => s + tr.brlReceived, 0)

    return {
      out,
      topCats,
      biggest,
      nExpenses: expenses.length,
      nPayments: payments.length,
      transfers: { n: transfers.length, audSent, brlReceived, rate: audSent > 0 ? brlReceived / audSent : null },
      lightMonth,
      heavyMonth,
      hasAny: expenses.length + payments.length + transfers.length > 0,
    }
  }, [snapshot, year])

  const monthName = (m: string) => {
    const [y, mo] = m.split('-').map(Number)
    const s = new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(y, mo - 1, 1))
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  const share = () => {
    const lines = [
      `✨ ${t('menuWrapped')} ${year} — Contas do Casal`,
      ...(['AUD', 'BRL'] as Currency[])
        .filter((c) => stats.out[c] > 0)
        .map((c) => `${CURRENCY_FLAG[c]} ${t('wrapTotalOut')}: ${formatMoney(stats.out[c], c, locale)}`),
      ...stats.topCats.map(
        (c, i) =>
          `${i + 1}. ${categoryLabel(c.category, snapshot.settings, t)} — ${formatMoneyShort(c.total, c.currency, locale)}`
      ),
      t('wrapCounts', { e: stats.nExpenses, p: stats.nPayments }),
    ].join('\n')
    if (navigator.share) navigator.share({ text: lines }).catch(() => {})
    else navigator.clipboard?.writeText(lines)
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">✨ {t('menuWrapped')}</h1>
      </header>

      {years.length > 1 && (
        <Segmented options={years.map((y) => ({ value: y, label: y }))} value={year} onChange={setYear} />
      )}

      {!stats.hasAny ? (
        <EmptyState emoji="🎁" title={t('wrapEmptyTitle')} body={t('wrapEmptyBody')} />
      ) : (
        <div className="space-y-3">
          <section className="anim-rise grad-accent rounded-3xl p-5 text-white shadow-lg">
            <p className="text-[13px] font-semibold opacity-85">💸 {t('wrapTotalOut')} · {year}</p>
            {(['AUD', 'BRL'] as Currency[])
              .filter((c) => stats.out[c] > 0)
              .map((c) => (
                <p key={c} className="num mt-1 text-[30px] leading-tight font-extrabold">
                  {CURRENCY_FLAG[c]} {formatMoneyShort(stats.out[c], c, locale)}
                </p>
              ))}
            <p className="mt-2 text-[12px] font-semibold opacity-85">
              {t('wrapCounts', { e: stats.nExpenses, p: stats.nPayments })}
            </p>
          </section>

          {stats.topCats.length > 0 && (
            <section className="anim-rise rounded-3xl border border-line bg-card p-4" style={{ animationDelay: '80ms' }}>
              <h2 className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">🏆 {t('wrapTopCats')}</h2>
              <div className="mt-2 space-y-2">
                {stats.topCats.map((c, i) => (
                  <div key={c.category} className="flex items-center gap-2.5">
                    <span className="text-[17px]">{['🥇', '🥈', '🥉'][i]}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">
                      {categoryEmoji(c.category, snapshot.settings)}{' '}
                      {categoryLabel(c.category, snapshot.settings, t)}
                    </span>
                    <span className="num text-[14px] font-extrabold text-ink">
                      {formatMoneyShort(c.total, c.currency, locale)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {stats.biggest && (
            <section className="anim-rise rounded-3xl border border-line bg-card p-4" style={{ animationDelay: '160ms' }}>
              <h2 className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">💥 {t('wrapBiggest')}</h2>
              <p className="mt-1.5 text-[15px] font-bold text-ink">
                {categoryEmoji(stats.biggest.category, snapshot.settings)}{' '}
                {stats.biggest.note || categoryLabel(stats.biggest.category, snapshot.settings, t)}
              </p>
              <p className="num text-[13px] font-semibold text-ink2">
                {formatMoney(stats.biggest.amount, stats.biggest.currency, locale)} · {formatDay(stats.biggest.date, locale)}
              </p>
            </section>
          )}

          {(stats.lightMonth || stats.heavyMonth) && (
            <section className="anim-rise grid grid-cols-2 gap-3" style={{ animationDelay: '240ms' }}>
              {stats.lightMonth && (
                <div className="rounded-3xl border border-line bg-card p-4">
                  <p className="text-[12px] font-semibold text-ink2">🌱 {t('wrapLightMonth')}</p>
                  <p className="mt-1 text-[15px] font-extrabold text-ink">{monthName(stats.lightMonth[0])}</p>
                  <p className="num text-[12px] font-semibold text-ink2">
                    {formatMoneyShort(stats.lightMonth[1], 'AUD', locale)}
                  </p>
                </div>
              )}
              {stats.heavyMonth && (
                <div className="rounded-3xl border border-line bg-card p-4">
                  <p className="text-[12px] font-semibold text-ink2">🔥 {t('wrapHeavyMonth')}</p>
                  <p className="mt-1 text-[15px] font-extrabold text-ink">{monthName(stats.heavyMonth[0])}</p>
                  <p className="num text-[12px] font-semibold text-ink2">
                    {formatMoneyShort(stats.heavyMonth[1], 'AUD', locale)}
                  </p>
                </div>
              )}
            </section>
          )}

          {stats.transfers.n > 0 && (
            <section className="anim-rise rounded-3xl border border-line bg-card p-4" style={{ animationDelay: '320ms' }}>
              <h2 className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">✈️ {t('wrapTransfers')}</h2>
              <p className="num mt-1.5 text-[15px] font-bold text-ink">
                {t('wrapTransfersBody', {
                  n: stats.transfers.n,
                  aud: formatMoneyShort(stats.transfers.audSent, 'AUD', locale),
                  brl: formatMoneyShort(stats.transfers.brlReceived, 'BRL', locale),
                })}
              </p>
              {stats.transfers.rate && (
                <p className="num text-[12px] font-semibold text-ink2">
                  {t('wrapAvgRate', { rate: stats.transfers.rate.toFixed(2) })}
                </p>
              )}
            </section>
          )}

          <button
            onClick={share}
            className="press w-full rounded-2xl border border-line bg-card py-3 text-[14px] font-bold text-ink"
          >
            📤 {t('wrapShare')}
          </button>
        </div>
      )}
    </div>
  )
}
