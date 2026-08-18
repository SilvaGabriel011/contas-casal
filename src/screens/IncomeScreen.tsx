import { useMemo } from 'react'
import type { Currency, Income, Profile } from '../types'
import { FREQ_EVERY } from '../lib/kinds'
import { ownerLabel } from '../lib/owners'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay } from '../lib/i18n'
import { formatMoney, formatMoneyShort, CURRENCY_FLAG } from '../lib/money'
import { addDays, endOfMonth, startOfMonth, todayISO } from '../lib/dates'
import { hourlyInfo, incomeDates, incomeInMonth, nextIncomeDate, visibleToProfile } from '../lib/schedule'
import { monthOf } from '../lib/expenses'
import { useCountUp } from '../lib/useCountUp'
import { ProfileSwitcher } from '../components/ProfileSwitcher'
import { EmptyState } from '../components/ui'

interface CurrencyStats {
  currency: Currency
  monthTotal: number
  received: number
  coming: number
  avgHourly: number | null
}

function StatCard({ stats: s }: { stats: CurrencyStats }) {
  const { t, locale } = useI18n()
  const animatedTotal = useCountUp(s.monthTotal)
  const animatedReceived = useCountUp(s.received)
  const animatedComing = useCountUp(s.coming)
  return (
    <div className="anim-rise rounded-3xl border border-line bg-card p-5 min-[430px]:p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-semibold text-ink2">{t('incomeTotalMonth')}</p>
        {s.avgHourly !== null && (
          <span className="num rounded-full bg-card2 px-2.5 py-1 text-[12px] font-bold text-ink">
            ⏱️ {formatMoney(s.avgHourly, s.currency, locale)} {t('avgPerHour')}
          </span>
        )}
      </div>
      <p className="num mt-1 text-[28px] leading-tight font-extrabold text-ink min-[430px]:text-[32px]">
        {CURRENCY_FLAG[s.currency]} {formatMoneyShort(animatedTotal, s.currency, locale)}
      </p>
      <div className="mt-3 flex gap-2">
        <div className="flex-1 rounded-2xl bg-good/10 px-3 py-2.5">
          <p className="text-[11px] font-bold tracking-wide text-good uppercase">✓ {t('receivedSoFar')}</p>
          <p className="num mt-0.5 text-[15px] font-extrabold text-ink">
            {formatMoneyShort(animatedReceived, s.currency, locale)}
          </p>
        </div>
        <div className="flex-1 rounded-2xl bg-card2 px-3 py-2.5">
          <p className="text-[11px] font-bold tracking-wide text-ink2 uppercase">⏳ {t('stillComing')}</p>
          <p className="num mt-0.5 text-[15px] font-extrabold text-ink">
            {formatMoneyShort(animatedComing, s.currency, locale)}
          </p>
        </div>
      </div>
    </div>
  )
}

export function IncomeScreen({
  profile,
  onProfile,
  onEditIncome,
}: {
  profile: Profile
  onProfile: (p: Profile) => void
  onEditIncome: (income: Income) => void
}) {
  const { snapshot } = useAppData()
  const { t, locale } = useI18n()
  const today = todayISO()

  const incomes = useMemo(
    () =>
      snapshot.incomes
        .filter((i) => visibleToProfile(i.owner, profile))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [snapshot.incomes, profile]
  )
  const activeIncomes = useMemo(() => incomes.filter((i) => i.active), [incomes])

  const stats = useMemo<CurrencyStats[]>(() => {
    const monthStart = startOfMonth(today)
    const monthEnd = endOfMonth(today)
    return (['AUD', 'BRL'] as Currency[])
      .map((currency) => {
        const list = activeIncomes.filter((i) => i.currency === currency)
        if (!list.length) return null
        let monthTotal = 0
        let received = 0
        let coming = 0
        let hourlyPaySum = 0
        let hourlyHoursSum = 0
        for (const income of list) {
          monthTotal += incomeInMonth(income, monthOf(today))
          received += incomeDates(income, monthStart, today).length * income.amount
          coming += incomeDates(income, addDays(today, 1), monthEnd).length * income.amount
          const hourly = hourlyInfo(income)
          if (hourly && income.hourlyRate) {
            hourlyPaySum += income.hourlyRate * hourly.hoursPerWeek
            hourlyHoursSum += hourly.hoursPerWeek
          }
        }
        return {
          currency,
          monthTotal,
          received,
          coming,
          avgHourly: hourlyHoursSum > 0 ? hourlyPaySum / hourlyHoursSum : null,
        }
      })
      .filter((s): s is CurrencyStats => s !== null)
  }, [activeIncomes, today])

  const upcomingPays = useMemo(() => {
    const out: { date: string; income: Income }[] = []
    for (const income of activeIncomes) {
      for (const date of incomeDates(income, today, addDays(today, 30))) {
        out.push({ date, income })
      }
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(0, 8)
  }, [activeIncomes, today])

  const ownerName = (income: Income) => ownerLabel(income.owner, snapshot.settings, t)

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('incomesTitle')}</h1>
      </header>

      <ProfileSwitcher profile={profile} onChange={onProfile} />

      {stats.map((s) => (
        <StatCard key={s.currency} stats={s} />
      ))}

      {upcomingPays.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
            📆 {t('nextPays')}
          </h2>
          <div className="divide-y divide-line rounded-2xl border border-line bg-card">
            {upcomingPays.map(({ date, income }, i) => (
              <div
                key={`${income.id}|${date}`}
                className="anim-rise flex items-center gap-3 px-4 py-2.5"
                style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">
                    {income.name} <span className="font-normal text-ink2">· {ownerName(income)}</span>
                  </span>
                  <span className="block text-[12px] text-ink2">{formatDay(date, locale)}</span>
                </span>
                <span className="num shrink-0 text-[14px] font-bold text-good">
                  +{formatMoneyShort(income.amount, income.currency, locale)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {incomes.length === 0 ? (
        <EmptyState emoji="💸" title={t('noIncomes')} body={t('emptyHomeBody')} />
      ) : (
        <div className="divide-y divide-line rounded-2xl border border-line bg-card">
          {incomes.map((income, idx) => {
            const next = nextIncomeDate(income, today)
            const hourly = hourlyInfo(income)
            return (
              <button
                key={income.id}
                onClick={() => onEditIncome(income)}
                className={`anim-rise flex w-full items-center gap-3 px-4 py-3.5 text-left ${income.active ? '' : 'opacity-55'}`}
                style={{ animationDelay: `${Math.min(idx * 35, 300)}ms` }}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card2 text-xl">
                  {hourly ? '⏱️' : '💰'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold text-ink">{income.name}</span>
                    <span className="text-xs">{CURRENCY_FLAG[income.currency]}</span>
                    {!income.active && (
                      <span className="rounded-full bg-card2 px-1.5 py-px text-[10px] font-bold text-ink2">
                        {t('inactive')}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-ink2">
                    {income.frequency === 'once'
                      ? `${t(FREQ_EVERY[income.frequency])} · ${ownerName(income)} · ${formatDay(income.nextDate, locale)}`
                      : `${t(FREQ_EVERY[income.frequency])} · ${ownerName(income)} · ${t('nextOn')} ${formatDay(next, locale)}`}
                  </span>
                  {hourly && income.hourlyRate && (
                    <span className="num mt-0.5 block text-[12px] font-semibold text-ink2">
                      {t('hourlySummary', {
                        h: hourly.hoursPerWeek,
                        r: `${formatMoney(income.hourlyRate, income.currency, locale)}/h`,
                      })}
                    </span>
                  )}
                </span>
                <span className="num shrink-0 text-[15px] font-bold text-good">
                  +{formatMoney(income.amount, income.currency, locale)}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
