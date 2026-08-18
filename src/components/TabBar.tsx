import { useI18n } from '../lib/i18n'

export type Tab = 'today' | 'records' | 'menu'

const ICONS: Record<Tab, string> = { today: '🏡', records: '🧾', menu: '📚' }

export function TabBar({
  tab,
  onTab,
  onAdd,
}: {
  tab: Tab
  onTab: (t: Tab) => void
  onAdd: () => void
}) {
  const { t } = useI18n()
  const tabs: { key: Tab; label: string }[] = [
    { key: 'today', label: t('tabToday') },
    { key: 'records', label: t('tabRecords') },
    { key: 'menu', label: t('tabMenu') },
  ]

  const renderTab = ({ key, label }: { key: Tab; label: string }) => (
    <button
      key={key}
      onClick={() => onTab(key)}
      className="press flex flex-1 flex-col items-center gap-0.5 py-2.5"
      aria-label={label}
      aria-current={tab === key ? 'page' : undefined}
    >
      <span
        key={tab === key ? 'active' : 'idle'}
        className={`text-[22px] leading-none min-[430px]:text-2xl ${tab === key ? 'anim-pop' : 'opacity-60 saturate-50'}`}
      >
        {ICONS[key]}
      </span>
      <span className={`text-[10px] font-semibold min-[430px]:text-[11px] ${tab === key ? 'text-ink' : 'text-ink2'}`}>
        {label}
      </span>
    </button>
  )

  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-line pb-[env(safe-area-inset-bottom)]">
      {/* With an odd number of tabs the FAB can't live in the flex flow (it
          would land off-center); it's anchored to the true middle instead,
          with each side of the bar taking an equal half. */}
      <div className="relative mx-auto flex max-w-lg items-center px-2">
        <div className="flex flex-1">{tabs.slice(0, 2).map(renderTab)}</div>
        <div className="w-20 shrink-0" />
        <div className="flex flex-1">{tabs.slice(2).map(renderTab)}</div>
        <div className="absolute -top-6 left-1/2 -translate-x-1/2">
          <button
            onClick={onAdd}
            aria-label="+"
            className="press grad-accent fab-live flex h-16 w-16 items-center justify-center rounded-full text-4xl font-light text-white shadow-lg shadow-black/25"
          >
            +
          </button>
        </div>
      </div>
    </nav>
  )
}
