import { useMemo } from 'react'
import type { Currency, Income, Item, Occurrence, Profile } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay } from '../lib/i18n'
import { formatMoney } from '../lib/money'
import { addDays, daysBetween, endOfMonth, parseDate, startOfMonth, todayISO } from '../lib/dates'
import { buildOccurrences, incomeDates, monthlyEquivalent, visibleToProfile } from '../lib/schedule'
import { expensesFor, monthOf, totalsByCurrency } from '../lib/expenses'
import { ownerLabel, personName } from '../lib/owners'
import { SummaryCard } from '../components/SummaryCard'
import { OccurrenceRow } from '../components/OccurrenceRow'
import { EmptyState, Segmented } from '../components/ui'

const AGENDA_DAYS = 30

export function Home({
  profile,
  onProfile,
  onEditItem,
  onOpenAi,
  onOpenSettings,
}: {
  profile: Profile
  onProfile: (p: Profile) => void
  onEditItem: (item: Item) => void
  onOpenAi?: () => void
  onOpenSettings?: () => void
}) {
  const { snapshot, mode } = useAppData()
  const { t, locale } = useI18n()
  const today = todayISO()

  const allItems = useMemo(() => snapshot.items.filter((i) => !i.archived), [snapshot.items])
  const allIncomes = useMemo(() => snapshot.incomes.filter((i) => i.active), [snapshot.incomes])

  // Month summary for the selected profile — always visible, one card per
  // currency in use. The SummaryCard is the ONLY place on this screen that
  // shows money values; everything else is selection or schedule.
  const items = useMemo(
    () => allItems.filter((i) => visibleToProfile(i.owner, profile)),
    [allItems, profile]
  )
  const incomes = useMemo(
    () => allIncomes.filter((i) => visibleToProfile(i.owner, profile)),
    [allIncomes, profile]
  )
  const monthOccs = useMemo(
    () => buildOccurrences(items, snapshot.payments, startOfMonth(today), endOfMonth(today)),
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

  // Couple-wide agenda: everything with a date becomes an event.
  const listOccs = useMemo(
    () => buildOccurrences(allItems, snapshot.payments, addDays(today, -60), addDays(today, AGENDA_DAYS)),
    [allItems, snapshot.payments, today]
  )
  const overdue = listOccs.filter((o) => !o.payment && o.dueDate < today)
  const upcoming = useMemo(() => listOccs.filter((o) => o.dueDate >= today), [listOccs, today])

  const paydays = useMemo(() => {
    const out: { date: string; income: Income }[] = []
    for (const inc of allIncomes) {
      for (const date of incomeDates(inc, today, addDays(today, AGENDA_DAYS))) out.push({ date, income: inc })
    }
    return out
  }, [allIncomes, today])

  const agendaDays = useMemo(() => {
    const map = new Map<string, { occs: Occurrence[]; pays: { date: string; income: Income }[] }>()
    const entry = (d: string) => {
      let e = map.get(d)
      if (!e) {
        e = { occs: [], pays: [] }
        map.set(d, e)
      }
      return e
    }
    for (const o of upcoming) entry(o.dueDate).occs.push(o)
    for (const pd of paydays) entry(pd.date).pays.push(pd)
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  }, [upcoming, paydays])

  // Week strip: the next 7 days with due (amber) / payday (green) dots.
  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(today, i)
        return {
          date,
          due: upcoming.some((o) => o.dueDate === date && !o.payment),
          pay: paydays.some((p) => p.date === date),
        }
      }),
    [today, upcoming, paydays]
  )
  const weekdayLetter = (date: string) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(parseDate(date)).toUpperCase()

  const scrollToDay = (date: string) => {
    document.getElementById(`agenda-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('goodMorning') : hour < 18 ? t('goodAfternoon') : t('goodEvening')
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date())
  const empty = allItems.length === 0 && allIncomes.length === 0

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
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            {snapshot.settings.nameA} & {snapshot.settings.nameB}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onOpenAi && (
            <button
              onClick={onOpenAi}
              aria-label={t('aiTitle')}
              className="press grad-accent flex h-11 w-11 items-center justify-center rounded-2xl text-xl text-white shadow-md"
            >
              ✨
            </button>
          )}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              aria-label={t('settingsTitle')}
              className="press flex h-11 w-11 items-center justify-center rounded-2xl border border-line bg-card text-xl"
            >
              ⚙️
            </button>
          )}
        </div>
      </header>

      {empty ? (
        <EmptyState emoji="✨" title={t('emptyHomeTitle')} body={t('emptyHomeBody')} />
      ) : (
        <>
          <div className="anim-rise">
            <Segmented<Profile>
              options={[
                { value: 'a', label: personName('a', snapshot.settings) },
                { value: 'b', label: personName('b', snapshot.settings) },
                { value: 'shared', label: `💞 ${t('couple')}` },
              ]}
              value={profile}
              onChange={onProfile}
            />
          </div>

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
            {summaries.length === 0 && (
              <p className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-[13px] text-ink2">
                {t('noUpcoming')}
              </p>
            )}
          </div>

          <section>
            <h2 className="mb-2 px-1 text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
              {t('agendaCouple')}
            </h2>

            <div className="anim-rise mb-3 flex gap-1.5">
              {week.map((d) => {
                const isToday = d.date === today
                return (
                  <button
                    key={d.date}
                    onClick={() => scrollToDay(d.date)}
                    className={`press flex-1 rounded-xl border py-1.5 text-center ${
                      isToday ? 'border-accent bg-card shadow-sm' : 'border-line bg-card2'
                    }`}
                  >
                    <span className="block text-[10px] font-semibold text-ink2">{weekdayLetter(d.date)}</span>
                    <span className={`num block text-[14px] font-extrabold ${isToday ? 'text-accent' : 'text-ink'}`}>
                      {Number(d.date.slice(8, 10))}
                    </span>
                    <span className="flex h-2 items-center justify-center gap-0.5">
                      {d.due && <span className="h-1.5 w-1.5 rounded-full bg-bad/70" />}
                      {d.pay && <span className="h-1.5 w-1.5 rounded-full bg-good" />}
                    </span>
                  </button>
                )
              })}
            </div>

            {overdue.length > 0 && (
              <div className="anim-rise mb-3">
                <p className="mb-1 px-1 text-[12px] font-bold text-bad">⚠️ {t('overdue')}</p>
                <div className="divide-y divide-line rounded-2xl border border-bad/30 bg-card">
                  {overdue.map((o, i) => (
                    <OccurrenceRow
                      key={`${o.item.id}|${o.dueDate}`}
                      occ={o}
                      profile="shared"
                      onEdit={() => onEditItem(o.item)}
                      style={{ animationDelay: `${Math.min(i * 45, 300)}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}

            {agendaDays.length === 0 ? (
              <EmptyState emoji="🌴" title={t('noUpcoming')} />
            ) : (
              <div className="space-y-3">
                {agendaDays.map(([date, ev], gi) => (
                  <div
                    key={date}
                    id={`agenda-${date}`}
                    className="anim-rise"
                    style={{ animationDelay: `${Math.min(gi * 60, 420)}ms` }}
                  >
                    <p className="mb-1 px-1 text-[12px] font-bold text-ink2">
                      {relativeDay(date, today, t, locale)}
                    </p>
                    <div className="divide-y divide-line rounded-2xl border border-line bg-card">
                      {ev.pays.map((pd) => (
                        <div key={`${pd.income.id}|${date}`} className="flex items-center gap-3 px-4 py-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-good/10 text-xl">
                            💰
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold text-ink">
                              {pd.income.name}
                            </span>
                            <span className="block text-[12px] text-ink2">
                              {ownerLabel(pd.income.owner, snapshot.settings, t)}
                            </span>
                          </span>
                          <span className="num shrink-0 text-[15px] font-bold text-good">
                            +{formatMoney(pd.income.amount, pd.income.currency, locale)}
                          </span>
                        </div>
                      ))}
                      {ev.occs.map((o, i) => (
                        <OccurrenceRow
                          key={`${o.item.id}|${o.dueDate}`}
                          occ={o}
                          profile="shared"
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
