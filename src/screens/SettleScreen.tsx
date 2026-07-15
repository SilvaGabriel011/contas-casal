import { useMemo, useState } from 'react'
import type { Currency } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay } from '../lib/i18n'
import { formatMoney, formatMoneyShort, CURRENCY_FLAG } from '../lib/money'
import { personName } from '../lib/owners'
import { monthOf, shiftMonth } from '../lib/expenses'
import { settleMonth } from '../lib/settle'
import { todayISO } from '../lib/dates'
import { EmptyState } from '../components/ui'

export function SettleScreen() {
  const { snapshot, saveSettings } = useAppData()
  const { t, locale } = useI18n()
  const [month, setMonth] = useState(() => monthOf(todayISO()))

  const { entries, net } = useMemo(() => settleMonth(snapshot, month), [snapshot, month])
  const settled = (snapshot.settings.settledMonths ?? []).includes(month)

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
  }, [month, locale])

  const toggleSettled = async () => {
    const list = snapshot.settings.settledMonths ?? []
    await saveSettings({
      ...snapshot.settings,
      settledMonths: settled ? list.filter((m) => m !== month) : [...list, month],
    })
  }

  const debts = (['AUD', 'BRL'] as Currency[])
    .map((c) => ({ currency: c, value: net[c] ?? 0 }))
    .filter((d) => Math.abs(d.value) >= 0.01)

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('settleTitle')}</h1>
      </header>

      <div className="flex items-center justify-between rounded-2xl border border-line bg-card px-2 py-1.5">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="press px-3 py-1 text-lg font-bold text-ink2">
          ‹
        </button>
        <span className="text-[14px] font-bold text-ink capitalize">{monthLabel}</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="press px-3 py-1 text-lg font-bold text-ink2">
          ›
        </button>
      </div>

      <div className={`anim-rise rounded-3xl p-5 text-white shadow-lg ${settled ? 'bg-good' : 'grad-accent'}`}>
        {settled && <p className="mb-1 text-[12px] font-bold tracking-wide uppercase">{t('settleDoneBadge')}</p>}
        {debts.length === 0 ? (
          <p className="text-[20px] font-extrabold">{t('settleAllSquare')}</p>
        ) : (
          debts.map(({ currency, value }) => {
            const debtor = value > 0 ? personName('b', snapshot.settings) : personName('a', snapshot.settings)
            const creditor = value > 0 ? personName('a', snapshot.settings) : personName('b', snapshot.settings)
            return (
              <p key={currency} className="num text-[19px] leading-snug font-extrabold">
                {CURRENCY_FLAG[currency]}{' '}
                {t('settleOwes', {
                  debtor,
                  creditor,
                  amount: formatMoneyShort(Math.abs(value), currency, locale),
                })}
              </p>
            )
          })
        )}
        {(debts.length > 0 || entries.length > 0) && (
          <button
            onClick={toggleSettled}
            className="press mt-3 w-full rounded-2xl bg-white/20 py-2.5 text-[13px] font-bold"
          >
            {settled ? t('settleUndo') : t('settleMarkDone')}
          </button>
        )}
      </div>

      <p className="px-1 text-[12px] leading-relaxed text-ink2">💡 {t('settleHint')}</p>

      {entries.length === 0 ? (
        <EmptyState emoji="🤝" title={t('settleAllSquare')} />
      ) : (
        <div className={`divide-y divide-line rounded-2xl border border-line bg-card ${settled ? 'opacity-55' : ''}`}>
          {entries.map((e, i) => (
            <div
              key={`${e.label}-${e.date}-${i}`}
              className="anim-rise flex items-center gap-3 px-4 py-3"
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card2 text-[13px] font-bold text-ink">
                {personName(e.payer, snapshot.settings)[0]?.toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-ink">
                  {t('settlePaidFor', {
                    payer: personName(e.payer, snapshot.settings),
                    label: e.owner === 'shared' ? t('settleHalfOf', { name: e.label }) : e.label,
                  })}
                </span>
                <span className="block text-[12px] text-ink2">{formatDay(e.date, locale)}</span>
              </span>
              <span className={`num shrink-0 text-[14px] font-bold ${e.amount > 0 ? 'text-good' : 'text-accent'}`}>
                {e.amount > 0 ? '→' : '←'} {formatMoney(Math.abs(e.amount), e.currency, locale)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
