import { useMemo, useState } from 'react'
import type { Currency, Income, Item, Occurrence, Profile } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay } from '../lib/i18n'
import { formatMoney, formatMoneyShort } from '../lib/money'
import { addDays, addMonthsClamped, daysBetween, endOfMonth, parseDate, startOfMonth, todayISO } from '../lib/dates'
import {
  buildOccurrences,
  incomeDates,
  installmentProgress,
  monthlyEquivalent,
  visibleToProfile,
} from '../lib/schedule'
import { expensesFor, monthOf, totalsByCurrency } from '../lib/expenses'
import { budgetAlerts, categoryAlerts } from '../lib/insights'
import { categoryLabel } from '../lib/categories'
import { ownerLabel, personName } from '../lib/owners'
import { SummaryCard } from '../components/SummaryCard'
import { OccurrenceRow } from '../components/OccurrenceRow'
import { EmptyState } from '../components/ui'

const AGENDA_DAYS = 30

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
  const [expanded, setExpanded] = useState(false)

  const allItems = useMemo(() => snapshot.items.filter((i) => !i.archived), [snapshot.items])
  const allIncomes = useMemo(() => snapshot.incomes.filter((i) => i.active), [snapshot.incomes])

  // The trio: one glance card per scope (each partner + the couple). The ring
  // is bills-paid progress this month (count-based, so currencies can mix);
  // the number is the estimated leftover per currency.
  const trio = useMemo(() => {
    return (['a', 'b', 'shared'] as Profile[]).map((p) => {
      const items = allItems.filter((i) => visibleToProfile(i.owner, p))
      const incomes = allIncomes.filter((i) => visibleToProfile(i.owner, p))
      const occs = buildOccurrences(items, snapshot.payments, startOfMonth(today), endOfMonth(today))
      const paidCount = occs.filter((o) => o.payment).length
      const expenses = totalsByCurrency(expensesFor(snapshot.expenses, monthOf(today), p))
      const leftover: [Currency, number][] = []
      for (const c of ['AUD', 'BRL'] as Currency[]) {
        const income = incomes
          .filter((i) => i.currency === c)
          .reduce((s, i) => s + monthlyEquivalent(i.amount, i.frequency), 0)
        const bills = occs
          .filter((o) => o.item.currency === c)
          .reduce((s, o) => s + (o.payment?.amount ?? o.item.amount), 0)
        const spent = expenses[c] ?? 0
        if (income !== 0 || bills !== 0 || spent !== 0) leftover.push([c, income - bills - spent])
      }
      return { p, ringRatio: occs.length > 0 ? paidCount / occs.length : null, leftover }
    })
  }, [allItems, allIncomes, snapshot.payments, snapshot.expenses, today])

  // Expanded detail for the selected card — same numbers as the old summary
  // cards, scoped to the selected profile.
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

  // Couple-wide agenda (concept C): everything with a date becomes an event.
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

  // Consumption radar (kept from the previous home).
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

      {empty ? (
        <EmptyState emoji="✨" title={t('emptyHomeTitle')} body={t('emptyHomeBody')} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {trio.map((c, i) => {
              const selected = profile === c.p
              const name = c.p === 'shared' ? t('couple') : personName(c.p, snapshot.settings)
              return (
                <button
                  key={c.p}
                  onClick={() => {
                    if (selected) setExpanded((v) => !v)
                    else {
                      onProfile(c.p)
                      setExpanded(true)
                    }
                  }}
                  className={`press anim-rise rounded-2xl border p-3 text-center transition-all ${
                    selected ? 'border-accent bg-card shadow-sm' : 'border-line bg-card2'
                  }`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className="block truncate text-[12px] font-bold text-ink">
                    {c.p === 'shared' ? '💞 ' : ''}
                    {name}
                  </span>
                  <Ring ratio={c.ringRatio} />
                  {c.leftover.length === 0 ? (
                    <span className="num block text-[13px] font-extrabold text-ink2">—</span>
                  ) : (
                    c.leftover.map(([cur, v], j) => (
                      <span
                        key={cur}
                        className={`num block ${j === 0 ? 'text-[13px] font-extrabold' : 'text-[11px] font-semibold'} ${
                          v < 0 ? 'text-bad' : 'text-ink'
                        }`}
                      >
                        {v >= 0 ? '+' : ''}
                        {formatMoneyShort(v, cur, locale)}
                      </span>
                    ))
                  )}
                  <span className="block text-[11px] text-ink2">{t('trioLeft')}</span>
                </button>
              )
            })}
          </div>

          {expanded && (
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
          )}

          <div className="anim-rise flex gap-1.5">
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
                    profile="shared"
                    onEdit={() => onEditItem(o.item)}
                    style={{ animationDelay: `${Math.min(i * 45, 300)}ms` }}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 px-1 text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
              {t('agendaCouple')}
            </h2>
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
        </>
      )}
    </div>
  )
}

// Bills-paid progress this month. Count-based so AUD and BRL can share one
// ring without mixing currencies.
function Ring({ ratio }: { ratio: number | null }) {
  const r = 17
  const circumference = 2 * Math.PI * r
  return (
    <span className="relative mx-auto my-1.5 block h-11 w-11">
      <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--card-2)" strokeWidth="5" />
        {ratio !== null && (
          <circle
            cx="22"
            cy="22"
            r={r}
            fill="none"
            stroke={ratio >= 1 ? 'var(--good)' : 'var(--accent)'}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${ratio * circumference} ${circumference}`}
            className="transition-all duration-700"
          />
        )}
      </svg>
      <span className="num absolute inset-0 flex items-center justify-center text-[10px] font-extrabold text-ink">
        {ratio === null ? '—' : `${Math.round(ratio * 100)}%`}
      </span>
    </span>
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
