import { useCallback, useState } from 'react'
import type { Income, Item, Profile } from './types'
import { useAppData } from './data/DataProvider'
import { useI18n } from './lib/i18n'
import { TabBar, type Tab } from './components/TabBar'
import { AddSheet } from './components/AddSheet'
import { Home } from './screens/Home'
import { Items } from './screens/Items'
import { IncomeScreen } from './screens/IncomeScreen'
import { Settings } from './screens/Settings'
import { Welcome } from './screens/Welcome'

const PROFILE_KEY = 'cc.profile'

export default function App() {
  const { status } = useAppData()

  if (status === 'boot') return <Splash />
  if (status === 'welcome' || status === 'auth') return <Welcome key={status} />
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

function Shell() {
  const [tab, setTab] = useState<Tab>('home')
  const [profile, setProfileState] = useState<Profile>(() => {
    const saved = localStorage.getItem(PROFILE_KEY)
    return saved === 'a' || saved === 'b' || saved === 'shared' ? saved : 'shared'
  })
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const [editIncome, setEditIncome] = useState<Income | null>(null)

  const setProfile = useCallback((p: Profile) => {
    localStorage.setItem(PROFILE_KEY, p)
    setProfileState(p)
  }, [])

  const openAdd = useCallback(() => {
    setEditItem(null)
    setEditIncome(null)
    setSheetOpen(true)
  }, [])

  const openEditItem = useCallback((item: Item) => {
    setEditItem(item)
    setEditIncome(null)
    setSheetOpen(true)
  }, [])

  const openEditIncome = useCallback((income: Income) => {
    setEditIncome(income)
    setEditItem(null)
    setSheetOpen(true)
  }, [])

  return (
    <div className="min-h-dvh">
      <main className="mx-auto max-w-lg px-4 pt-[max(env(safe-area-inset-top),12px)] pb-36">
        {tab === 'home' && <Home profile={profile} onProfile={setProfile} onEditItem={openEditItem} />}
        {tab === 'items' && <Items profile={profile} onProfile={setProfile} onEditItem={openEditItem} />}
        {tab === 'income' && (
          <IncomeScreen profile={profile} onProfile={setProfile} onEditIncome={openEditIncome} />
        )}
        {tab === 'settings' && <Settings />}
      </main>

      <TabBar tab={tab} onTab={setTab} onAdd={openAdd} />

      <AddSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editItem={editItem}
        editIncome={editIncome}
        defaultOwner={profile}
      />
    </div>
  )
}
