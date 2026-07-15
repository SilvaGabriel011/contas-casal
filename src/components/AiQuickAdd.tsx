import { useState } from 'react'
import type { Income, Item } from '../types'
import { CATEGORIES } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n } from '../lib/i18n'
import { formatMoney } from '../lib/money'
import { categoryLabel } from '../lib/categories'
import { KIND_CONFIG } from '../lib/kinds'
import { getDeviceOwner } from '../lib/device'
import { todayISO } from '../lib/dates'
import { parseQuickAdd, type QuickDraft } from '../lib/ai'
import { inputCls } from './ui'

const TYPE_EMOJI: Record<QuickDraft['type'], string> = {
  expense: '☕',
  bill: '🧾',
  subscription: '🔁',
  installment: '💳',
  purchase: '🛍️',
  income: '💰',
}

export function AiQuickAdd({ onDone }: { onDone: () => void }) {
  const { snapshot, mode, getAccessToken, upsertItem, upsertIncome, upsertExpense } = useAppData()
  const { t, lang, locale } = useI18n()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<QuickDraft[] | null>(null)

  if (mode !== 'cloud') return null

  const run = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setError('')
    setDrafts(null)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('unauthorized')
      const result = await parseQuickAdd(
        text,
        {
          today: todayISO(),
          nameA: snapshot.settings.nameA,
          nameB: snapshot.settings.nameB,
          categories: [...CATEGORIES, ...snapshot.settings.customCategories.map((c) => c.id)],
        },
        lang,
        token
      )
      if (result.length === 0) setError(t('aiQuickNone'))
      else setDrafts(result)
    } catch (e) {
      const code = (e as Error).message
      setError(
        code === 'missing-openai-key'
          ? t('aiErrorNoKey')
          : code === 'unavailable'
            ? t('aiErrorUnavailable')
            : t('aiErrorGeneric')
      )
    } finally {
      setBusy(false)
    }
  }

  const addDraft = async (d: QuickDraft) => {
    const today = todayISO()
    const freq = ['weekly', 'fortnightly', 'monthly', 'yearly', 'once'].includes(d.frequency ?? '')
      ? (d.frequency as Item['frequency'])
      : 'monthly'
    if (d.type === 'expense') {
      await upsertExpense({
        id: crypto.randomUUID(),
        date: d.date ?? today,
        amount: d.amount,
        currency: d.currency,
        category: d.category ?? 'other',
        owner: d.owner ?? 'shared',
        paidBy: d.paidBy ?? getDeviceOwner(),
        note: d.note || d.name || null,
        createdAt: new Date().toISOString(),
      })
    } else if (d.type === 'income') {
      const income: Income = {
        id: crypto.randomUUID(),
        name: d.name || t('income'),
        owner: d.owner === 'b' ? 'b' : 'a',
        amount: d.amount,
        currency: d.currency,
        frequency: freq === 'weekly' || freq === 'fortnightly' ? freq : 'monthly',
        nextDate: d.date ?? today,
        active: true,
        hourlyRate: null,
        hoursPerDay: null,
        daysPerWeek: null,
        createdAt: new Date().toISOString(),
      }
      await upsertIncome(income)
    } else {
      const cfg = KIND_CONFIG[d.type]
      await upsertItem({
        id: crypto.randomUUID(),
        kind: d.type,
        name: d.name || categoryLabel(d.category ?? cfg.defaultCategory, snapshot.settings, t),
        category: d.category ?? cfg.defaultCategory,
        amount: d.amount,
        currency: d.currency,
        owner: d.owner ?? 'shared',
        frequency: cfg.forcedFrequency ?? freq,
        startDate: d.date ?? today,
        installmentsTotal: d.type === 'installment' ? (d.installmentsTotal ?? 12) : null,
        notes: d.note ?? null,
        archived: false,
        createdAt: new Date().toISOString(),
      })
    }
  }

  const addAll = async () => {
    if (!drafts) return
    setBusy(true)
    try {
      for (const d of drafts) await addDraft(d)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const draftLabel = (d: QuickDraft) => {
    const what = d.name || d.note || categoryLabel(d.category ?? 'other', snapshot.settings, t)
    return `${TYPE_EMOJI[d.type]} ${what} — ${formatMoney(d.amount, d.currency, locale)}`
  }

  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-accent/50 bg-card2 p-3">
      <p className="text-[13px] font-bold text-ink">✨ {t('aiQuickTitle')}</p>
      <textarea
        className={`${inputCls} min-h-[64px] resize-none`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('aiQuickPlaceholder')}
        rows={2}
      />
      <button
        onClick={run}
        disabled={busy || !text.trim()}
        className="press grad-accent w-full rounded-xl py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
      >
        {busy ? t('aiThinking') : t('aiQuickCreate')}
      </button>
      {error && <p className="text-[13px] font-semibold text-bad">{error}</p>}
      {drafts && (
        <div className="space-y-1.5">
          {drafts.map((d, i) => (
            <p key={i} className="anim-rise rounded-xl bg-card px-3 py-2 text-[13px] font-semibold text-ink">
              {draftLabel(d)}
            </p>
          ))}
          <button
            onClick={addAll}
            disabled={busy}
            className="press w-full rounded-xl border border-accent py-2.5 text-[14px] font-bold text-accent disabled:opacity-50"
          >
            ＋ {t('aiQuickAddAll', { n: drafts.length })}
          </button>
        </div>
      )}
    </div>
  )
}
