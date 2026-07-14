import { useMemo, useState } from 'react'
import type { Currency, Item, Profile } from '../types'
import { categoryEmoji } from '../lib/categories'
import { FREQ_EVERY } from '../lib/kinds'
import { ownerLabel } from '../lib/owners'
import { useAppData } from '../data/DataProvider'
import { useI18n } from '../lib/i18n'
import { formatMoney, formatMoneyShort, CURRENCY_FLAG } from '../lib/money'
import { installmentProgress, isItemFinished, monthlyEquivalent, visibleToProfile } from '../lib/schedule'
import { ProfileSwitcher } from '../components/ProfileSwitcher'
import { Chip, EmptyState, inputCls } from '../components/ui'

type StatusFilter = 'active' | 'finished' | 'all'

export function Items({
  profile,
  onProfile,
  onEditItem,
}: {
  profile: Profile
  onProfile: (p: Profile) => void
  onEditItem: (item: Item) => void
}) {
  const { snapshot } = useAppData()
  const { t, locale } = useI18n()
  const [search, setSearch] = useState('')
  const [currency, setCurrency] = useState<Currency | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>('active')

  const items = useMemo(() => {
    const q = search.trim().toLowerCase()
    return snapshot.items
      .filter((i) => visibleToProfile(i.owner, profile))
      .filter((i) => currency === 'all' || i.currency === currency)
      .filter((i) => {
        const finished = i.archived || isItemFinished(i, snapshot.payments)
        return status === 'all' || (status === 'finished') === finished
      })
      .filter((i) => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [snapshot.items, snapshot.payments, profile, currency, status, search])

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('tabBills')}</h1>
      </header>

      <ProfileSwitcher profile={profile} onChange={onProfile} />

      <input
        className={inputCls}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`🔍 ${t('searchPlaceholder')}`}
      />

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <Chip selected={currency === 'all'} onClick={() => setCurrency('all')}>
          {t('all')}
        </Chip>
        <Chip selected={currency === 'AUD'} onClick={() => setCurrency('AUD')}>
          🇦🇺 AUD
        </Chip>
        <Chip selected={currency === 'BRL'} onClick={() => setCurrency('BRL')}>
          🇧🇷 BRL
        </Chip>
        <span className="w-px shrink-0 bg-line" />
        <Chip selected={status === 'active'} onClick={() => setStatus('active')}>
          {t('active')}
        </Chip>
        <Chip selected={status === 'finished'} onClick={() => setStatus('finished')}>
          {t('finished')}
        </Chip>
        <Chip selected={status === 'all'} onClick={() => setStatus('all')}>
          {t('all')}
        </Chip>
      </div>

      {items.length === 0 ? (
        <EmptyState emoji="🗂️" title={t('noItems')} />
      ) : (
        <div className="divide-y divide-line rounded-2xl border border-line bg-card">
          {items.map((item, idx) => {
            const finished = item.archived || isItemFinished(item, snapshot.payments)
            const progress =
              item.kind === 'installment' && item.installmentsTotal
                ? installmentProgress(item, snapshot.payments)
                : null
            const ownerName = ownerLabel(item.owner, snapshot.settings, t)
            return (
              <button
                key={item.id}
                onClick={() => onEditItem(item)}
                className={`anim-rise flex w-full items-center gap-3 px-4 py-3 text-left min-[430px]:py-3.5 ${finished ? 'opacity-55' : ''}`}
                style={{ animationDelay: `${Math.min(idx * 35, 400)}ms` }}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card2 text-xl">
                  {categoryEmoji(item.category, snapshot.settings)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold text-ink">{item.name}</span>
                    <span className="text-xs">{CURRENCY_FLAG[item.currency]}</span>
                    {finished && (
                      <span className="rounded-full bg-good/15 px-1.5 py-px text-[10px] font-bold text-good">
                        {t('finishedBadge')}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-ink2">
                    {progress
                      ? `${t('parcel', { k: Math.min(progress.paid + 1, progress.total), n: progress.total })} · ${ownerName}`
                      : `${t(FREQ_EVERY[item.frequency])} · ${ownerName}`}
                  </span>
                  {progress && (
                    <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-card2">
                      <span
                        className="block h-full rounded-full bg-accent transition-all"
                        style={{ width: `${(progress.paid / progress.total) * 100}%` }}
                      />
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block text-[15px] font-bold text-ink">
                    {formatMoney(item.amount, item.currency, locale)}
                  </span>
                  {item.frequency !== 'monthly' && item.frequency !== 'once' && (
                    <span className="num block text-[11px] text-ink2">
                      {t('perMonthEq', {
                        v: formatMoneyShort(monthlyEquivalent(item.amount, item.frequency), item.currency, locale),
                      })}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
