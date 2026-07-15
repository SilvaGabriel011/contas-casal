import { useRef, useState } from 'react'
import { CATEGORIES } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay } from '../lib/i18n'
import { formatMoney } from '../lib/money'
import { categoryEmoji, categoryLabel } from '../lib/categories'
import { getDeviceOwner } from '../lib/device'
import { buildOccurrences } from '../lib/schedule'
import { addDays } from '../lib/dates'
import { parseCommBankCsv, reconcile, type ReconcileResult } from '../lib/commbank'
import { logError } from '../lib/errors'
import { EmptyState, inputCls } from '../components/ui'

export function ReconcileScreen() {
  const { snapshot, setPaid, upsertExpense } = useAppData()
  const { t, locale } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<ReconcileResult | null>(null)
  const [checkedBills, setCheckedBills] = useState<Set<number>>(new Set())
  const [checkedNew, setCheckedNew] = useState<Set<number>>(new Set())
  const [categories, setCategories] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')
  const [error, setError] = useState('')

  const load = (file: File) => {
    setError('')
    setDoneMsg('')
    const reader = new FileReader()
    reader.onload = () => {
      const txs = parseCommBankCsv(String(reader.result ?? ''))
      if (txs.length === 0) {
        setResult(null)
        setError(t('reconcileParseFail'))
        return
      }
      const from = addDays(txs[0].date, -7)
      const to = addDays(txs[txs.length - 1].date, 7)
      const occs = buildOccurrences(snapshot.items, snapshot.payments, from, to).filter((o) => !o.payment)
      const r = reconcile(txs, occs, snapshot.expenses)
      setResult(r)
      setCheckedBills(new Set(r.billMatches.map((_, i) => i)))
      setCheckedNew(new Set(r.newExpenses.map((_, i) => i)))
      setCategories(r.newExpenses.map((n) => n.category))
    }
    reader.readAsText(file)
  }

  const apply = async () => {
    if (!result) return
    setBusy(true)
    try {
      let bills = 0
      let created = 0
      for (const [i, m] of result.billMatches.entries()) {
        if (!checkedBills.has(i)) continue
        await setPaid(m.occ.item, m.occ.dueDate, true)
        bills++
      }
      for (const [i, n] of result.newExpenses.entries()) {
        if (!checkedNew.has(i)) continue
        await upsertExpense({
          id: crypto.randomUUID(),
          date: n.tx.date,
          amount: -n.tx.amount,
          currency: 'AUD',
          category: categories[i] ?? n.category,
          owner: 'shared',
          paidBy: getDeviceOwner(),
          note: n.note,
          createdAt: new Date().toISOString(),
        })
        created++
      }
      setDoneMsg(t('reconcileDone', { b: bills, e: created }))
      setResult(null)
    } catch (e) {
      logError('reconcile', e)
      setError(t('saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (set: Set<number>, i: number, update: (s: Set<number>) => void) => {
    const next = new Set(set)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    update(next)
  }

  const allCats: string[] = [...CATEGORIES, ...snapshot.settings.customCategories.map((c) => c.id)]
  const nSelected = checkedBills.size + checkedNew.size

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">🏦 {t('menuReconcile')}</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink2">{t('reconcileIntro')}</p>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) load(f)
          e.target.value = ''
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="press grad-accent w-full rounded-2xl py-3.5 text-[15px] font-bold text-white shadow-md"
      >
        📎 {t('reconcilePick')}
      </button>

      {doneMsg && (
        <p className="anim-rise rounded-2xl bg-good/10 px-4 py-3 text-[13px] font-bold text-good">✓ {doneMsg}</p>
      )}
      {error && <p className="anim-rise rounded-2xl bg-bad/10 px-4 py-3 text-[13px] font-semibold text-bad">{error}</p>}

      {result && (
        <>
          <p className="num anim-rise rounded-2xl border border-line bg-card2 px-4 py-3 text-[12px] font-semibold text-ink2">
            {t('reconcileSummary', {
              n: result.billMatches.length + result.newExpenses.length + result.alreadyRecorded.length + result.credits.length,
              r: result.alreadyRecorded.length,
              c: result.credits.length,
            })}
          </p>

          {result.billMatches.length > 0 && (
            <section className="anim-rise">
              <h2 className="mb-2 px-1 text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
                🧾 {t('reconcileBills')} ({result.billMatches.length})
              </h2>
              <div className="divide-y divide-line rounded-2xl border border-line bg-card">
                {result.billMatches.map((m, i) => (
                  <label key={i} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={checkedBills.has(i)}
                      onChange={() => toggle(checkedBills, i, setCheckedBills)}
                      className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-ink">{m.occ.item.name}</span>
                      <span className="block truncate text-[11px] text-ink2">
                        {formatDay(m.tx.date, locale)} · {m.tx.description.slice(0, 40)}
                      </span>
                    </span>
                    <span className="num shrink-0 text-[14px] font-bold text-ink">
                      {formatMoney(-m.tx.amount, 'AUD', locale)}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1 px-1 text-[11px] text-ink2">{t('reconcileBillsHint')}</p>
            </section>
          )}

          {result.newExpenses.length > 0 && (
            <section className="anim-rise">
              <h2 className="mb-2 px-1 text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
                ☕ {t('reconcileNew')} ({result.newExpenses.length})
              </h2>
              <div className="divide-y divide-line rounded-2xl border border-line bg-card">
                {result.newExpenses.map((n, i) => (
                  <div key={i} className="flex w-full items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={checkedNew.has(i)}
                      onChange={() => toggle(checkedNew, i, setCheckedNew)}
                      className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-ink">{n.note}</span>
                      <span className="block text-[11px] text-ink2">{formatDay(n.tx.date, locale)}</span>
                      <select
                        value={categories[i] ?? n.category}
                        onChange={(e) => {
                          const next = [...categories]
                          next[i] = e.target.value
                          setCategories(next)
                        }}
                        className={`${inputCls} mt-1 w-auto py-1 text-[12px]`}
                      >
                        {allCats.map((c) => (
                          <option key={c} value={c}>
                            {categoryEmoji(c, snapshot.settings)} {categoryLabel(c, snapshot.settings, t)}
                          </option>
                        ))}
                      </select>
                    </span>
                    <span className="num shrink-0 text-[14px] font-bold text-ink">
                      {formatMoney(-n.tx.amount, 'AUD', locale)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {result.billMatches.length === 0 && result.newExpenses.length === 0 ? (
            <EmptyState emoji="✅" title={t('reconcileAllDone')} />
          ) : (
            <button
              onClick={apply}
              disabled={busy || nSelected === 0}
              className="press grad-accent w-full rounded-2xl py-3.5 text-[15px] font-bold text-white shadow-md disabled:opacity-50"
            >
              {busy ? t('loading') : t('reconcileApply', { n: nSelected })}
            </button>
          )}
        </>
      )}
    </div>
  )
}
