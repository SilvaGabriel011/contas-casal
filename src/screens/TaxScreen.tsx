import { useMemo, useState } from 'react'
import type { Currency } from '../types'
import { CATEGORIES } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay } from '../lib/i18n'
import { formatMoney, formatMoneyShort } from '../lib/money'
import { categoryEmoji, categoryLabel } from '../lib/categories'
import { personName } from '../lib/owners'
import { incomeDates } from '../lib/schedule'
import { monthOf } from '../lib/expenses'
import { todayISO } from '../lib/dates'
import { deductibleExpenses, fyEndYear, fyLabel, fyRange, taxCsv } from '../lib/tax'
import { Chip, Segmented } from '../components/ui'

export function TaxScreen() {
  const { snapshot, saveSettings } = useAppData()
  const { t, locale } = useI18n()
  const today = todayISO()
  const currentFy = fyEndYear(today)
  const [fy, setFy] = useState(currentFy)
  const taxCats = useMemo(() => snapshot.settings.taxCategories ?? [], [snapshot.settings.taxCategories])
  const [copied, setCopied] = useState(false)

  const { from, to } = fyRange(fy)

  // Estimated AUD income actually received in the FY window so far,
  // extrapolated from each income's pay cadence.
  const incomeByPerson = useMemo(() => {
    const totals: Record<'a' | 'b', number> = { a: 0, b: 0 }
    const cappedTo = to < today ? to : today
    for (const inc of snapshot.incomes) {
      if (!inc.active || inc.currency !== 'AUD') continue
      const born = monthOf(inc.createdAt) < monthOf(inc.nextDate) ? monthOf(inc.createdAt) : monthOf(inc.nextDate)
      const start = `${born}-01` > from ? `${born}-01` : from
      if (start > cappedTo) continue
      const n = incomeDates(inc, start, cappedTo).length
      const owner = inc.owner === 'b' ? 'b' : 'a'
      totals[owner] += n * inc.amount
    }
    return totals
  }, [snapshot.incomes, from, to, today])

  const deductible = useMemo(
    () => deductibleExpenses(snapshot.expenses, fy, taxCats),
    [snapshot.expenses, fy, taxCats]
  )

  const byCategory = useMemo(() => {
    const map = new Map<string, { total: number; currency: Currency; n: number }>()
    for (const e of deductible) {
      const cur = map.get(e.category)
      if (cur && cur.currency === e.currency) {
        cur.total += e.amount
        cur.n += 1
      } else if (!cur) map.set(e.category, { total: e.amount, currency: e.currency, n: 1 })
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [deductible])

  const totalAud = deductible.filter((e) => e.currency === 'AUD').reduce((s, e) => s + e.amount, 0)

  const toggleCat = async (cat: string) => {
    const next = taxCats.includes(cat) ? taxCats.filter((c) => c !== cat) : [...taxCats, cat]
    await saveSettings({ ...snapshot.settings, taxCategories: next })
  }

  const exportCsv = () => {
    const csv = taxCsv(deductible, (e) => categoryLabel(e.category, snapshot.settings, t))
    const file = new File([csv], `tax-fy${fyLabel(fy).replace('–', '-')}.csv`, { type: 'text/csv' })
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file] }).catch(() => {})
      return
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const copySummary = async () => {
    const lines = [
      `🧾 Tax FY ${fyLabel(fy)} — Contas do Casal`,
      `${t('taxIncomeTitle')}:`,
      `  ${personName('a', snapshot.settings)}: ${formatMoney(incomeByPerson.a, 'AUD', locale)}`,
      `  ${personName('b', snapshot.settings)}: ${formatMoney(incomeByPerson.b, 'AUD', locale)}`,
      `${t('taxDeductibleTitle')} (${deductible.length}):`,
      ...byCategory.map(
        ([cat, v]) =>
          `  ${categoryLabel(cat, snapshot.settings, t)}: ${formatMoney(v.total, v.currency, locale)} (${v.n})`
      ),
      `${t('taxTotal')}: ${formatMoney(totalAud, 'AUD', locale)}`,
    ].join('\n')
    await navigator.clipboard?.writeText(lines)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const allCats: string[] = [...CATEGORIES, ...snapshot.settings.customCategories.map((c) => c.id)]
  const fyOptions = [currentFy - 2, currentFy - 1, currentFy]

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">🧾 {t('menuTax')}</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink2">{t('taxIntro')}</p>
      </header>

      <Segmented
        options={fyOptions.map((y) => ({ value: String(y), label: `FY ${fyLabel(y)}` }))}
        value={String(fy)}
        onChange={(v) => setFy(Number(v))}
      />

      <section className="anim-rise rounded-3xl border border-line bg-card p-4">
        <h2 className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
          💰 {t('taxIncomeTitle')}
        </h2>
        <p className="mt-0.5 text-[11px] text-ink2">{t('taxIncomeHint')}</p>
        {(['a', 'b'] as const).map((p) => (
          <div key={p} className="mt-2 flex items-baseline justify-between">
            <span className="text-[14px] font-bold text-ink">{personName(p, snapshot.settings)}</span>
            <span className="num text-[15px] font-extrabold text-ink">
              {formatMoney(incomeByPerson[p], 'AUD', locale)}
            </span>
          </div>
        ))}
      </section>

      <section className="anim-rise rounded-3xl border border-line bg-card p-4">
        <h2 className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
          🏷️ {t('taxCatsTitle')}
        </h2>
        <p className="mt-0.5 mb-2 text-[11px] leading-relaxed text-ink2">{t('taxCatsHint')}</p>
        <div className="flex flex-wrap gap-2">
          {allCats.map((c) => (
            <Chip key={c} selected={taxCats.includes(c)} onClick={() => toggleCat(c)}>
              {categoryEmoji(c, snapshot.settings)} {categoryLabel(c, snapshot.settings, t)}
            </Chip>
          ))}
        </div>
      </section>

      <section className="anim-rise rounded-3xl border border-line bg-card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
            📋 {t('taxDeductibleTitle')}
          </h2>
          <span className="num text-[15px] font-extrabold text-ink">
            {formatMoneyShort(totalAud, 'AUD', locale)}
          </span>
        </div>
        {deductible.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink2">{t('taxEmpty')}</p>
        ) : (
          <>
            <div className="mt-2 space-y-1.5">
              {byCategory.map(([cat, v]) => (
                <div key={cat} className="flex items-baseline justify-between text-[13px]">
                  <span className="font-semibold text-ink">
                    {categoryEmoji(cat, snapshot.settings)} {categoryLabel(cat, snapshot.settings, t)}{' '}
                    <span className="text-ink2">×{v.n}</span>
                  </span>
                  <span className="num font-bold text-ink">{formatMoneyShort(v.total, v.currency, locale)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-xl bg-card2 p-2">
              {deductible.map((e) => (
                <p key={e.id} className="flex justify-between gap-2 px-2 py-1 text-[12px]">
                  <span className="min-w-0 truncate text-ink">
                    {formatDay(e.date, locale)} · {e.note || categoryLabel(e.category, snapshot.settings, t)}
                  </span>
                  <span className="num shrink-0 font-bold text-ink">{formatMoney(e.amount, e.currency, locale)}</span>
                </p>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="flex gap-2">
        <button
          onClick={copySummary}
          className="press flex-1 rounded-2xl border border-line bg-card py-3 text-[14px] font-bold text-ink"
        >
          {copied ? `✓ ${t('calendarFeedCopied')}` : `📋 ${t('taxCopy')}`}
        </button>
        <button
          onClick={exportCsv}
          disabled={deductible.length === 0}
          className="press grad-accent flex-1 rounded-2xl py-3 text-[14px] font-bold text-white disabled:opacity-50"
        >
          ⬇️ {t('taxExport')}
        </button>
      </div>
      <p className="px-1 text-[11px] leading-relaxed text-ink2">{t('taxDisclaimer')}</p>
    </div>
  )
}
