import { useState, type ReactNode } from 'react'
import { useI18n, type TKey } from '../lib/i18n'

export interface SubEntry {
  key: string
  emoji: string
  labelKey: TKey
  render: () => ReactNode
}

// A themed tab: one dropdown to pick the sub-screen (native iOS picker — no
// clipped chip row to scroll), last choice remembered per device.
export function SubNav({ storageKey, entries }: { storageKey: string; entries: SubEntry[] }) {
  const { t } = useI18n()
  const [active, setActive] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    return entries.some((e) => e.key === saved) ? (saved as string) : entries[0].key
  })
  const entry = entries.find((e) => e.key === active) ?? entries[0]

  return (
    <div>
      <div className="relative mt-3 mb-1">
        <div className="flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3">
          <span className="text-[16px] font-extrabold text-ink">
            {entry.emoji} {t(entry.labelKey)}
          </span>
          <span className="text-[13px] font-bold text-ink2">▾</span>
        </div>
        <select
          value={active}
          onChange={(e) => {
            setActive(e.target.value)
            localStorage.setItem(storageKey, e.target.value)
          }}
          aria-label={t(entry.labelKey)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {entries.map((e) => (
            <option key={e.key} value={e.key}>
              {e.emoji} {t(e.labelKey)}
            </option>
          ))}
        </select>
      </div>
      <div key={entry.key} className="anim-screen">
        {entry.render()}
      </div>
    </div>
  )
}
