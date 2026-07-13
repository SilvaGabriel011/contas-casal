import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { HouseholdSettings, Income, Item, Payment, Snapshot } from '../types'
import { getCloudConfig, getMode, saveCloudConfig, setMode, type AppMode, type CloudConfig } from '../lib/config'
import { EMPTY_SNAPSHOT, type DataAdapter } from './adapter'
import { LocalAdapter, resetDemoData } from './localAdapter'
import { getSupabase, SupabaseAdapter } from './supabaseAdapter'

type Status = 'boot' | 'welcome' | 'auth' | 'ready'

interface AppData {
  status: Status
  mode: AppMode | null
  snapshot: Snapshot
  loading: boolean
  userEmail: string | null
  chooseDemo: () => void
  chooseCloud: (cfg: CloudConfig) => void
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<'confirm-email' | string | null>
  signOut: () => Promise<void>
  backToWelcome: () => void
  upsertItem: (item: Item) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  upsertIncome: (income: Income) => Promise<void>
  deleteIncome: (id: string) => Promise<void>
  setPaid: (item: Item, dueDate: string, paid: boolean) => Promise<void>
  saveSettings: (settings: HouseholdSettings) => Promise<void>
  resetDemo: () => void
}

const Ctx = createContext<AppData | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('boot')
  const [mode, setModeState] = useState<AppMode | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT)
  const [loading, setLoading] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const adapterRef = useRef<DataAdapter | null>(null)
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refetch = useCallback(async () => {
    const adapter = adapterRef.current
    if (!adapter) return
    try {
      setSnapshot(await adapter.load())
    } catch {
      /* keep showing last known data; next mutation retries */
    }
  }, [])

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(refetch, 250)
  }, [refetch])

  const startAdapter = useCallback(
    async (adapter: DataAdapter) => {
      adapterRef.current = adapter
      setLoading(true)
      try {
        setSnapshot(await adapter.load())
        setStatus('ready')
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // Boot: restore previous mode/session.
  useEffect(() => {
    let cancelled = false
    let unsubData: (() => void) | undefined
    let unsubAuth: (() => void) | undefined

    async function boot() {
      const savedMode = getMode()
      if (savedMode === 'demo') {
        setModeState('demo')
        await startAdapter(new LocalAdapter())
        return
      }
      if (savedMode === 'cloud') {
        const cfg = getCloudConfig()
        if (cfg) {
          setModeState('cloud')
          const sb = getSupabase(cfg)
          const { data } = await sb.auth.getSession()
          if (cancelled) return
          const session = data.session
          if (session) {
            setUserEmail(session.user.email ?? null)
            const adapter = new SupabaseAdapter(sb, session.user.id)
            await startAdapter(adapter)
            unsubData = adapter.subscribe?.(scheduleRefetch)
          } else {
            setStatus('auth')
          }
          const { data: sub } = sb.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') {
              unsubData?.()
              adapterRef.current = null
              setUserEmail(null)
              setSnapshot(EMPTY_SNAPSHOT)
              setStatus('auth')
            }
          })
          unsubAuth = () => sub.subscription.unsubscribe()
          return
        }
      }
      setStatus('welcome')
    }

    boot()
    return () => {
      cancelled = true
      unsubData?.()
      unsubAuth?.()
    }
  }, [startAdapter, scheduleRefetch])

  const chooseDemo = useCallback(() => {
    setMode('demo')
    setModeState('demo')
    startAdapter(new LocalAdapter())
  }, [startAdapter])

  const chooseCloud = useCallback((cfg: CloudConfig) => {
    saveCloudConfig(cfg)
    setMode('cloud')
    setModeState('cloud')
    setStatus('auth')
  }, [])

  const connectSession = useCallback(async () => {
    const cfg = getCloudConfig()
    if (!cfg) return
    const sb = getSupabase(cfg)
    const { data } = await sb.auth.getSession()
    const session = data.session
    if (!session) return
    setUserEmail(session.user.email ?? null)
    const adapter = new SupabaseAdapter(sb, session.user.id)
    await startAdapter(adapter)
    adapter.subscribe?.(scheduleRefetch)
  }, [startAdapter, scheduleRefetch])

  const signIn = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      const cfg = getCloudConfig()
      if (!cfg) return 'missing config'
      const sb = getSupabase(cfg)
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) return error.message
      await connectSession()
      return null
    },
    [connectSession]
  )

  const signUp = useCallback(
    async (email: string, password: string): Promise<'confirm-email' | string | null> => {
      const cfg = getCloudConfig()
      if (!cfg) return 'missing config'
      const sb = getSupabase(cfg)
      const { data, error } = await sb.auth.signUp({ email, password })
      if (error) return error.message
      if (!data.session) return 'confirm-email'
      await connectSession()
      return null
    },
    [connectSession]
  )

  const signOut = useCallback(async () => {
    const cfg = getCloudConfig()
    if (cfg) await getSupabase(cfg).auth.signOut()
    adapterRef.current = null
    setUserEmail(null)
    setSnapshot(EMPTY_SNAPSHOT)
    setStatus('auth')
  }, [])

  const backToWelcome = useCallback(() => {
    setMode(null)
    setModeState(null)
    adapterRef.current = null
    setSnapshot(EMPTY_SNAPSHOT)
    setStatus('welcome')
  }, [])

  // Optimistic mutation helper: apply locally, persist, refetch on failure.
  const mutate = useCallback(
    async (apply: (s: Snapshot) => Snapshot, persist: (a: DataAdapter) => Promise<void>) => {
      const adapter = adapterRef.current
      if (!adapter) return
      setSnapshot(apply)
      try {
        await persist(adapter)
      } catch {
        await refetch()
      }
    },
    [refetch]
  )

  const upsertItem = useCallback(
    (item: Item) =>
      mutate(
        (s) => ({ ...s, items: [...s.items.filter((i) => i.id !== item.id), item] }),
        (a) => a.upsertItem(item)
      ),
    [mutate]
  )

  const deleteItem = useCallback(
    (id: string) =>
      mutate(
        (s) => ({
          ...s,
          items: s.items.filter((i) => i.id !== id),
          payments: s.payments.filter((p) => p.itemId !== id),
        }),
        (a) => a.deleteItem(id)
      ),
    [mutate]
  )

  const upsertIncome = useCallback(
    (income: Income) =>
      mutate(
        (s) => ({ ...s, incomes: [...s.incomes.filter((i) => i.id !== income.id), income] }),
        (a) => a.upsertIncome(income)
      ),
    [mutate]
  )

  const deleteIncome = useCallback(
    (id: string) =>
      mutate(
        (s) => ({ ...s, incomes: s.incomes.filter((i) => i.id !== id) }),
        (a) => a.deleteIncome(id)
      ),
    [mutate]
  )

  const setPaid = useCallback(
    (item: Item, dueDate: string, paid: boolean) => {
      if (paid) {
        const payment: Payment = {
          id: crypto.randomUUID(),
          itemId: item.id,
          dueDate,
          paidAt: new Date().toISOString(),
          amount: item.amount,
        }
        return mutate(
          (s) => ({
            ...s,
            payments: [
              ...s.payments.filter((p) => !(p.itemId === item.id && p.dueDate === dueDate)),
              payment,
            ],
          }),
          (a) => a.addPayment(payment)
        )
      }
      return mutate(
        (s) => ({
          ...s,
          payments: s.payments.filter((p) => !(p.itemId === item.id && p.dueDate === dueDate)),
        }),
        (a) => a.removePayment(item.id, dueDate)
      )
    },
    [mutate]
  )

  const saveSettings = useCallback(
    (settings: HouseholdSettings) =>
      mutate(
        (s) => ({ ...s, settings }),
        (a) => a.saveSettings(settings)
      ),
    [mutate]
  )

  const resetDemo = useCallback(() => {
    resetDemoData()
    startAdapter(new LocalAdapter())
  }, [startAdapter])

  const value = useMemo<AppData>(
    () => ({
      status,
      mode,
      snapshot,
      loading,
      userEmail,
      chooseDemo,
      chooseCloud,
      signIn,
      signUp,
      signOut,
      backToWelcome,
      upsertItem,
      deleteItem,
      upsertIncome,
      deleteIncome,
      setPaid,
      saveSettings,
      resetDemo,
    }),
    [
      status,
      mode,
      snapshot,
      loading,
      userEmail,
      chooseDemo,
      chooseCloud,
      signIn,
      signUp,
      signOut,
      backToWelcome,
      upsertItem,
      deleteItem,
      upsertIncome,
      deleteIncome,
      setPaid,
      saveSettings,
      resetDemo,
    ]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppData(): AppData {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppData outside provider')
  return ctx
}
