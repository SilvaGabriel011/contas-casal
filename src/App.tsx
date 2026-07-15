import { useCallback, useEffect, useState } from 'react'
import type { Expense, Income, Item, Profile } from './types'
import { useAppData } from './data/DataProvider'
import { useI18n } from './lib/i18n'
import type { AiMessage } from './lib/ai'
import { addDays, todayISO } from './lib/dates'
import { buildOccurrences } from './lib/schedule'
import { TabBar, type Tab } from './components/TabBar'
import { AddSheet } from './components/AddSheet'
import { Home } from './screens/Home'
import { Items } from './screens/Items'
import { IncomeScreen } from './screens/IncomeScreen'
import { More, type MenuEntry } from './screens/More'
import { ExpensesScreen } from './screens/ExpensesScreen'
import { SettleScreen } from './screens/SettleScreen'
import { Welcome } from './screens/Welcome'
import { AiChat } from './screens/AiChat'

const PROFILE_KEY = 'cc.profile'

export default function App() {
  const { status } = useAppData()

  if (status === 'boot') return <Splash />
  if (status === 'welcome' || status === 'auth') return <Welcome />
  return <Shell />
}

function Splash() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <div className="grad-accent flex h-20 w-20 animate-pulse items-center justify-center rounded-[26px] text-4xl">
        💞
      </div>
      <p className="text-sm font-semibold text-ink2">{t('loading')}</p>
    </div>
  )
}

function SaveErrorBanner() {
  const { saveError, dismissSaveError } = useAppData()
  const { t } = useI18n()
  if (!saveError) return null
  return (
    <button
      onClick={dismissSaveError}
      className="anim-rise fixed inset-x-4 top-[max(env(safe-area-inset-top),12px)] z-50 rounded-2xl bg-bad px-4 py-3 text-left text-[13px] font-bold text-white shadow-lg"
    >
      ⚠️ {t('saveFailed')}
    </button>
  )
}

// Overdue-bill count on the home-screen icon (installed PWAs, iOS 16.4+).
function useAppBadge() {
  const { snapshot } = useAppData()
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (!nav.setAppBadge) return
    const today = todayISO()
    const overdue = buildOccurrences(snapshot.items, snapshot.payments, addDays(today, -60), today).filter(
      (o) => !o.payment && o.dueDate < today
    ).length
    if (overdue > 0) nav.setAppBadge(overdue).catch(() => {})
    else nav.clearAppBadge?.().catch(() => {})
  }, [snapshot])
}

function Shell() {
  const { mode } = useAppData()
  const [tab, setTab] = useState<Tab>('home')
  useAppBadge()
  const [aiOpen, setAiOpen] = useState(false)
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([])
  const [profile, setProfileState] = useState<Profile>(() => {
    const saved = localStorage.getItem(PROFILE_KEY)
    return saved === 'a' || saved === 'b' || saved === 'shared' ? saved : 'shared'
  })
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const [editIncome, setEditIncome] = useState<Income | null>(null)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)

  const setProfile = useCallback((p: Profile) => {
    localStorage.setItem(PROFILE_KEY, p)
    setProfileState(p)
  }, [])

  const openAdd = useCallback(() => {
    setEditItem(null)
    setEditIncome(null)
    setEditExpense(null)
    setSheetOpen(true)
  }, [])

  const openEditItem = useCallback((item: Item) => {
    setEditItem(item)
    setEditIncome(null)
    setEditExpense(null)
    setSheetOpen(true)
  }, [])

  const openEditIncome = useCallback((income: Income) => {
    setEditIncome(income)
    setEditItem(null)
    setEditExpense(null)
    setSheetOpen(true)
  }, [])

  const openEditExpense = useCallback((expense: Expense) => {
    setEditExpense(expense)
    setEditItem(null)
    setEditIncome(null)
    setSheetOpen(true)
  }, [])

  const moreEntries: MenuEntry[] = [
    {
      view: 'expenses',
      emoji: '☕',
      labelKey: 'menuExpenses',
      hintKey: 'menuExpensesHint',
      render: () => <ExpensesScreen onEditExpense={openEditExpense} />,
    },
    {
      view: 'settle',
      emoji: '🤝',
      labelKey: 'menuSettle',
      hintKey: 'menuSettleHint',
      render: () => <SettleScreen />,
    },
  ]

  return (
    <div className="min-h-dvh">
      <main className="mx-auto max-w-lg px-4 pt-[max(env(safe-area-inset-top),12px)] pb-36 min-[430px]:px-5">
        <div key={tab} className="anim-screen">
          {tab === 'home' && (
            <Home
              profile={profile}
              onProfile={setProfile}
              onEditItem={openEditItem}
              onOpenAi={mode === 'cloud' ? () => setAiOpen(true) : undefined}
            />
          )}
          {tab === 'items' && <Items profile={profile} onProfile={setProfile} onEditItem={openEditItem} />}
          {tab === 'income' && (
            <IncomeScreen profile={profile} onProfile={setProfile} onEditIncome={openEditIncome} />
          )}
          {tab === 'more' && <More extraEntries={moreEntries} />}
        </div>
      </main>

      <TabBar tab={tab} onTab={setTab} onAdd={openAdd} />
      <SaveErrorBanner />

      <AddSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editItem={editItem}
        editIncome={editIncome}
        editExpense={editExpense}
        defaultOwner={profile}
      />

      <AiChat open={aiOpen} onClose={() => setAiOpen(false)} messages={aiMessages} setMessages={setAiMessages} />
    </div>
  )
}
