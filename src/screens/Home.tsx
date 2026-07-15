import { useMemo } from 'react'
import type { Currency, Item, Occurrence, Profile } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay } from '../lib/i18n'
import { formatMoneyShort } from '../lib/money'
import { addDays, addMonthsClamped, daysBetween, endOfMonth, startOfMonth, todayISO } from '../lib/dates'
import { buildOccurrences, installmentProgress, monthlyEquivalent, nextPayday, visibleToProfile } from '../lib/schedule'
import { expensesFor, monthOf, totalsByCurrency } from '../lib/expenses'
import { budgetAlerts, categoryAlerts } from '../lib/insights'
import { categoryLabel } from '../lib/categories'
import { personName } from '../lib/owners'
import { ProfileSwitcher } from '../components/ProfileSwitcher'
import { SummaryCard } from '../components/SummaryCard'
import { OccurrenceRow } from '../components/OccurrenceRow'
import { EmptyState } from '../components/ui'

export function Home({
  profile,
  onProfile,
  onEditItem,
  onOpenAi,
}: {
  profile: Profile
  onProfile: (p: Profile) => void
  onEditItem: (item: Item) => void
  onOpenAi?: () => void
}) {
  const { snapshot, mode } = useAppData()
  const { t, locale } = useI18n()
  const today = todayISO()

  const items = useMemo(
    () => snapshot.items.filter((i) => !i.archived && visibleToProfile(i.owner, profile)),
    [snapshot.items, profile]
  )
  const incomes = useMemo(
    () => snapshot.incomes.filter((i) => i.active && visibleToProfile(i.owner, profile)),
    [snapshot.incomes, profile]
  )

  const monthOccs = useMemo(
    () => buildOccurrences(items, snapshot.payments, startOfMonth(today), endOfMonth(today)),
    [items, snapshot.payments, today]
  )

  const listOccs = useMemo(
    () => buildOccurrences(items, snapshot.payments, addDays(today, -60), addDays(today, 30)),
    [items, snapshot.payments, today]
  )

  const monthExpenses = useMemo(
    () => totalsByCurrency(expensesFor(snapshot.expenses, monthOf(today), profile)),
    [snapshot.expenses, today, profile]
  )

  const currencies = useMemo(() => {
    const set = new Set<Currency>()
    items.forEach((i) => set.add(i.currency))
    incomes.forEach((i) => set.add(i.currency))
    for (const c of ['AUD', 'BRL'] as Currency[]) if (monthExpenses[c]) set.add(c)
    return (['AUD', 'BRL'] as Currency[]).filter((c) => set.has(c))
  }, [items, incomes, monthExpenses])

  const summaries = currencies.map((currency) => {
    const occs = monthOccs.filter((o) => o.item.currency === currency)
    const totalMonth = occs.reduce((s, o) => s + (o.payment?.amount ?? o.item.amount), 0)
    const paidMonth = occs.reduce((s, o) => s + (o.payment ? o.payment.amount : 0), 0)
    const incomeMonth = incomes
      .filter((i) => i.currency === currency)
      .reduce((s, i) => s + monthlyEquivalent(i.amount, i.frequency), 0)
    return { currency, totalMonth, paidMonth, incomeMonth, expensesMonth: monthExpenses[currency] ?? 0 }
  })

  // Consumption radar: budget overruns first, then categories running well
  // above the couple's own 3-month normal. Two nudges max — it's a heads-up,
  // not a scolding.
  const radar = useMemo(() => {
    const m = monthOf(today)
    const budget = budgetAlerts(snapshot.expenses, m, snapshot.settings.budgets)
    const covered = new Set(budget.map((b) => `${b.category}|${b.currency}`))
    const trend = categoryAlerts(snapshot.expenses, m).filter((a) => !covered.has(`${a.category}|${a.currency}`))
    return [
      ...budget.map((b) => ({ kind: 'budget' as const, ...b })),
      ...trend.map((a) => ({ kind: 'trend' as const, ...a })),
    ].slice(0, 2)
  }, [snapshot.expenses, snapshot.settings, today])

  // "Free of Brazil" countdown: when the last BRL instalment plan ends and
  // how much is still owed until then.
  const brCountdown = useMemo(() => {
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

  const activeGoals = (snapshot.settings.goals ?? []).filter((g) => g.target > 0 && g.saved < g.target).slice(0, 2)

  const payday = nextPayday(incomes, today)
  const overdue = listOccs.filter((o) => !o.payment && o.dueDate < today)
  const upcoming = listOccs.filter((o) => o.dueDate >= today)

  const dueUntilPayday = useMemo(() => {
    if (!payday) return null
    const pending = listOccs.filter((o) => !o.payment && o.dueDate <= payday.date)
    const byCurrency = new Map<Currency, number>()
    for (const o of pending) {
      byCurrency.set(o.item.currency, (byCurrency.get(o.item.currency) ?? 0) + o.item.amount)
    }
    return [...byCurrency.entries()]
  }, [payday, listOccs])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('goodMorning') : hour < 18 ? t('goodAfternoon') : t('goodEvening')
  const profileName =
    profile === 'shared'
      ? `${snapshot.settings.nameA} & ${snapshot.settings.nameB}`
      : personName(profile, snapshot.settings)

  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date())

  const groups = groupByDate(upcoming)
  const empty = items.length === 0 && incomes.length === 0

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between pt-2">
        <div>
          <p className="text-sm font-medium text-ink2">
            {greeting}{' '}
            {mode === 'demo' && (
              <span className="ml-1 rounded-full bg-card2 px-2 py-0.5 text-[11px] font-bold">local</span>
            )}
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{profileName}</h1>
        </div>
        {onOpenAi && (
          <button
            onClick={onOpenAi}
            aria-label={t('aiTitle')}
            className="press grad-accent flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl text-white shadow-md"
          >
            ✨
          </button>
        )}
      </header>

      <ProfileSwitcher profile={profile} onChange={onProfile} />

      {empty ? (
        <EmptyState emoji="✨" title={t('emptyHomeTitle')} body={t('emptyHomeBody')} />
      ) : (
        <>
          <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4">
            {summaries.map((s) => (
              <div key={s.currency} className={summaries.length > 1 ? 'w-[88%] shrink-0 snap-center' : 'w-full'}>
                <SummaryCard
                  currency={s.currency}
                  monthLabel={monthLabel}
                  totalMonth={s.totalMonth}
                  paidMonth={s.paidMonth}
                  incomeMonth={s.incomeMonth}
                  expensesMonth={s.expensesMonth}
                />
              </div>
            ))}
          </div>

          {radar.length > 0 && (
            <section className="space-y-2">
              {radar.map((a) => (
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
          )}

          {brCountdown && (
            <div className="anim-rise flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3">
              <span className="text-2xl">🇧🇷</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-ink">
                  {t('brCountdownTitle', {
                    month: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
                      new Date(
                        Number(brCountdown.lastDue.slice(0, 4)),
                        Number(brCountdown.lastDue.slice(5, 7)) - 1,
                        1
                      )
                    ),
                  })}
                </p>
                <p className="num truncate text-[12px] text-ink2">
                  {t('brCountdownBody', {
                    n: brCountdown.remaining,
                    v: formatMoneyShort(brCountdown.total, 'BRL', locale),
                  })}
                </p>
              </div>
            </div>
          )}

          {activeGoals.length > 0 && (
            <section className="space-y-2">
              {activeGoals.map((g) => {
                const ratio = Math.min(1, g.saved / g.target)
                return (
                  <div key={g.id} className="anim-rise rounded-2xl border border-line bg-card px-4 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 truncate text-[13px] font-bold text-ink">
                        {g.emoji || '🐷'} {g.name}
                      </p>
                      <p className="num shrink-0 text-[12px] font-bold text-ink2">
                        {formatMoneyShort(g.saved, g.currency, locale)} /{' '}
                        {formatMoneyShort(g.target, g.currency, locale)}
                      </p>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-card2">
                      <div
                        className="grad-accent h-full rounded-full transition-all duration-700"
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </section>
          )}

          {payday && (
            <div className="anim-rise flex items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3">
              <span className="anim-wiggle text-2xl">📅</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-ink">
                  {t('nextPayday')}: {relativeDay(payday.date, today, t, locale)}
                </p>
                {dueUntilPayday && dueUntilPayday.length > 0 && (
                  <p className="num truncate text-[12px] text-ink2">
                    {dueUntilPayday
                      .map(([c, v]) => formatMoneyShort(v, c, locale))
                      .join(' + ')}{' '}
                    {t('dueUntilPayday')}
                  </p>
                )}
              </div>
            </div>
          )}

          {overdue.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-[13px] font-extrabold tracking-wide text-bad uppercase">
                ⚠️ {t('overdue')}
              </h2>
              <div className="divide-y divide-line rounded-2xl border border-bad/30 bg-card">
                {overdue.map((o, i) => (
                  <OccurrenceRow
                    key={`${o.item.id}|${o.dueDate}`}
                    occ={o}
                    profile={profile}
                    onEdit={() => onEditItem(o.item)}
                    style={{ animationDelay: `${Math.min(i * 45, 300)}ms` }}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 px-1 text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
              {t('upcoming')}
            </h2>
            {groups.length === 0 ? (
              <EmptyState emoji="🌴" title={t('noUpcoming')} />
            ) : (
              <div className="space-y-3">
                {groups.map(([date, occs], gi) => (
                  <div
                    key={date}
                    className="anim-rise"
                    style={{ animationDelay: `${Math.min(gi * 60, 420)}ms` }}
                  >
                    <p className="mb-1 px-1 text-[12px] font-bold text-ink2">
                      {relativeDay(date, today, t, locale)}
                    </p>
                    <div className="divide-y divide-line rounded-2xl border border-line bg-card">
                      {occs.map((o, i) => (
                        <OccurrenceRow
                          key={`${o.item.id}|${o.dueDate}`}
                          occ={o}
                          profile={profile}
                          onEdit={() => onEditItem(o.item)}
                          style={{ animationDelay: `${Math.min(gi * 60 + i * 40, 500)}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function groupByDate(occs: Occurrence[]): [string, Occurrence[]][] {
  const map = new Map<string, Occurrence[]>()
  for (const o of occs) {
    const arr = map.get(o.dueDate) ?? []
    arr.push(o)
    map.set(o.dueDate, arr)
  }
  return [...map.entries()]
}

function relativeDay(
  date: string,
  today: string,
  t: ReturnType<typeof useI18n>['t'],
  locale: string
): string {
  const diff = daysBetween(today, date)
  if (diff === 0) return t('today')
  if (diff === 1) return t('tomorrow')
  const s = formatDay(date, locale)
  return s.charAt(0).toUpperCase() + s.slice(1)
}
