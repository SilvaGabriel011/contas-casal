import { useState, type ReactNode } from 'react'
import { useI18n, type TKey } from '../lib/i18n'

export interface SubEntry {
  key: string
  emoji: string
  labelKey: TKey
  hintKey: TKey
  render: () => ReactNode
}

// A themed tab opens on its hub: every section laid out as a labeled row with
// a one-line description, instead of hiding behind a dropdown. Tapping a row
// drills into that section; the back header returns to the hub.
export function SubNav({
  titleKey,
  subtitleKey,
  entries,
}: {
  titleKey: TKey
  subtitleKey: TKey
  entries: SubEntry[]
}) {
  const { t } = useI18n()
  const [active, setActive] = useState<string | null>(null)
  const entry = entries.find((e) => e.key === active)

  if (!entry) {
    return (
      <div className="space-y-4">
        <header className="pt-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t(titleKey)}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-ink2">{t(subtitleKey)}</p>
        </header>
        <div className="divide-y divide-line rounded-2xl border border-line bg-card">
          {entries.map((e, i) => (
            <button
              key={e.key}
              onClick={() => setActive(e.key)}
              className="press anim-rise flex w-full items-center gap-3 px-4 py-3.5 text-left"
              style={{ animationDelay: `${Math.min(i * 40, 300)}ms` }}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card2 text-xl">
                {e.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-ink">{t(e.labelKey)}</span>
                <span className="block text-[12px] leading-snug text-ink2">{t(e.hintKey)}</span>
              </span>
              <span className="shrink-0 text-[16px] font-bold text-ink2">›</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setActive(null)}
        className="press mb-1 flex items-center gap-1 pt-2 text-[14px] font-bold text-ink2"
      >
        ← {t(titleKey)}
      </button>
      <div key={entry.key} className="anim-screen">
        {entry.render()}
      </div>
    </div>
  )
}
