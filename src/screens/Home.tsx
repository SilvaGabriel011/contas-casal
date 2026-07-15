import { useMemo } from 'react'
import type { Currency, Item, Occurrence, Profile } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay } from '../lib/i18n'
import { formatMoneyShort } from '../lib/money'
import { addDays, daysBetween, endOfMonth, startOfMonth, todayISO } from '../lib/dates'
import { buildOccurrences, monthlyEquivalent, nextPayday, visibleToProfile } from '../lib/schedule'
import { expensesFor, monthOf, totalsByCurrency } from '../lib/expenses'
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
