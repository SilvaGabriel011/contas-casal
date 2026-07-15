import { useRef } from 'react'

// Four visual boxes backed by one invisible input, so the iOS numeric
// keyboard and paste both just work.
export function PinInput({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)

  return (
    <label className="block">
      <span className="mb-1.5 block text-center text-[13px] font-semibold text-ink2">{label}</span>
      <div className="relative">
        <input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          autoFocus={autoFocus}
          aria-label={label}
          className="absolute inset-0 z-10 opacity-0"
          style={{ caretColor: 'transparent' }}
        />
        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`flex h-14 w-12 items-center justify-center rounded-2xl border-2 text-2xl font-bold text-ink transition-colors ${
                i < value.length
                  ? 'anim-pop border-accent bg-card'
                  : i === value.length
                    ? 'border-accent bg-card2'
                    : 'border-line bg-card2'
              }`}
            >
              {value[i] ? '•' : ''}
            </div>
          ))}
        </div>
      </div>
    </label>
  )
}
