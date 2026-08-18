import { useState, type ReactNode } from 'react'
import { useI18n, type TKey } from '../lib/i18n'

export interface MenuEntry {
  key: string
  emoji: string
  labelKey: TKey
  hintKey: TKey
  render: () => ReactNode
}

export interface MenuGroup {
  titleKey: TKey
  entries: MenuEntry[]
}

// The single index for everything that isn't the home screen or the
// day-to-day records: every function visible in one place, in named groups,
// each row with a one-line description. Tapping drills in; the back header
// returns here.
export function MenuScreen({
  groups,
  onOpenSettings,
}: {
  groups: MenuGroup[]
  onOpenSettings: () => void
}) {
  const { t } = useI18n()
  const [active, setActive] = useState<string | null>(null)
  const entry = groups.flatMap((g) => g.entries).find((e) => e.key === active)

  if (entry) {
    return (
      <div>
        <button
          onClick={() => setActive(null)}
          className="press mb-1 flex items-center gap-1 pt-2 text-[14px] font-bold text-ink2"
        >
          ← {t('tabMenu')}
        </button>
        <div key={entry.key} className="anim-screen">
          {entry.render()}
        </div>
      </div>
    )
  }

  const row = (
    key: string,
    emoji: string,
    label: string,
    hint: string,
    onClick: () => void,
    delay: number
  ) => (
    <button
      key={key}
      onClick={onClick}
      className="press anim-rise flex w-full items-center gap-3 px-4 py-3.5 text-left"
      style={{ animationDelay: `${Math.min(delay * 35, 300)}ms` }}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card2 text-xl">
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-ink">{label}</span>
        <span className="block text-[12px] leading-snug text-ink2">{hint}</span>
      </span>
      <span className="shrink-0 text-[16px] font-bold text-ink2">›</span>
    </button>
  )

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('tabMenu')}</h1>
      </header>

      {groups.map((g) => (
        <section key={g.titleKey}>
          <h2 className="mb-2 px-1 text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
            {t(g.titleKey)}
          </h2>
          <div className="divide-y divide-line rounded-2xl border border-line bg-card">
            {g.entries.map((e, i) =>
              row(e.key, e.emoji, t(e.labelKey), t(e.hintKey), () => setActive(e.key), i)
            )}
          </div>
        </section>
      ))}

      <div className="rounded-2xl border border-line bg-card">
        {row('settings', '⚙️', t('tabSettings'), t('menuSettingsHint'), onOpenSettings, 0)}
      </div>

      <p className="num pb-2 text-center text-[12px] font-semibold text-ink2">
        {t('appVersion', { v: __APP_VERSION__ })}
      </p>
    </div>
  )
}
