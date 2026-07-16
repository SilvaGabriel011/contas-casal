import { useMemo } from 'react'
import type { Currency } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay } from '../lib/i18n'
import { formatMoneyShort } from '../lib/money'
import { todayISO } from '../lib/dates'
import { committedFlow, dailyAllowance } from '../lib/forecast'

const W = 300
const H = 54

// "Month runway": how much per day the couple can spend and still close the
// month at zero, plus the shape of the committed cash ahead.
export function ForecastCard() {
  const { snapshot } = useAppData()
  const { t, locale } = useI18n()
  const today = todayISO()

  const { currency, allowance } = useMemo(() => {
    for (const c of ['AUD', 'BRL'] as Currency[]) {
      const a = dailyAllowance(snapshot, today, c)
      if (a) return { currency: c, allowance: a }
    }
    return { currency: 'AUD' as Currency, allowance: null }
  }, [snapshot, today])

  const flow = useMemo(() => committedFlow(snapshot, today, currency), [snapshot, today, currency])

  if (!allowance) return null

  const hasEvents = flow.some((f) => f.net !== 0)
  const min = flow.reduce((best, f) => (f.cum < best.cum ? f : best), flow[0])
  const max = Math.max(...flow.map((f) => f.cum), 0)
  const lo = Math.min(...flow.map((f) => f.cum), 0)
  const span = Math.max(max - lo, 1)
  const x = (i: number) => (flow.length > 1 ? (i / (flow.length - 1)) * W : 0)
  const y = (v: number) => 4 + (1 - (v - lo) / span) * (H - 8)
  const path = flow.map((f, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(f.cum).toFixed(1)}`).join(' ')

  return (
    <section className="anim-rise rounded-3xl border border-line bg-card p-4">
      <h2 className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
        📉 {t('forecastTitle')}
      </h2>
      {allowance.leftover >= 0 ? (
        <>
          <p className="num mt-1 text-[26px] leading-tight font-extrabold text-ink">
            {formatMoneyShort(allowance.perDay, currency, locale)}
            <span className="ml-1 text-[14px] font-semibold text-ink2">{t('forecastPerDay')}</span>
          </p>
          <p className="num text-[12px] font-semibold text-ink2">
            {t('forecastSub', {
              n: allowance.daysLeft,
              v: formatMoneyShort(allowance.leftover, currency, locale),
            })}
          </p>
        </>
      ) : (
        <p className="mt-1 text-[15px] leading-snug font-bold text-bad">
          {t('forecastOver', { v: formatMoneyShort(-allowance.leftover, currency, locale) })}
        </p>
      )}

      {hasEvents && (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={t('forecastTitle')}>
            <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth={1} strokeDasharray="4 4" />
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
            {min.cum < 0 && (
              <circle cx={x(flow.indexOf(min))} cy={y(min.cum)} r={3.5} fill="var(--bad)" />
            )}
          </svg>
          {min.cum < 0 && (
            <p className="num text-[11px] font-semibold text-ink2">
              ⚠️ {t('forecastDip', { v: formatMoneyShort(min.cum, currency, locale), date: formatDay(min.date, locale) })}
            </p>
          )}
        </>
      )}
    </section>
  )
}
