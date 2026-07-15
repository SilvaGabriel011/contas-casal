import { useMemo, useState } from 'react'
import type { Budget, Currency, Expense } from '../types'
import { CATEGORIES } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay } from '../lib/i18n'
import { formatMoney, formatMoneyShort, parseAmount, CURRENCY_FLAG } from '../lib/money'
import { categoryEmoji, categoryLabel } from '../lib/categories'
import { personName } from '../lib/owners'
import { expensesFor, shiftMonth, spentInCategory, totalsByCurrency, monthOf } from '../lib/expenses'
import { todayISO } from '../lib/dates'
import { Chip, EmptyState, Field, inputCls, Segmented } from '../components/ui'

export function ExpensesScreen({ onEditExpense }: { onEditExpense: (e: Expense) => void }) {
  const { snapshot, saveSettings } = useAppData()
  const { t, locale, decimalSep } = useI18n()
  const [month, setMonth] = useState(() => monthOf(todayISO()))
  const [editCat, setEditCat] = useState<string | null>(null)
  const [budgetRaw, setBudgetRaw] = useState('')
  const [budgetCurrency, setBudgetCurrency] = useState<Currency>('AUD')

  const monthExpenses = useMemo(
    () => expensesFor(snapshot.expenses, month, 'shared'),
    [snapshot.expenses, month]
  )
  const totals = totalsByCurrency(monthExpenses)
  const budgets = snapshot.settings.budgets ?? {}

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
  }, [month, locale])

  const byDay = useMemo(() => {
    const map = new Map<string, Expense[]>()
    for (const e of monthExpenses) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    return [...map.entries()]
  }, [monthExpenses])

  const openBudgetEditor = (cat: string) => {
    const existing = budgets[cat]
    setEditCat(cat)
    setBudgetRaw(existing ? String(existing.amount) : '')
    setBudgetCurrency(existing?.currency ?? 'AUD')
  }

  const saveBudget = async (remove = false) => {
    if (!editCat) return
    const next: Record<string, Budget> = { ...budgets }
    if (remove) {
      delete next[editCat]
    } else {
      const amount = parseAmount(budgetRaw, decimalSep)
      if (amount === null || amount <= 0) return
      next[editCat] = { amount, currency: budgetCurrency }
    }
    await saveSettings({ ...snapshot.settings, budgets: next })
    setEditCat(null)
  }

  const budgetCats = Object.keys(budgets)
  const allCats: string[] = [...CATEGORIES, ...snapshot.settings.customCategories.map((c) => c.id)]

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('expensesTitle')}</h1>
      </header>

      <div className="flex items-center justify-between rounded-2xl border border-line bg-card px-2 py-1.5">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="press px-3 py-1 text-lg font-bold text-ink2">
          ‹
        </button>
        <span className="text-[14px] font-bold text-ink capitalize">{monthLabel}</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="press px-3 py-1 text-lg font-bold text-ink2">
          ›
        </button>
      </div>

      <div className="anim-rise rounded-3xl border border-line bg-card p-5">
        <p className="text-[13px] font-semibold text-ink2">{t('monthTotal')}</p>
        {(['AUD', 'BRL'] as Currency[]).filter((c) => totals[c]).length === 0 ? (
          <p className="num mt-1 text-[26px] font-extrabold text-ink">—</p>
        ) : (
          (['AUD', 'BRL'] as Currency[])
            .filter((c) => totals[c])
            .map((c) => (
              <p key={c} className="num mt-1 text-[26px] leading-tight font-extrabold text-ink">
                {CURRENCY_FLAG[c]} {formatMoneyShort(totals[c]!, c, locale)}
              </p>
            ))
        )}
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
            🎯 {t('budgetsTitle')}
          </h2>
        </div>
        <div className="space-y-2">
          {budgetCats.map((cat) => {
            const b = budgets[cat]
            const spent = spentInCategory(monthExpenses, cat, b.currency)
            const ratio = Math.min(1, spent / b.amount)
            const over = spent > b.amount
            return (
              <button
                key={cat}
                onClick={() => openBudgetEditor(cat)}
                className="anim-rise w-full rounded-2xl border border-line bg-card px-4 py-3 text-left"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[14px] font-bold text-ink">
                    {categoryEmoji(cat, snapshot.settings)} {categoryLabel(cat, snapshot.settings, t)}
                  </span>
                  <span className={`num text-[12px] font-bold ${over ? 'text-bad' : 'text-ink2'}`}>
                    {formatMoneyShort(spent, b.currency, locale)} / {formatMoneyShort(b.amount, b.currency, locale)}
                    {over && ` · ${t('overBudget')}!`}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-card2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${over ? 'bg-bad' : 'grad-accent'}`}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
              </button>
            )
          })}
          {editCat === '__new__' ? null : (
            <button
              onClick={() => setEditCat('__new__')}
              className="press w-full rounded-2xl border border-dashed border-line py-2.5 text-[13px] font-semibold text-ink2"
            >
              ＋ {t('setBudget')}
            </button>
          )}
        </div>

        {editCat && (
          <div className="anim-rise mt-2 space-y-3 rounded-2xl border border-line bg-card2 p-4">
            {editCat === '__new__' ? (
              <div className="flex flex-wrap gap-2">
                {allCats
                  .filter((c) => !budgets[c])
                  .map((c) => (
                    <Chip key={c} selected={false} onClick={() => openBudgetEditor(c)}>
                      {categoryEmoji(c, snapshot.settings)} {categoryLabel(c, snapshot.settings, t)}
                    </Chip>
                  ))}
              </div>
            ) : (
              <>
                <p className="text-[14px] font-bold text-ink">
                  {categoryEmoji(editCat, snapshot.settings)} {categoryLabel(editCat, snapshot.settings, t)}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('budgetAmount')}>
                    <input
                      className={`${inputCls} num`}
                      value={budgetRaw}
                      onChange={(e) => setBudgetRaw(e.target.value)}
                      inputMode="decimal"
                      placeholder={decimalSep === ',' ? '0,00' : '0.00'}
                    />
                  </Field>
                  <Field label={t('currency')}>
                    <Segmented
                      options={[
                        { value: 'AUD', label: '🇦🇺' },
                        { value: 'BRL', label: '🇧🇷' },
                      ]}
                      value={budgetCurrency}
                      onChange={setBudgetCurrency}
                    />
                  </Field>
                </div>
                <div className="flex gap-2">
                  {budgets[editCat] && (
                    <button
                      onClick={() => saveBudget(true)}
                      className="press rounded-xl border border-line px-4 py-2.5 text-[13px] font-bold text-bad"
                    >
                      {t('removeBudget')}
                    </button>
                  )}
                  <button
                    onClick={() => saveBudget()}
                    className="press grad-accent flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white"
                  >
                    {t('save')}
                  </button>
                </div>
              </>
            )}
            <button onClick={() => setEditCat(null)} className="w-full py-1 text-[13px] font-semibold text-ink2">
              ← {t('back')}
            </button>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 px-1 text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
          ☕ {t('quickExpense')}s
        </h2>
        {byDay.length === 0 ? (
          <EmptyState emoji="🧺" title={t('noExpenses')} body={t('emptyHomeBody')} />
        ) : (
          <div className="space-y-3">
            {byDay.map(([date, list], gi) => (
              <div key={date} className="anim-rise" style={{ animationDelay: `${Math.min(gi * 50, 350)}ms` }}>
                <p className="mb-1 px-1 text-[12px] font-bold text-ink2">{formatDay(date, locale)}</p>
                <div className="divide-y divide-line rounded-2xl border border-line bg-card">
                  {list.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => onEditExpense(e)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card2 text-xl">
                        {categoryEmoji(e.category, snapshot.settings)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-ink">
                          {e.note || categoryLabel(e.category, snapshot.settings, t)}
                        </span>
                        <span className="block text-[12px] text-ink2">
                          {categoryLabel(e.category, snapshot.settings, t)}
                          {e.paidBy && ` · ${personName(e.paidBy, snapshot.settings)}`}
                        </span>
                      </span>
                      <span className="num shrink-0 text-[15px] font-bold text-ink">
                        {formatMoney(e.amount, e.currency, locale)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
