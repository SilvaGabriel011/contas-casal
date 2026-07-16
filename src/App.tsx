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
import { HistoryScreen } from './screens/HistoryScreen'
import { SettleScreen } from './screens/SettleScreen'
import { TransfersScreen } from './screens/TransfersScreen'
import { ReportsScreen } from './screens/ReportsScreen'
import { GoalsScreen } from './screens/GoalsScreen'
import { VaultScreen } from './screens/VaultScreen'
import { TodosScreen } from './screens/TodosScreen'
import { TaxScreen } from './screens/TaxScreen'
import { ReconcileScreen } from './screens/ReconcileScreen'
import { WrappedScreen } from './screens/WrappedScreen'
import { Welcome } from './screens/Welcome'
import { AiChat } from './screens/AiChat'
import { LockScreen } from './components/LockScreen'
import { isLockEnabled } from './lib/applock'

const PROFILE_KEY = 'cc.profile'

// AI chat survives closing the app; capped so CSV attachments in old
// messages can't blow the storage quota.
const AI_CHAT_KEY = 'cc.aichat.v1'
const AI_CHAT_MAX_MESSAGES = 40

function loadAiChat(): AiMessage[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(AI_CHAT_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (m): m is AiMessage =>
        typeof m === 'object' &&
        m !== null &&
        ((m as AiMessage).role === 'user' || (m as AiMessage).role === 'assistant') &&
        typeof (m as AiMessage).content === 'string'
    )
  } catch {
    return []
  }
}

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
  const [aiMessages, setAiMessages] = useState<AiMessage[]>(loadAiChat)

  useEffect(() => {
    // Debounced: streaming updates the last message on every chunk.
    const id = setTimeout(() => {
      try {
        if (aiMessages.length === 0) localStorage.removeItem(AI_CHAT_KEY)
        else localStorage.setItem(AI_CHAT_KEY, JSON.stringify(aiMessages.slice(-AI_CHAT_MAX_MESSAGES)))
      } catch {
        /* storage full or blocked — the chat just won't persist */
      }
    }, 400)
    return () => clearTimeout(id)
  }, [aiMessages])
  const [profile, setProfileState] = useState<Profile>(() => {
    const saved = localStorage.getItem(PROFILE_KEY)
    return saved === 'a' || saved === 'b' || saved === 'shared' ? saved : 'shared'
  })
  const [locked, setLocked] = useState(isLockEnabled)

  useEffect(() => {
    // Re-arm the lock after 5+ minutes in the background.
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > 5 * 60_000 && isLockEnabled()) setLocked(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
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
      view: 'history',
      emoji: '🗓️',
      labelKey: 'menuHistory',
      hintKey: 'menuHistoryHint',
      render: () => <HistoryScreen />,
    },
    {
      view: 'settle',
      emoji: '🤝',
      labelKey: 'menuSettle',
      hintKey: 'menuSettleHint',
      render: () => <SettleScreen />,
    },
    {
      view: 'transfers',
      emoji: '✈️',
      labelKey: 'menuTransfers',
      hintKey: 'menuTransfersHint',
      render: () => <TransfersScreen />,
    },
    {
      view: 'charts',
      emoji: '📊',
      labelKey: 'menuCharts',
      hintKey: 'menuChartsHint',
      render: () => <ReportsScreen />,
    },
    {
      view: 'todos',
      emoji: '✅',
      labelKey: 'menuTodos',
      hintKey: 'menuTodosHint',
      render: () => <TodosScreen />,
    },
    {
      view: 'vault',
      emoji: '🔐',
      labelKey: 'menuVault',
      hintKey: 'menuVaultHint',
      render: () => <VaultScreen />,
    },
    {
      view: 'goals',
      emoji: '🐷',
      labelKey: 'menuGoals',
      hintKey: 'menuGoalsHint',
      render: () => <GoalsScreen />,
    },
    {
      view: 'reconcile',
      emoji: '🏦',
      labelKey: 'menuReconcile',
      hintKey: 'menuReconcileHint',
      render: () => <ReconcileScreen />,
    },
    {
      view: 'tax',
      emoji: '🧾',
      labelKey: 'menuTax',
      hintKey: 'menuTaxHint',
      render: () => <TaxScreen />,
    },
    {
      view: 'wrapped',
      emoji: '🎁',
      labelKey: 'menuWrapped',
      hintKey: 'menuWrappedHint',
      render: () => <WrappedScreen />,
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

      {locked && <LockScreen onUnlocked={() => setLocked(false)} />}
    </div>
  )
}
