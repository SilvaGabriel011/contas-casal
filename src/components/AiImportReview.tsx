import { useEffect, useState } from 'react'
import type { Currency, Frequency, Income, Item, Owner } from '../types'
import { CATEGORIES } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n } from '../lib/i18n'
import { formatAmountInput, formatMoney, parseAmount } from '../lib/money'
import { categoryEmoji, categoryLabel } from '../lib/categories'
import { FREQ_EVERY, KIND_CONFIG } from '../lib/kinds'
import { getDeviceOwner } from '../lib/device'
import { todayISO } from '../lib/dates'
import type { QuickDraft } from '../lib/ai'
import { logError } from '../lib/errors'
import { inputCls, Segmented, Sheet } from './ui'

const TYPE_EMOJI: Record<QuickDraft['type'], string> = {
  expense: '☕',
  bill: '🧾',
  subscription: '🔁',
  installment: '💳',
  purchase: '🛍️',
  income: '💰',
}

const TYPES: QuickDraft['type'][] = ['bill', 'subscription', 'installment', 'purchase', 'expense', 'income']

interface Row {
  key: string
  type: QuickDraft['type']
  name: string
  amountRaw: string
  currency: Currency
  category: string
  owner: Owner
  paidBy: 'a' | 'b'
  date: string
  frequency: Frequency
  installments: string
  note: string
}

function rowFromDraft(d: QuickDraft, decimalSep: '.' | ','): Row {
  const freq = ['weekly', 'fortnightly', 'monthly', 'yearly', 'once'].includes(d.frequency ?? '')
    ? (d.frequency as Frequency)
    : 'monthly'
  const defaultCategory =
    d.type === 'expense' || d.type === 'income' ? 'other' : KIND_CONFIG[d.type].defaultCategory
  return {
    key: crypto.randomUUID(),
    type: d.type,
    name: d.name ?? d.note ?? '',
    amountRaw: formatAmountInput(d.amount, decimalSep),
    currency: d.currency,
    category: d.category ?? defaultCategory,
    owner: d.type === 'income' ? (d.owner === 'b' ? 'b' : 'a') : (d.owner ?? 'shared'),
    paidBy: d.paidBy ?? getDeviceOwner() ?? 'a',
    date: d.date ?? todayISO(),
    frequency: freq,
    installments: String(d.installmentsTotal ?? 12),
    note: d.note ?? '',
  }
}

// Summary modal: everything the AI read from a print, editable, and nothing is
// saved until the user hits confirm.
export function AiImportReview({
  drafts,
  onClose,
  onDone,
}: {
  drafts: QuickDraft[] | null
  onClose: () => void
  onDone: () => void
}) {
  const { snapshot, upsertItem, upsertIncome, upsertExpense } = useAppData()
  const { t, locale, decimalSep } = useI18n()
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (drafts) {
      setRows(drafts.map((d) => rowFromDraft(d, decimalSep)))
      setError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts])

  const patch = (key: string, changes: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...changes } : r)))

  const setType = (r: Row, type: QuickDraft['type']) => {
    const changes: Partial<Row> = { type }
    if (type === 'income' && r.owner === 'shared') changes.owner = 'a'
    if (type !== 'income' && type !== 'expense') {
      const cfg = KIND_CONFIG[type]
      if (cfg.forcedFrequency) changes.frequency = cfg.forcedFrequency
    }
    patch(r.key, changes)
  }

  const typeLabel = (type: QuickDraft['type']) =>
    type === 'income'
      ? t('income')
      : type === 'expense'
        ? t('quickExpense')
        : t(KIND_CONFIG[type].labelKey)

  const rowAmount = (r: Row) => parseAmount(r.amountRaw, decimalSep)

  const totals = rows.reduce<Partial<Record<Currency, number>>>((acc, r) => {
    const v = rowAmount(r)
    if (v !== null && v > 0 && r.type !== 'income')
      acc[r.currency] = (acc[r.currency] ?? 0) + v
    return acc
  }, {})

  const saveRow = async (r: Row) => {
    const amount = rowAmount(r)
    if (amount === null || amount <= 0) throw new Error('invalid')
    if (r.type === 'expense') {
      await upsertExpense({
        id: crypto.randomUUID(),
        date: r.date,
        amount,
        currency: r.currency,
        category: r.category,
        owner: r.owner,
        paidBy: r.paidBy,
        note: r.name.trim() || r.note.trim() || null,
        createdAt: new Date().toISOString(),
      })
      return
    }
    if (r.type === 'income') {
      const income: Income = {
        id: crypto.randomUUID(),
        name: r.name.trim() || t('income'),
        owner: r.owner === 'b' ? 'b' : 'a',
        amount,
        currency: r.currency,
        frequency:
          r.frequency === 'weekly' || r.frequency === 'fortnightly' ? r.frequency : 'monthly',
        nextDate: r.date,
        active: true,
        hourlyRate: null,
        hoursPerDay: null,
        daysPerWeek: null,
        createdAt: new Date().toISOString(),
      }
      await upsertIncome(income)
      return
    }
    const cfg = KIND_CONFIG[r.type]
    const item: Item = {
      id: crypto.randomUUID(),
      kind: r.type,
      name: r.name.trim() || categoryLabel(r.category, snapshot.settings, t),
      category: r.category,
      amount,
      currency: r.currency,
      owner: r.owner,
      frequency: cfg.forcedFrequency ?? r.frequency,
      startDate: r.date,
      installmentsTotal:
        r.type === 'installment' ? Math.max(1, Math.floor(Number(r.installments) || 0) || 12) : null,
      notes: r.note.trim() || null,
      archived: false,
      createdAt: new Date().toISOString(),
    }
    await upsertItem(item)
  }

  const confirmAll = async () => {
    if (rows.some((r) => rowAmount(r) === null || (rowAmount(r) ?? 0) <= 0))
      return setError(t('invalidAmount'))
    setBusy(true)
    setError('')
    try {
      for (const r of rows) await saveRow(r)
      onDone()
    } catch (e) {
      logError('ai-import-confirm', e)
      setError(t('saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const customCategories = snapshot.settings.customCategories
  const itemFreqOptions: Frequency[] = ['weekly', 'fortnightly', 'monthly', 'yearly', 'once']
  const incomeFreqOptions: Frequency[] = ['weekly', 'fortnightly', 'monthly']
  const selectCls = `${inputCls} appearance-none`

  return (
    <Sheet open={drafts !== null} onClose={onClose} title={`✨ ${t('aiReviewTitle')}`}>
      <div className="space-y-3 pb-4">
        <p className="text-[13px] font-semibold text-ink2">{t('aiReviewHint')}</p>

        {rows.map((r) => {
          const showFrequency = r.type === 'income' || r.type === 'bill' || r.type === 'subscription'
          return (
            <div key={r.key} className="anim-rise space-y-2.5 rounded-2xl border border-line bg-card2 p-3">
              <div className="flex items-center gap-2">
                <select
                  className={selectCls}
                  value={r.type}
                  onChange={(e) => setType(r, e.target.value as QuickDraft['type'])}
                >
                  {TYPES.map((k) => (
                    <option key={k} value={k}>
                      {TYPE_EMOJI[k]} {typeLabel(k)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  aria-label={t('delete')}
                  className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-[15px] font-bold text-bad"
                >
                  ✕
                </button>
              </div>

              <input
                className={inputCls}
                value={r.name}
                onChange={(e) => patch(r.key, { name: e.target.value })}
                placeholder={r.type === 'expense' ? t('notesPlaceholder') : t('namePlaceholder')}
              />

              <div className="grid grid-cols-2 gap-2">
                <input
                  className={`${inputCls} num`}
                  value={r.amountRaw}
                  onChange={(e) => patch(r.key, { amountRaw: e.target.value })}
                  inputMode="decimal"
                  placeholder={decimalSep === ',' ? '0,00' : '0.00'}
                />
                <Segmented
                  options={[
                    { value: 'AUD', label: '🇦🇺 AUD' },
                    { value: 'BRL', label: '🇧🇷 BRL' },
                  ]}
                  value={r.currency}
                  onChange={(currency) => patch(r.key, { currency })}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {r.type === 'income' ? (
                  <select
                    className={selectCls}
                    value={r.owner === 'b' ? 'b' : 'a'}
                    onChange={(e) => patch(r.key, { owner: e.target.value as Owner })}
                  >
                    <option value="a">{snapshot.settings.nameA}</option>
                    <option value="b">{snapshot.settings.nameB}</option>
                  </select>
                ) : (
                  <select
                    className={selectCls}
                    value={r.category}
                    onChange={(e) => patch(r.key, { category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {categoryEmoji(c, snapshot.settings)} {categoryLabel(c, snapshot.settings, t)}
                      </option>
                    ))}
                    {customCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.emoji} {c.label}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="date"
                  className={inputCls}
                  value={r.date}
                  onChange={(e) => e.target.value && patch(r.key, { date: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {r.type !== 'income' && (
                  <select
                    className={selectCls}
                    value={r.owner}
                    onChange={(e) => patch(r.key, { owner: e.target.value as Owner })}
                  >
                    <option value="a">{snapshot.settings.nameA}</option>
                    <option value="b">{snapshot.settings.nameB}</option>
                    <option value="shared">{t('couple')}</option>
                  </select>
                )}
                {showFrequency && (
                  <select
                    className={selectCls}
                    value={r.frequency}
                    onChange={(e) => patch(r.key, { frequency: e.target.value as Frequency })}
                  >
                    {(r.type === 'income' ? incomeFreqOptions : itemFreqOptions).map((f) => (
                      <option key={f} value={f}>
                        {t(FREQ_EVERY[f])}
                      </option>
                    ))}
                  </select>
                )}
                {r.type === 'installment' && (
                  <input
                    className={`${inputCls} num`}
                    value={r.installments}
                    onChange={(e) => patch(r.key, { installments: e.target.value })}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder={t('instModeCount')}
                  />
                )}
                {r.type === 'expense' && (
                  <Segmented
                    options={[
                      { value: 'a', label: snapshot.settings.nameA },
                      { value: 'b', label: snapshot.settings.nameB },
                    ]}
                    value={r.paidBy}
                    onChange={(paidBy) => patch(r.key, { paidBy })}
                  />
                )}
              </div>
            </div>
          )
        })}

        {rows.length === 0 && (
          <p className="rounded-2xl bg-card2 px-4 py-6 text-center text-[13px] font-semibold text-ink2">
            {t('aiQuickNone')}
          </p>
        )}

        {(totals.AUD || totals.BRL) && (
          <p className="num rounded-2xl bg-card2 px-4 py-2.5 text-[13px] font-bold text-ink">
            Σ{' '}
            {(['AUD', 'BRL'] as Currency[])
              .filter((c) => totals[c])
              .map((c) => formatMoney(totals[c] ?? 0, c, locale))
              .join(' · ')}
          </p>
        )}

        {error && <p className="text-sm font-semibold text-bad">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            disabled={busy}
            className="press rounded-2xl border border-line px-5 py-3.5 text-[15px] font-bold text-ink2 disabled:opacity-50"
          >
            {t('back')}
          </button>
          <button
            onClick={confirmAll}
            disabled={busy || rows.length === 0}
            className="press grad-accent flex-1 rounded-2xl py-3.5 text-[15px] font-bold text-white shadow-md disabled:opacity-50"
          >
            {busy ? t('aiThinking') : `✓ ${t('aiReviewConfirm', { n: rows.length })}`}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
