import type { Currency } from '../types'
import { useI18n } from '../lib/i18n'
import { formatMoney, formatMoneyShort, CURRENCY_FLAG } from '../lib/money'
import { useCountUp } from '../lib/useCountUp'
import { ProgressBar } from './ui'

// The month at a glance for one currency. The headline is the estimated
// leftover, followed by the ledger that produces it (income − bills −
// spending), so the number explains itself. Without income the headline
// falls back to the month's bill total.
export function SummaryCard({
  currency,
  monthLabel,
  totalMonth,
  paidMonth,
  incomeMonth,
  expensesMonth = 0,
}: {
  currency: Currency
  monthLabel: string
  totalMonth: number
  paidMonth: number
  incomeMonth: number
  expensesMonth?: number
}) {
  const { t, locale } = useI18n()
  const remaining = Math.max(0, totalMonth - paidMonth)
  const leftover = incomeMonth - totalMonth - expensesMonth
  const hasIncome = incomeMonth > 0
  const hero = hasIncome ? leftover : totalMonth
  const animatedHero = useCountUp(hero)

  const ledger: { emoji: string; label: string; value: string }[] = hasIncome
    ? [
        { emoji: '💵', label: t('sumIncome'), value: `+${formatMoneyShort(incomeMonth, currency, locale)}` },
        ...(totalMonth > 0
          ? [{ emoji: '🧾', label: t('sumBills'), value: `−${formatMoneyShort(totalMonth, currency, locale)}` }]
          : []),
        ...(expensesMonth > 0
          ? [{ emoji: '☕', label: t('sumSpending'), value: `−${formatMoneyShort(expensesMonth, currency, locale)}` }]
          : []),
      ]
    : []

  return (
    <div
      className={`anim-rise relative w-full shrink-0 snap-center overflow-hidden rounded-3xl p-5 text-white shadow-lg shadow-black/15 min-[430px]:p-6 ${
        currency === 'AUD' ? 'grad-aud' : 'grad-brl'
      }`}
    >
      <div className="anim-float-a pointer-events-none absolute -top-14 -right-10 h-44 w-44 rounded-full bg-white/12" />
      <div className="anim-float-b pointer-events-none absolute -bottom-20 -left-8 h-40 w-40 rounded-full bg-black/10" />

      <div className="flex items-center justify-between">
        <span className="text-sm font-bold tracking-wide">
          {CURRENCY_FLAG[currency]} {currency}
        </span>
        <span className="text-xs font-medium text-white/85 capitalize">{monthLabel}</span>
      </div>

      <p className="num mt-3 text-[34px] leading-none font-extrabold tracking-tight min-[430px]:text-[40px]">
        {hasIncome && hero >= 0 ? '+' : ''}
        {formatMoney(animatedHero, currency, locale)}
      </p>
      <p className="mt-1 text-[13px] font-medium text-white/85">
        {hasIncome
          ? `${leftover >= 0 ? '🌱' : '⚠️'} ${t('leftoverEstimate')} · ${t('thisMonth')}`
          : `${t('ofBills')} · ${t('thisMonth')}`}
      </p>

      {ledger.length > 0 && (
        <div className="num mt-4 space-y-1.5 border-t border-white/25 pt-3 text-[13px] font-semibold">
          {ledger.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-2">
              <span className="text-white/90">
                {row.emoji} {row.label}
              </span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {totalMonth > 0 && (
        <>
          <ProgressBar ratio={paidMonth / totalMonth} className="mt-4" />
          <div className="num mt-2 flex justify-between text-[12px] font-semibold text-white/95">
            {remaining === 0 ? (
              <span>{t('allPaidMonth')}</span>
            ) : (
              <>
                <span>
                  ✓ {formatMoneyShort(paidMonth, currency, locale)} {t('paidSoFar')}
                </span>
                <span>
                  {formatMoneyShort(remaining, currency, locale)} {t('remaining')}
                </span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
