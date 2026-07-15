import { useMemo, useState } from 'react'
import type { Currency } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n } from '../lib/i18n'
import { formatMoneyShort } from '../lib/money'
import { categoryEmoji, categoryLabel } from '../lib/categories'
import { ownerLabel, personName } from '../lib/owners'
import { lastMonths, outflowByMonth, categoryBreakdown, personBreakdown } from '../lib/reports'
import { coupleBalance } from '../lib/insights'
import { EmptyState, Segmented } from '../components/ui'

const W = 320
const H = 150
const PAD_BOTTOM = 22
const PLOT_H = H - PAD_BOTTOM

// Bar with a 4px-rounded top end, anchored to the baseline.
function topRoundedRect(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return ''
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

export function ReportsScreen() {
  const { snapshot } = useAppData()
  const { t, locale } = useI18n()
  const [currency, setCurrency] = useState<Currency>('AUD')
  const months = useMemo(() => lastMonths(6), [])
  const [selected, setSelected] = useState(months[months.length - 1])

  const series = useMemo(() => outflowByMonth(snapshot, currency, months), [snapshot, currency, months])
  const max = Math.max(...series.map((m) => m.bills + m.spending), 1)
  const cats = useMemo(() => categoryBreakdown(snapshot, currency, selected).slice(0, 8), [snapshot, currency, selected])
  const people = useMemo(() => personBreakdown(snapshot, currency, selected), [snapshot, currency, selected])
  const balance = useMemo(() => coupleBalance(snapshot, selected), [snapshot, selected])
  const hasAny = series.some((m) => m.bills + m.spending > 0)
  const hasBalance =
    balance.income.a[currency] + balance.income.b[currency] > 0 ||
    balance.spending.a[currency] + balance.spending.b[currency] > 0

  const monthShort = (m: string) => {
    const [y, mo] = m.split('-').map(Number)
    const s = new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(y, mo - 1, 1))
    return s.replace('.', '')
  }
  const monthLong = (m: string) => {
    const [y, mo] = m.split('-').map(Number)
    const s = new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(y, mo - 1, 1))
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  const slot = W / series.length
  const barW = Math.min(30, slot - 14)
  const sel = series.find((m) => m.month === selected)
  const catMax = Math.max(...cats.map((c) => c.total), 1)
  const peopleMax = Math.max(...people.map((p) => p.total), 1)

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('reportsTitle')}</h1>
      </header>

      <Segmented<Currency>
        options={[
          { value: 'AUD', label: '🇦🇺 AUD' },
          { value: 'BRL', label: '🇧🇷 BRL' },
        ]}
        value={currency}
        onChange={setCurrency}
      />

      {!hasAny ? (
        <EmptyState emoji="📊" title={t('reportEmpty')} />
      ) : (
        <>
          <section className="anim-rise rounded-3xl border border-line bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
                📈 {t('last6Months')}
              </h2>
              <div className="flex gap-3 text-[11px] font-semibold text-ink2">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'var(--chart-1)' }} />
                  {t('seriesBills')}
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'var(--chart-2)' }} />
                  {t('seriesSpending')}
                </span>
              </div>
            </div>

            <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={t('last6Months')}>
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={f}
                  x1={0}
                  x2={W}
                  y1={PLOT_H * f}
                  y2={PLOT_H * f}
                  stroke="var(--line)"
                  strokeWidth={1}
                />
              ))}
              <line x1={0} x2={W} y1={PLOT_H} y2={PLOT_H} stroke="var(--line)" strokeWidth={1} />
              {series.map((m, i) => {
                const x = i * slot + (slot - barW) / 2
                const hBills = (m.bills / max) * (PLOT_H - 8)
                const hSpend = (m.spending / max) * (PLOT_H - 8)
                const ySpendTop = PLOT_H - hBills - (hBills > 0 && hSpend > 0 ? 2 : 0) - hSpend
                const isSel = m.month === selected
                return (
                  <g key={m.month} onClick={() => setSelected(m.month)} style={{ cursor: 'pointer' }}>
                    <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
                    {isSel && (
                      <rect
                        x={x - 4}
                        y={2}
                        width={barW + 8}
                        height={PLOT_H - 2}
                        rx={8}
                        fill="var(--card-2)"
                      />
                    )}
                    {m.bills > 0 && (
                      <rect
                        x={x}
                        y={PLOT_H - hBills}
                        width={barW}
                        height={hBills}
                        fill="var(--chart-1)"
                        rx={hSpend > 0 ? 0 : 3}
                      />
                    )}
                    {m.spending > 0 && (
                      <path d={topRoundedRect(x, ySpendTop, barW, hSpend, 4)} fill="var(--chart-2)" />
                    )}
                    <text
                      x={i * slot + slot / 2}
                      y={H - 6}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={isSel ? 800 : 600}
                      fill={isSel ? 'var(--ink)' : 'var(--ink-2)'}
                    >
                      {monthShort(m.month)}
                    </text>
                  </g>
                )
              })}
            </svg>

            {sel && (
              <p className="num mt-1 text-center text-[13px] font-semibold text-ink">
                {monthLong(selected)}: {formatMoneyShort(sel.bills, currency, locale)} {t('seriesBills').toLowerCase()}{' '}
                + {formatMoneyShort(sel.spending, currency, locale)} {t('seriesSpending').toLowerCase()} ={' '}
                <span className="font-extrabold">{formatMoneyShort(sel.bills + sel.spending, currency, locale)}</span>
              </p>
            )}
          </section>

          <section className="anim-rise rounded-3xl border border-line bg-card p-4">
            <h2 className="mb-3 text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
              🗂️ {t('byCategory')} · {monthLong(selected)}
            </h2>
            {cats.length === 0 ? (
              <p className="text-[13px] text-ink2">{t('reportEmpty')}</p>
            ) : (
              <div className="space-y-2.5">
                {cats.map((c) => (
                  <div key={c.category} className="flex items-center gap-2">
                    <span className="w-7 text-center text-[15px]">{categoryEmoji(c.category, snapshot.settings)}</span>
                    <span className="w-24 shrink-0 truncate text-[12px] font-semibold text-ink">
                      {categoryLabel(c.category, snapshot.settings, t)}
                    </span>
                    <div className="h-3.5 min-w-0 flex-1 overflow-hidden rounded-full bg-card2">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${(c.total / catMax) * 100}%`, background: 'var(--chart-1)' }}
                      />
                    </div>
                    <span className="num w-20 shrink-0 text-right text-[12px] font-bold text-ink">
                      {formatMoneyShort(c.total, currency, locale)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="anim-rise rounded-3xl border border-line bg-card p-4">
            <h2 className="mb-3 text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
              👥 {t('byPerson')} · {monthLong(selected)}
            </h2>
            {people.length === 0 ? (
              <p className="text-[13px] text-ink2">{t('reportEmpty')}</p>
            ) : (
              <div className="space-y-2.5">
                {people.map((p) => (
                  <div key={p.owner} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 truncate text-[12px] font-semibold text-ink">
                      {ownerLabel(p.owner, snapshot.settings, t)}
                    </span>
                    <div className="h-3.5 min-w-0 flex-1 overflow-hidden rounded-full bg-card2">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${(p.total / peopleMax) * 100}%`, background: 'var(--chart-2)' }}
                      />
                    </div>
                    <span className="num w-20 shrink-0 text-right text-[12px] font-bold text-ink">
                      {formatMoneyShort(p.total, currency, locale)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {hasBalance && (
        <section className="anim-rise rounded-3xl border border-line bg-card p-4">
          <h2 className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
            💞 {t('coupleBalanceTitle')} · {monthLong(selected)}
          </h2>
          <p className="mt-0.5 text-[12px] text-ink2">{t('coupleBalanceHint')}</p>
          <DuoBar
            label={t('cbIncome')}
            a={balance.income.a[currency]}
            b={balance.income.b[currency]}
            nameA={personName('a', snapshot.settings)}
            nameB={personName('b', snapshot.settings)}
            currency={currency}
            locale={locale}
          />
          <DuoBar
            label={t('cbSpending')}
            a={balance.spending.a[currency]}
            b={balance.spending.b[currency]}
            nameA={personName('a', snapshot.settings)}
            nameB={personName('b', snapshot.settings)}
            currency={currency}
            locale={locale}
          />
        </section>
      )}
    </div>
  )
}

// One bar, two soft segments — shares of a whole, never a ranking.
function DuoBar({
  label,
  a,
  b,
  nameA,
  nameB,
  currency,
  locale,
}: {
  label: string
  a: number
  b: number
  nameA: string
  nameB: string
  currency: Currency
  locale: string
}) {
  const total = a + b
  if (total <= 0) return null
  const pctA = Math.round((a / total) * 100)
  return (
    <div className="mt-3.5">
      <p className="text-[12px] font-semibold text-ink2">{label}</p>
      <div className="mt-1.5 flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full bg-card2">
        <div
          className="h-full rounded-l-full transition-all duration-500"
          style={{ width: `${(a / total) * 100}%`, background: 'var(--chart-1)' }}
        />
        <div
          className="h-full rounded-r-full transition-all duration-500"
          style={{ width: `${(b / total) * 100}%`, background: 'var(--chart-2)' }}
        />
      </div>
      <div className="mt-1 flex justify-between gap-2 text-[11px] font-semibold text-ink2">
        <span className="num min-w-0 truncate">
          {nameA} · {formatMoneyShort(a, currency, locale)} ({pctA}%)
        </span>
        <span className="num min-w-0 truncate text-right">
          {nameB} · {formatMoneyShort(b, currency, locale)} ({100 - pctA}%)
        </span>
      </div>
    </div>
  )
}
