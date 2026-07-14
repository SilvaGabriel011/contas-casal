import type { Occurrence, Profile } from '../types'
import { categoryEmoji } from '../lib/categories'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay } from '../lib/i18n'
import { formatMoney, CURRENCY_FLAG } from '../lib/money'
import { daysBetween, todayISO } from '../lib/dates'

export function OccurrenceRow({
  occ,
  profile,
  onEdit,
}: {
  occ: Occurrence
  profile: Profile
  onEdit: () => void
}) {
  const { setPaid, snapshot } = useAppData()
  const { t, locale } = useI18n()
  const today = todayISO()
  const paid = Boolean(occ.payment)
  const overdueDays = paid ? 0 : daysBetween(occ.dueDate, today)

  const { item } = occ
  const ownerName =
    item.owner === 'a' ? snapshot.settings.nameA : item.owner === 'b' ? snapshot.settings.nameB : null

  let dueLabel: string
  if (occ.dueDate === today) dueLabel = t('dueToday')
  else if (overdueDays > 0) dueLabel = t('overdueBy', { n: overdueDays })
  else dueLabel = formatDay(occ.dueDate, locale)

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${paid ? 'opacity-55' : ''}`}>
      <button onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card2 text-xl">
          {categoryEmoji(item.category, snapshot.settings)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={`truncate text-[15px] font-semibold text-ink ${paid ? 'line-through' : ''}`}>
              {item.name}
            </span>
            <span className="shrink-0 text-xs">{CURRENCY_FLAG[item.currency]}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className={overdueDays > 0 ? 'font-bold text-bad' : 'text-ink2'}>{dueLabel}</span>
            {item.kind === 'installment' && item.installmentsTotal && (
              <span className="rounded-full bg-card2 px-1.5 py-px font-medium text-ink2">
                {t('parcel', { k: occ.index + 1, n: item.installmentsTotal })}
              </span>
            )}
            {profile === 'shared' && ownerName && (
              <span className="rounded-full bg-card2 px-1.5 py-px font-medium text-ink2">{ownerName}</span>
            )}
          </span>
        </span>
      </button>

      <span className={`num shrink-0 text-[15px] font-bold ${paid ? 'text-ink2 line-through' : 'text-ink'}`}>
        {formatMoney(occ.payment?.amount ?? item.amount, item.currency, locale)}
      </span>

      <button
        onClick={() => setPaid(item, occ.dueDate, !paid)}
        aria-label={paid ? t('unpay') : t('pay')}
        className={`press flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors ${
          paid ? 'border-good bg-good text-white' : 'border-line text-transparent'
        }`}
      >
        {paid && <span className="anim-pop">✓</span>}
      </button>
    </div>
  )
}
