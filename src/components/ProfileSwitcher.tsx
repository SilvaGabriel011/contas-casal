import type { Profile } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n } from '../lib/i18n'

const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase()

export function ProfileSwitcher({
  profile,
  onChange,
}: {
  profile: Profile
  onChange: (p: Profile) => void
}) {
  const { snapshot } = useAppData()
  const { t } = useI18n()
  const { nameA, nameB } = snapshot.settings

  const options: { value: Profile; avatar: string; label: string; grad: string }[] = [
    { value: 'a', avatar: initial(nameA), label: nameA, grad: 'grad-aud' },
    { value: 'b', avatar: initial(nameB), label: nameB, grad: 'grad-brl' },
    { value: 'shared', avatar: '❤️', label: t('couple'), grad: 'grad-accent' },
  ]

  return (
    <div className="flex gap-2">
      {options.map((o) => {
        const active = profile === o.value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`press flex flex-1 items-center justify-center gap-2 rounded-2xl border px-2 py-2.5 transition-all ${
              active ? 'border-transparent bg-card shadow-md' : 'border-line bg-transparent opacity-60'
            }`}
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold text-white ${o.grad}`}
            >
              {o.avatar}
            </span>
            <span className="max-w-[72px] truncate text-sm font-semibold text-ink">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
