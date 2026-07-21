import { useRef, useState } from 'react'
import { CATEGORIES } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n } from '../lib/i18n'
import { todayISO } from '../lib/dates'
import {
  parseQuickAdd,
  parseReceipt,
  parseScreenshot,
  type QuickAddMeta,
  type QuickDraft,
} from '../lib/ai'
import { useDictation } from '../lib/speech'
import { downscaleImage } from '../lib/image'
import { logError } from '../lib/errors'
import { AiImportReview } from './AiImportReview'
import { inputCls } from './ui'

export function AiQuickAdd({
  onDone,
  onPrefill,
}: {
  onDone: () => void
  onPrefill?: (d: QuickDraft) => void
}) {
  const { snapshot, mode, getAccessToken } = useAppData()
  const { t, lang, locale } = useI18n()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [review, setReview] = useState<QuickDraft[] | null>(null)
  const dictation = useDictation(locale, setText, () => setError(t('speechDenied')))
  const receiptRef = useRef<HTMLInputElement>(null)
  const printRef = useRef<HTMLInputElement>(null)

  if (mode !== 'cloud') return null

  const buildMeta = (): QuickAddMeta => ({
    today: todayISO(),
    nameA: snapshot.settings.nameA,
    nameB: snapshot.settings.nameB,
    categories: [...CATEGORIES, ...snapshot.settings.customCategories.map((c) => c.id)],
  })

  const parseWith = async (
    job: (token: string) => Promise<QuickDraft[]>,
    context: string,
    { alwaysReview = false } = {}
  ) => {
    setBusy(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('unauthorized')
      const result = await job(token)
      if (result.length === 0) setError(t('aiQuickNone'))
      // One record typed by hand: fill the whole wizard so the user just
      // reviews and saves. Prints and multi-record results open the summary
      // modal instead — nothing is saved before the user confirms there.
      else if (!alwaysReview && result.length === 1 && onPrefill) onPrefill(result[0])
      else setReview(result)
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

  const toDataUrl = async (file: File) => {
    const blob = await downscaleImage(file, 1600, 0.8)
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('generic'))
      reader.readAsDataURL(blob)
    })
  }

  const scanReceipt = async (file: File) => {
    if (busy) return
    const dataUrl = await toDataUrl(file)
    await parseWith((token) => parseReceipt(dataUrl, buildMeta(), lang, token), 'ai-receipt')
  }

  // Up to 6 prints per scan — they travel in one request so the AI can merge
  // overlapping shots of the same list.
  const scanPrints = async (files: File[]) => {
    if (busy || files.length === 0) return
    const dataUrls = await Promise.all(files.slice(0, 6).map(toDataUrl))
    await parseWith((token) => parseScreenshot(dataUrls, buildMeta(), lang, token), 'ai-screenshot', {
      alwaysReview: true,
    })
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
        <input
          ref={printRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) scanPrints(files)
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
        <button
          onClick={() => printRef.current?.click()}
          disabled={busy}
          aria-label={t('aiPrintScan')}
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-lg disabled:opacity-50"
        >
          📸
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
      <p className="text-[11px] font-semibold text-ink2">📸 {t('aiPrintHint')}</p>
      {dictation.listening && (
        <p className="animate-pulse text-[12px] font-semibold text-accent">🎙️ {t('speechListening')}</p>
      )}
      {error && <p className="text-[13px] font-semibold text-bad">{error}</p>}
      <AiImportReview drafts={review} onClose={() => setReview(null)} onDone={onDone} />
    </div>
  )
}
