import { useMemo } from 'react'
import { useAppData } from '../data/DataProvider'
import { useI18n } from '../lib/i18n'
import { formatMoneyShort } from '../lib/money'
import { budgetAlerts, categoryAlerts } from '../lib/insights'
import { categoryLabel } from '../lib/categories'

// Consumption radar: categories over budget or well above the couple's
// normal, for the given month.
export function SpendingAlerts({ month }: { month: string }) {
  const { snapshot } = useAppData()
  const { t, locale } = useI18n()

  const alerts = useMemo(() => {
    const budget = budgetAlerts(snapshot.expenses, month, snapshot.settings.budgets)
    const covered = new Set(budget.map((b) => `${b.category}|${b.currency}`))
    const trend = categoryAlerts(snapshot.expenses, month).filter((a) => !covered.has(`${a.category}|${a.currency}`))
    return [
      ...budget.map((b) => ({ kind: 'budget' as const, ...b })),
      ...trend.map((a) => ({ kind: 'trend' as const, ...a })),
    ].slice(0, 2)
  }, [snapshot.expenses, snapshot.settings, month])

  if (alerts.length === 0) return null

  return (
    <section className="space-y-2">
      {alerts.map((a) => (
        <div
          key={`${a.kind}-${a.category}-${a.currency}`}
          className="anim-rise flex items-center gap-3 rounded-2xl border border-bad/30 bg-bad/5 px-4 py-3"
        >
          <span className="text-2xl">{a.kind === 'budget' ? '🎯' : '📈'}</span>
          <p className="min-w-0 flex-1 text-[13px] leading-snug font-bold text-ink">
            {a.kind === 'budget'
              ? t('alertOverBudget', {
                  cat: categoryLabel(a.category, snapshot.settings, t),
                  spent: formatMoneyShort(a.spent, a.currency, locale),
                  budget: formatMoneyShort(a.budget, a.currency, locale),
                })
              : t('alertOverTypical', {
                  cat: categoryLabel(a.category, snapshot.settings, t),
                  pct: a.pct,
                })}
          </p>
        </div>
      ))}
    </section>
  )
}
