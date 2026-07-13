import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'cc.theme'

interface ThemeCtx {
  theme: Theme
  isDark: boolean
  setTheme: (t: Theme) => void
}

const Ctx = createContext<ThemeCtx | null>(null)

function systemDark(): boolean {
  return matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'auto'
  })
  const [sysDark, setSysDark] = useState(systemDark)

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSysDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const isDark = theme === 'dark' || (theme === 'auto' && sysDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    const meta = document.querySelector('meta[name="theme-color"]:not([media])')
    const color = isDark ? '#0b0e13' : '#f4f5f7'
    if (meta) meta.setAttribute('content', color)
    else {
      const m = document.createElement('meta')
      m.name = 'theme-color'
      m.content = color
      document.head.appendChild(m)
    }
  }, [isDark])

  const setTheme = useCallback((t: Theme) => {
    if (t === 'auto') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, t)
    setThemeState(t)
  }, [])

  const value = useMemo(() => ({ theme, isDark, setTheme }), [theme, isDark, setTheme])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme outside provider')
  return ctx
}
