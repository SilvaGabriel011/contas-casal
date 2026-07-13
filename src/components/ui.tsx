import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={`flex rounded-xl bg-card2 p-1 ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-all ${
            value === o.value ? 'bg-card text-ink shadow-sm' : 'text-ink2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`press shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
        selected ? 'border-transparent grad-accent text-white' : 'border-line bg-card text-ink2'
      }`}
    >
      {children}
    </button>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink2">{label}</span>
      {children}
    </label>
  )
}

export const inputCls =
  'w-full rounded-xl border border-line bg-card2 px-3.5 py-3 text-ink outline-none focus:border-accent'

export function Sheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
}) {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) setMounted(true)
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="anim-fade absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="anim-sheet absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-app pb-[max(env(safe-area-inset-bottom),16px)]">
        <div className="sticky top-0 z-10 bg-app pt-3 pb-2">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-line" />
          {title && <h2 className="mt-3 px-5 text-xl font-bold text-ink">{title}</h2>}
        </div>
        <div className="px-5 pt-2">{children}</div>
      </div>
    </div>,
    document.body
  )
}

export function EmptyState({ emoji, title, body }: { emoji: string; title: string; body?: string }) {
  return (
    <div className="anim-rise flex flex-col items-center px-8 py-14 text-center">
      <div className="text-5xl">{emoji}</div>
      <p className="mt-4 text-base font-semibold text-ink">{title}</p>
      {body && <p className="mt-1.5 text-sm leading-relaxed text-ink2">{body}</p>}
    </div>
  )
}

export function ProgressBar({ ratio, className = '' }: { ratio: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-white/25 ${className}`}>
      <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}
