import { useMemo } from 'react'
import { useAppData } from '../data/DataProvider'
import { useI18n } from '../lib/i18n'
import { formatMoneyShort } from '../lib/money'
import { addMonthsClamped } from '../lib/dates'
import { installmentProgress } from '../lib/schedule'

// Brazilian card installments: how many are left across all items and when
// the last one ends. Renders nothing when there are no open installments.
export function BrCountdownCard() {
  const { snapshot } = useAppData()
  const { t, locale } = useI18n()

  const countdown = useMemo(() => {
    let lastDue = ''
    let remaining = 0
    let total = 0
    for (const item of snapshot.items) {
      if (item.archived || item.currency !== 'BRL' || item.kind !== 'installment' || !item.installmentsTotal)
        continue
      const { paid } = installmentProgress(item, snapshot.payments)
      const left = item.installmentsTotal - paid
      if (left <= 0) continue
      remaining += left
      total += left * item.amount
      const end = addMonthsClamped(item.startDate, item.installmentsTotal - 1)
      if (end > lastDue) lastDue = end
    }
    return remaining > 0 ? { lastDue, remaining, total } : null
  }, [snapshot.items, snapshot.payments])

  if (!countdown) return null

  return (
    <div className="anim-rise flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3">
      <span className="text-2xl">🇧🇷</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-ink">
          {t('brCountdownTitle', {
            month: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
              new Date(Number(countdown.lastDue.slice(0, 4)), Number(countdown.lastDue.slice(5, 7)) - 1, 1)
            ),
          })}
        </p>
        <p className="num truncate text-[12px] text-ink2">
          {t('brCountdownBody', {
            n: countdown.remaining,
            v: formatMoneyShort(countdown.total, 'BRL', locale),
          })}
        </p>
      </div>
    </div>
  )
}
