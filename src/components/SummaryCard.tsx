import type { Currency } from '../types'
import { useI18n } from '../lib/i18n'
import { formatMoney, formatMoneyShort, CURRENCY_FLAG } from '../lib/money'
import { ProgressBar } from './ui'

export function SummaryCard({
  currency,
  monthLabel,
  totalMonth,
  paidMonth,
  incomeMonth,
}: {
  currency: Currency
  monthLabel: string
  totalMonth: number
  paidMonth: number
  incomeMonth: number
}) {
  const { t, locale } = useI18n()
  const remaining = Math.max(0, totalMonth - paidMonth)
  const leftover = incomeMonth - totalMonth

  return (
    <div
      className={`anim-rise relative w-full shrink-0 snap-center overflow-hidden rounded-3xl p-5 text-white shadow-lg shadow-black/15 ${
        currency === 'AUD' ? 'grad-aud' : 'grad-brl'
      }`}
    >
      <div className="pointer-events-none absolute -top-14 -right-10 h-44 w-44 rounded-full bg-white/12" />
      <div className="pointer-events-none absolute -bottom-20 -left-8 h-40 w-40 rounded-full bg-black/10" />

      <div className="flex items-center justify-between">
        <span className="text-sm font-bold tracking-wide">
          {CURRENCY_FLAG[currency]} {currency}
        </span>
        <span className="text-xs font-medium text-white/85 capitalize">{monthLabel}</span>
      </div>

      <p className="num mt-3 text-[34px] leading-none font-extrabold tracking-tight">
        {formatMoney(totalMonth, currency, locale)}
      </p>
      <p className="mt-1 text-[13px] font-medium text-white/85">{t('ofBills')} · {t('thisMonth')}</p>

      <ProgressBar ratio={totalMonth > 0 ? paidMonth / totalMonth : 1} className="mt-4" />
      <div className="num mt-2 flex justify-between text-[12px] font-semibold text-white/95">
        {totalMonth > 0 && remaining === 0 ? (
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

      {incomeMonth > 0 && (
        <div className="num mt-4 flex gap-3 border-t border-white/25 pt-3 text-[12px] font-semibold">
          <span className="rounded-full bg-white/18 px-2.5 py-1">
            💵 {formatMoneyShort(incomeMonth, currency, locale)} {t('incomePerMonth')}
          </span>
          <span className={`rounded-full px-2.5 py-1 ${leftover >= 0 ? 'bg-white/18' : 'bg-black/25'}`}>
            {leftover >= 0 ? '🌱' : '⚠️'} {formatMoneyShort(leftover, currency, locale)}{' '}
            {t('leftoverEstimate')}
          </span>
        </div>
      )}
    </div>
  )
}
