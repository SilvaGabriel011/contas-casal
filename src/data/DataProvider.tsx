import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Expense, HouseholdSettings, Income, Item, Payment, Snapshot, Transfer } from '../types'
import { getDeviceOwner } from '../lib/device'
import {
  fetchRemoteConfig,
  getCloudConfig,
  getMode,
  saveCloudConfig,
  setMode,
  type AppMode,
  type CloudConfig,
} from '../lib/config'
import { EMPTY_SNAPSHOT, type DataAdapter } from './adapter'
import { LocalAdapter, resetDemoData } from './localAdapter'
import { getSupabase, SupabaseAdapter } from './supabaseAdapter'
import * as reduce from './reducers'

type Status = 'boot' | 'welcome' | 'auth' | 'ready'

interface AppData {
  status: Status
  mode: AppMode | null
  snapshot: Snapshot
  userEmail: string | null
  saveError: boolean
  dismissSaveError: () => void
  chooseDemo: () => void
  chooseCloud: (cfg: CloudConfig) => void
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<'confirm-email' | string | null>
  signOut: () => Promise<void>
  backToWelcome: () => void
  getAccessToken: () => Promise<string | null>
  getCalendarFeed: () => Promise<string | null>
  enableCalendarFeed: (lang: string) => Promise<string | null>
  disableCalendarFeed: () => Promise<void>
  upsertItem: (item: Item) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  upsertIncome: (income: Income) => Promise<void>
  deleteIncome: (id: string) => Promise<void>
  setPaid: (item: Item, dueDate: string, paid: boolean) => Promise<void>
  upsertExpense: (expense: Expense) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  upsertTransfer: (transfer: Transfer) => Promise<void>
  deleteTransfer: (id: string) => Promise<void>
  saveSettings: (settings: HouseholdSettings) => Promise<void>
  importSnapshot: (snapshot: Snapshot) => Promise<boolean>
  resetDemo: () => void
}

const Ctx = createContext<AppData | null>(null)

const cacheKey = (userId: string) => `cc.cache.v1.${userId}`

function readSnapshotCache(userId: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId))
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!Array.isArray(s.items) || !Array.isArray(s.incomes) || !Array.isArray(s.payments)) return null
    return { ...EMPTY_SNAPSHOT, ...s, settings: { ...EMPTY_SNAPSHOT.settings, ...s.settings } }
  } catch {
    return null
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('boot')
  const [mode, setModeState] = useState<AppMode | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)
  const adapterRef = useRef<DataAdapter | null>(null)
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unsubDataRef = useRef<(() => void) | null>(null)
  const unsubAuthRef = useRef<(() => void) | null>(null)
  const userIdRef = useRef<string | null>(null)

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

  const startAdapter = useCallback(async (adapter: DataAdapter) => {
    adapterRef.current = adapter
    setSnapshot(await adapter.load())
    setStatus('ready')
  }, [])

  const teardownCloud = useCallback(() => {
    unsubDataRef.current?.()
    unsubDataRef.current = null
  }, [])

  const handleSignedOut = useCallback(() => {
    teardownCloud()
    adapterRef.current = null
    if (userIdRef.current) {
      localStorage.removeItem(cacheKey(userIdRef.current))
      userIdRef.current = null
    }
    setUserEmail(null)
    setSnapshot(EMPTY_SNAPSHOT)
    setStatus('auth')
  }, [teardownCloud])

  // Registered once per page load, whichever path establishes the session.
  const ensureAuthListener = useCallback(
    (sb: SupabaseClient) => {
      if (unsubAuthRef.current) return
      const { data } = sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') handleSignedOut()
      })
      unsubAuthRef.current = () => data.subscription.unsubscribe()
    },
    [handleSignedOut]
  )

  const startCloudAdapter = useCallback(
    async (sb: SupabaseClient, userId: string, email: string | null) => {
      setUserEmail(email)
      userIdRef.current = userId
      const adapter = new SupabaseAdapter(sb, userId)
      const cached = readSnapshotCache(userId)
      if (cached) {
        // Instant open: render the last known data, revalidate in background.
        adapterRef.current = adapter
        setSnapshot(cached)
        setStatus('ready')
        refetch()
      } else {
        await startAdapter(adapter)
      }
      teardownCloud()
      unsubDataRef.current = adapter.subscribe?.(scheduleRefetch) ?? null
      ensureAuthListener(sb)
    },
    [startAdapter, teardownCloud, scheduleRefetch, ensureAuthListener, refetch]
  )

  // Write-through cache: every fresh snapshot becomes the next launch's instant paint.
  useEffect(() => {
    if (mode !== 'cloud' || status !== 'ready' || !userIdRef.current) return
    try {
      localStorage.setItem(cacheKey(userIdRef.current), JSON.stringify(snapshot))
    } catch {
      /* storage full — instant open just won't have fresh data */
    }
  }, [snapshot, mode, status])

  // Boot: restore previous mode/session.
  useEffect(() => {
    let cancelled = false

    async function boot() {
      const savedMode = getMode()
      if (savedMode === 'demo') {
        setModeState('demo')
        await startAdapter(new LocalAdapter())
        return
      }
      if (savedMode === 'cloud') {
        const cfg = getCloudConfig() ?? (await fetchRemoteConfig())
        if (cancelled) return
        if (cfg) {
          setModeState('cloud')
          const sb = getSupabase(cfg)
          const { data } = await sb.auth.getSession()
          if (cancelled) return
          const session = data.session
          if (session) {
            await startCloudAdapter(sb, session.user.id, session.user.email ?? null)
          } else {
            setStatus('auth')
            ensureAuthListener(sb)
          }
          return
        }
      }
      setStatus('welcome')
    }

    boot()
    return () => {
      cancelled = true
      unsubDataRef.current?.()
      unsubDataRef.current = null
      unsubAuthRef.current?.()
      unsubAuthRef.current = null
    }
  }, [startAdapter, startCloudAdapter, ensureAuthListener])

  // The realtime socket dies while iOS freezes the PWA in the background and
  // missed events are not replayed — refetch whenever the app becomes usable again.
  useEffect(() => {
    if (mode !== 'cloud') return
    const onWake = () => {
      if (!document.hidden) scheduleRefetch()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', onWake)
    return () => {
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', onWake)
    }
  }, [mode, scheduleRefetch])

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

  // Auth succeeded but the first data load failed — most commonly because
  // schema.sql was never run on the Supabase project. Return a code the UI
  // can turn into a clear instruction instead of failing silently.
  const loadErrorCode = (e: unknown): string => {
    const err = e as { code?: string; message?: string }
    if (
      err?.code === '42P01' ||
      err?.code === 'PGRST205' ||
      /relation .* does not exist|schema cache|does not exist/i.test(err?.message ?? '')
    ) {
      return 'missing-schema'
    }
    return err?.message || 'unknown'
  }

  const signIn = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      const cfg = getCloudConfig()
      if (!cfg) return 'missing-config'
      const sb = getSupabase(cfg)
      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      if (error) return error.message
      try {
        await startCloudAdapter(sb, data.session.user.id, data.session.user.email ?? null)
      } catch (e) {
        return loadErrorCode(e)
      }
      return null
    },
    [startCloudAdapter]
  )

  const signUp = useCallback(
    async (email: string, password: string): Promise<'confirm-email' | string | null> => {
      const cfg = getCloudConfig()
      if (!cfg) return 'missing-config'
      const sb = getSupabase(cfg)
      const { data, error } = await sb.auth.signUp({ email, password })
      if (error) return error.message
      if (!data.session) return 'confirm-email'
      try {
        await startCloudAdapter(sb, data.session.user.id, data.session.user.email ?? null)
      } catch (e) {
        return loadErrorCode(e)
      }
      return null
    },
    [startCloudAdapter]
  )

  const signOut = useCallback(async () => {
    const cfg = getCloudConfig()
    if (cfg) await getSupabase(cfg).auth.signOut()
    handleSignedOut()
  }, [handleSignedOut])

  const getAccessToken = useCallback(async () => {
    const cfg = getCloudConfig()
    if (!cfg) return null
    const { data } = await getSupabase(cfg).auth.getSession()
    return data.session?.access_token ?? null
  }, [])

  const getCalendarFeed = useCallback(async (): Promise<string | null> => {
    const cfg = getCloudConfig()
    if (!cfg || !userIdRef.current) return null
    const { data } = await getSupabase(cfg).from('calendar_feeds').select('token').maybeSingle()
    return (data?.token as string | undefined) ?? null
  }, [])

  const enableCalendarFeed = useCallback(async (lang: string): Promise<string | null> => {
    const cfg = getCloudConfig()
    if (!cfg || !userIdRef.current) return null
    const { data, error } = await getSupabase(cfg)
      .from('calendar_feeds')
      .upsert({ user_id: userIdRef.current, lang }, { onConflict: 'user_id' })
      .select('token')
      .single()
    if (error) return null
    return (data?.token as string | undefined) ?? null
  }, [])

  const disableCalendarFeed = useCallback(async () => {
    const cfg = getCloudConfig()
    if (!cfg || !userIdRef.current) return
    await getSupabase(cfg).from('calendar_feeds').delete().eq('user_id', userIdRef.current)
  }, [])

  const backToWelcome = useCallback(() => {
    teardownCloud()
    setMode(null)
    setModeState(null)
    adapterRef.current = null
    setSnapshot(EMPTY_SNAPSHOT)
    setStatus('welcome')
  }, [teardownCloud])

  // Optimistic mutation helper: apply locally, persist, roll back on failure.
  const mutate = useCallback(async (apply: (s: Snapshot) => Snapshot, persist: (a: DataAdapter) => Promise<void>) => {
    const adapter = adapterRef.current
    if (!adapter) return
    let before: Snapshot | null = null
    setSnapshot((s) => {
      before = s
      return apply(s)
    })
    try {
      await persist(adapter)
      setSaveError(false)
    } catch {
      setSaveError(true)
      try {
        setSnapshot(await adapter.load())
      } catch {
        // offline and unable to reload: undo the never-persisted change
        if (before) setSnapshot(before)
      }
    }
  }, [])

  const dismissSaveError = useCallback(() => setSaveError(false), [])

  const upsertItem = useCallback(
    (item: Item) => mutate((s) => reduce.upsertItem(s, item), (a) => a.upsertItem(item)),
    [mutate]
  )

  const deleteItem = useCallback(
    (id: string) => mutate((s) => reduce.deleteItem(s, id), (a) => a.deleteItem(id)),
    [mutate]
  )

  const upsertIncome = useCallback(
    (income: Income) => mutate((s) => reduce.upsertIncome(s, income), (a) => a.upsertIncome(income)),
    [mutate]
  )

  const deleteIncome = useCallback(
    (id: string) => mutate((s) => reduce.deleteIncome(s, id), (a) => a.deleteIncome(id)),
    [mutate]
  )

  const setPaid = useCallback(
    (item: Item, dueDate: string, paid: boolean) => {
      if (!paid) {
        return mutate(
          (s) => reduce.removePayment(s, item.id, dueDate),
          (a) => a.removePayment(item.id, dueDate)
        )
      }
      const payment: Payment = {
        id: crypto.randomUUID(),
        itemId: item.id,
        dueDate,
        paidAt: new Date().toISOString(),
        amount: item.amount,
        paidBy: getDeviceOwner(),
      }
      return mutate((s) => reduce.putPayment(s, payment), (a) => a.addPayment(payment))
    },
    [mutate]
  )

  const upsertExpense = useCallback(
    (expense: Expense) =>
      mutate((s) => reduce.upsertExpense(s, expense), (a) => a.upsertExpense(expense)),
    [mutate]
  )

  const deleteExpense = useCallback(
    (id: string) => mutate((s) => reduce.deleteExpense(s, id), (a) => a.deleteExpense(id)),
    [mutate]
  )

  const upsertTransfer = useCallback(
    (transfer: Transfer) =>
      mutate((s) => reduce.upsertTransfer(s, transfer), (a) => a.upsertTransfer(transfer)),
    [mutate]
  )

  const deleteTransfer = useCallback(
    (id: string) => mutate((s) => reduce.deleteTransfer(s, id), (a) => a.deleteTransfer(id)),
    [mutate]
  )

  const saveSettings = useCallback(
    (settings: HouseholdSettings) =>
      mutate((s) => reduce.putSettings(s, settings), (a) => a.saveSettings(settings)),
    [mutate]
  )

  const importSnapshot = useCallback(
    async (imported: Snapshot): Promise<boolean> => {
      const adapter = adapterRef.current
      if (!adapter) return false
      try {
        await adapter.replaceAll(imported)
        await refetch()
        return true
      } catch {
        await refetch()
        setSaveError(true)
        return false
      }
    },
    [refetch]
  )

  const resetDemo = useCallback(() => {
    resetDemoData()
    startAdapter(new LocalAdapter())
  }, [startAdapter])

  const value: AppData = {
    status,
    mode,
    snapshot,
    userEmail,
    saveError,
    dismissSaveError,
    chooseDemo,
    chooseCloud,
    signIn,
    signUp,
    signOut,
    backToWelcome,
    getAccessToken,
    getCalendarFeed,
    enableCalendarFeed,
    disableCalendarFeed,
    upsertItem,
    deleteItem,
    upsertIncome,
    deleteIncome,
    setPaid,
    upsertExpense,
    deleteExpense,
    upsertTransfer,
    deleteTransfer,
    saveSettings,
    importSnapshot,
    resetDemo,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppData(): AppData {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppData outside provider')
  return ctx
}
