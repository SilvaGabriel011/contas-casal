import { useState, type ReactNode } from 'react'
import { useI18n, type TKey } from '../lib/i18n'

export interface SubEntry {
  key: string
  emoji: string
  labelKey: TKey
  render: () => ReactNode
}

// A themed tab: chip sub-navigation on top, last choice remembered per device.
export function SubNav({ storageKey, entries }: { storageKey: string; entries: SubEntry[] }) {
  const { t } = useI18n()
  const [active, setActive] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    return entries.some((e) => e.key === saved) ? (saved as string) : entries[0].key
  })
  const entry = entries.find((e) => e.key === active) ?? entries[0]

  return (
    <div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pt-3 pb-1">
        {entries.map((e) => (
          <button
            key={e.key}
            onClick={() => {
              setActive(e.key)
              localStorage.setItem(storageKey, e.key)
            }}
            className={`press shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-bold transition-colors ${
              active === e.key ? 'border-accent bg-card text-ink shadow-sm' : 'border-line bg-card2 text-ink2'
            }`}
          >
            {e.emoji} {t(e.labelKey)}
          </button>
        ))}
      </div>
      <div key={entry.key} className="anim-screen">
        {entry.render()}
      </div>
    </div>
  )
}
