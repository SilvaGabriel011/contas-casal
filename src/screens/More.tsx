import { useState, type ReactNode } from 'react'
import { useI18n, type TKey } from '../lib/i18n'
import { Settings } from './Settings'

export type MoreView =
  | 'menu'
  | 'expenses'
  | 'settle'
  | 'transfers'
  | 'tax'
  | 'charts'
  | 'reconcile'
  | 'settings'

interface MenuEntry {
  view: MoreView
  emoji: string
  labelKey: TKey
  hintKey: TKey
  render: () => ReactNode
}

export function More({ extraEntries = [] }: { extraEntries?: MenuEntry[] }) {
  const { t } = useI18n()
  const [view, setView] = useState<MoreView>('menu')

  const entries: MenuEntry[] = [
    ...extraEntries,
    {
      view: 'settings',
      emoji: '⚙️',
      labelKey: 'settingsTitle',
      hintKey: 'menuSettingsHint',
      render: () => <Settings />,
    },
  ]

  if (view !== 'menu') {
    const entry = entries.find((e) => e.view === view)
    if (entry) {
      return (
        <div>
          <button
            onClick={() => setView('menu')}
            className="press mb-2 flex items-center gap-1 pt-2 text-[14px] font-bold text-ink2"
          >
            ← {t('tabMore')}
          </button>
          <div className="anim-screen">{entry.render()}</div>
        </div>
      )
    }
  }

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('tabMore')}</h1>
      </header>
      <div className="space-y-2">
        {entries.map((e, i) => (
          <button
            key={e.view}
            onClick={() => setView(e.view)}
            className="anim-rise press flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 text-left"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-card2 text-xl">
              {e.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold text-ink">{t(e.labelKey)}</span>
              <span className="block truncate text-[12px] text-ink2">{t(e.hintKey)}</span>
            </span>
            <span className="text-ink2">›</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export type { MenuEntry }
