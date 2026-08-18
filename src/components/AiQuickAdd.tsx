import { useRef, useState } from 'react'
import { CATEGORIES } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n } from '../lib/i18n'
import { todayISO } from '../lib/dates'
import {
  parseQuickAdd,
  parseReceipt,
  parseScreenshot,
  parseStatement,
  type QuickAddMeta,
  type QuickDraft,
} from '../lib/ai'
import { useDictation } from '../lib/speech'
import { downscaleImage } from '../lib/image'
import { extractPdfText } from '../lib/pdf'
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
  const pdfRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)

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

  // Several photos at once: each image is parsed on its own and the drafts
  // are pooled. One photo keeps the fill-the-form flow; more than one always
  // lands in the review modal. A photo that fails is skipped unless nothing
  // else succeeded.
  const scanBatch = async (
    files: File[],
    parse: (dataUrl: string, token: string) => ReturnType<typeof parseReceipt>,
    context: string,
    alwaysReview: boolean
  ) => {
    if (busy || files.length === 0) return
    await parseWith(
      async (token) => {
        const out: QuickDraft[] = []
        let lastError: unknown = null
        for (const file of files) {
          try {
            out.push(...(await parse(await toDataUrl(file), token)))
          } catch (e) {
            lastError = e
          }
        }
        if (out.length === 0 && lastError) throw lastError
        return out
      },
      context,
      { alwaysReview: alwaysReview || files.length > 1 }
    )
  }

  const scanReceipts = (files: File[]) =>
    scanBatch(files, (dataUrl, token) => parseReceipt(dataUrl, buildMeta(), lang, token), 'ai-receipt', false)

  const scanPrints = (files: File[]) =>
    scanBatch(files, (dataUrl, token) => parseScreenshot(dataUrl, buildMeta(), lang, token), 'ai-screenshot', true)

  const scanPdf = async (file: File) => {
    if (busy) return
    setBusy(true)
    setError('')
    let extracted = ''
    try {
      extracted = await extractPdfText(file)
    } catch (e) {
      logError('ai-pdf', e)
      setBusy(false)
      return setError(t('aiPdfNoText'))
    }
    setBusy(false)
    if (extracted.length < 20) return setError(t('aiPdfNoText'))
    await parseWith((token) => parseStatement(extracted, buildMeta(), lang, token), 'ai-pdf', {
      alwaysReview: true,
    })
  }

  const importCsv = async (file: File) => {
    if (busy) return
    const csv = await file.text()
    if (!csv.trim()) return setError(t('aiQuickNone'))
    await parseWith((token) => parseStatement(csv, buildMeta(), lang, token), 'ai-csv', {
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
          multiple
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? [])
            if (fs.length > 0) scanReceipts(fs)
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
            const fs = Array.from(e.target.files ?? [])
            if (fs.length > 0) scanPrints(fs)
            e.target.value = ''
          }}
        />
        <input
          ref={pdfRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) scanPdf(f)
            e.target.value = ''
          }}
        />
        <input
          ref={csvRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importCsv(f)
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
        <button
          onClick={() => pdfRef.current?.click()}
          disabled={busy}
          aria-label={t('aiPdfScan')}
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-lg disabled:opacity-50"
        >
          📄
        </button>
        <button
          onClick={() => csvRef.current?.click()}
          disabled={busy}
          aria-label={t('aiCsvImport')}
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-lg disabled:opacity-50"
        >
          🏦
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
