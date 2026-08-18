import { useState } from 'react'
import type { Expense, Income, Item, Profile } from '../types'
import { useI18n } from '../lib/i18n'
import { Segmented } from '../components/ui'
import { Items } from './Items'
import { IncomeScreen } from './IncomeScreen'
import { ExpensesScreen } from './ExpensesScreen'

type View = 'bills' | 'expenses' | 'income'

const VIEW_KEY = 'cc.records.view'

// The day-to-day records, one tap from the tab bar: bills, spending and
// income behind an always-visible switch — nothing hides in a menu.
export function RecordsScreen({
  profile,
  onProfile,
  onEditItem,
  onEditIncome,
  onEditExpense,
}: {
  profile: Profile
  onProfile: (p: Profile) => void
  onEditItem: (item: Item) => void
  onEditIncome: (income: Income) => void
  onEditExpense: (expense: Expense) => void
}) {
  const { t } = useI18n()
  const [view, setView] = useState<View>(() => {
    const saved = localStorage.getItem(VIEW_KEY)
    return saved === 'bills' || saved === 'expenses' || saved === 'income' ? saved : 'bills'
  })

  const pick = (v: View) => {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }

  return (
    <div>
      <div className="pt-3">
        <Segmented<View>
          options={[
            { value: 'bills', label: `🧾 ${t('tabBills')}` },
            { value: 'expenses', label: `☕ ${t('chipExpenses')}` },
            { value: 'income', label: `💰 ${t('tabIncome')}` },
          ]}
          value={view}
          onChange={pick}
        />
      </div>
      <div key={view} className="anim-screen">
        {view === 'bills' && <Items profile={profile} onProfile={onProfile} onEditItem={onEditItem} />}
        {view === 'expenses' && <ExpensesScreen onEditExpense={onEditExpense} />}
        {view === 'income' && (
          <IncomeScreen profile={profile} onProfile={onProfile} onEditIncome={onEditIncome} />
        )}
      </div>
    </div>
  )
}
