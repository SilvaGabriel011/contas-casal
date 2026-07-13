import { useMemo } from 'react'
import type { Currency, Income, Profile } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay, type TKey } from '../lib/i18n'
import { formatMoney, formatMoneyShort, CURRENCY_FLAG } from '../lib/money'
import { todayISO } from '../lib/dates'
import { monthlyEquivalent, nextIncomeDate, visibleToProfile } from '../lib/schedule'
import { ProfileSwitcher } from '../components/ProfileSwitcher'
import { EmptyState } from '../components/ui'

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

  const totals = useMemo(() => {
    const map = new Map<Currency, number>()
    for (const i of incomes) {
      if (!i.active) continue
      map.set(i.currency, (map.get(i.currency) ?? 0) + monthlyEquivalent(i.amount, i.frequency))
    }
    return [...map.entries()]
  }, [incomes])

  const freqLabel: Record<string, TKey> = {
    weekly: 'everyWeek',
    fortnightly: 'everyFortnight',
    monthly: 'everyMonth',
  }

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('incomesTitle')}</h1>
      </header>

      <ProfileSwitcher profile={profile} onChange={onProfile} />

      {totals.length > 0 && (
        <div className="anim-rise rounded-3xl border border-line bg-card p-5">
          <p className="text-[13px] font-semibold text-ink2">{t('incomeTotalMonth')}</p>
          <div className="mt-1 space-y-0.5">
            {totals.map(([c, v]) => (
              <p key={c} className="num text-[26px] leading-tight font-extrabold text-ink">
                {CURRENCY_FLAG[c]} {formatMoneyShort(v, c, locale)}
              </p>
            ))}
          </div>
        </div>
      )}

      {incomes.length === 0 ? (
        <EmptyState emoji="💸" title={t('noIncomes')} body={t('emptyHomeBody')} />
      ) : (
        <div className="divide-y divide-line rounded-2xl border border-line bg-card">
          {incomes.map((income) => {
            const ownerName = income.owner === 'a' ? snapshot.settings.nameA : income.owner === 'b' ? snapshot.settings.nameB : t('couple')
            const next = nextIncomeDate(income, today)
            return (
              <button
                key={income.id}
                onClick={() => onEditIncome(income)}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${income.active ? '' : 'opacity-55'}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card2 text-xl">
                  💰
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
                    {t(freqLabel[income.frequency])} · {ownerName} · {t('nextOn')}{' '}
                    {formatDay(next, locale)}
                  </span>
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
