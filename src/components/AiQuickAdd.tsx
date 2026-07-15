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
import { useRef } from 'react'
import { parseQuickAdd, parseReceipt, type QuickAddMeta, type QuickDraft } from '../lib/ai'
import { useDictation } from '../lib/speech'
import { downscaleImage } from '../lib/image'
import { logError } from '../lib/errors'
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
  const dictation = useDictation(locale, setText, () => setError(t('speechDenied')))
  const receiptRef = useRef<HTMLInputElement>(null)

  if (mode !== 'cloud') return null

  const buildMeta = (): QuickAddMeta => ({
    today: todayISO(),
    nameA: snapshot.settings.nameA,
    nameB: snapshot.settings.nameB,
    categories: [...CATEGORIES, ...snapshot.settings.customCategories.map((c) => c.id)],
  })

  const parseWith = async (job: (token: string) => Promise<QuickDraft[]>, context: string) => {
    setBusy(true)
    setError('')
    setDrafts(null)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('unauthorized')
      const result = await job(token)
      if (result.length === 0) setError(t('aiQuickNone'))
      else setDrafts(result)
    } catch (e) {
      logError(context, e)
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

  const run = async () => {
    if (!text.trim() || busy) return
    if (dictation.listening) dictation.toggle(text)
    await parseWith((token) => parseQuickAdd(text, buildMeta(), lang, token), 'ai-parse')
  }

  const scanReceipt = async (file: File) => {
    if (busy) return
    const blob = await downscaleImage(file, 1600, 0.8)
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('generic'))
      reader.readAsDataURL(blob)
    })
    await parseWith((token) => parseReceipt(dataUrl, buildMeta(), lang, token), 'ai-receipt')
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
      <div className="flex gap-2">
        <input
          ref={receiptRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) scanReceipt(f)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => receiptRef.current?.click()}
          disabled={busy}
          aria-label={t('aiReceiptScan')}
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-lg disabled:opacity-50"
        >
          🧾
        </button>
        {dictation.supported && (
          <button
            onClick={() => {
              setError('')
              dictation.toggle(text)
            }}
            aria-label={dictation.listening ? t('speechListening') : t('speechStart')}
            className={`press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg ${
              dictation.listening ? 'animate-pulse bg-bad text-white' : 'border border-line bg-card text-ink'
            }`}
          >
            {dictation.listening ? '⏹' : '🎤'}
          </button>
        )}
        <button
          onClick={run}
          disabled={busy || !text.trim()}
          className="press grad-accent min-w-0 flex-1 rounded-xl py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
        >
          {busy ? t('aiThinking') : t('aiQuickCreate')}
        </button>
      </div>
      {dictation.listening && (
        <p className="animate-pulse text-[12px] font-semibold text-accent">🎙️ {t('speechListening')}</p>
      )}
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
