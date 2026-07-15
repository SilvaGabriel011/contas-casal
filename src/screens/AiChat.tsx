import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useAppData } from '../data/DataProvider'
import { useI18n, type TKey } from '../lib/i18n'
import { buildAiContext, streamAiChat, type AiMessage } from '../lib/ai'

const CSV_MARKER = '\n\n[CSV]'
const MAX_CSV_CHARS = 20_000

const ERROR_KEY: Record<string, TKey> = {
  'missing-openai-key': 'aiErrorNoKey',
  'invalid-openai-key': 'aiErrorBadKey',
  unauthorized: 'aiErrorAuth',
  unavailable: 'aiErrorUnavailable',
}

export function AiChat({
  open,
  onClose,
  messages,
  setMessages,
}: {
  open: boolean
  onClose: () => void
  messages: AiMessage[]
  setMessages: Dispatch<SetStateAction<AiMessage[]>>
}) {
  const { snapshot, getAccessToken } = useAppData()
  const { t, lang } = useI18n()
  const [input, setInput] = useState('')
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, busy])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  const send = async (text: string) => {
    const question = text.trim()
    if (busy || (!question && !csv)) return
    const content = csv ? `${question}${CSV_MARKER} ${csv.name}\n${csv.text}` : question
    setError('')
    setInput('')
    setCsv(null)
    const history: AiMessage[] = [...messages, { role: 'user', content }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setBusy(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('unauthorized')
      const context = buildAiContext(snapshot, t)
      let acc = ''
      for await (const chunk of streamAiChat(history, context, lang, token)) {
        acc += chunk
        setMessages([...history, { role: 'assistant', content: acc }])
      }
      if (!acc.trim()) throw new Error('generic')
    } catch (e) {
      setMessages(history)
      setError(t(ERROR_KEY[(e as Error).message] ?? 'aiErrorGeneric'))
    } finally {
      setBusy(false)
    }
  }

  const attachCsv = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '').slice(0, MAX_CSV_CHARS)
      if (text) setCsv({ name: file.name, text })
    }
    reader.readAsText(file)
  }

  const suggestions: TKey[] = ['aiSuggest1', 'aiSuggest2', 'aiSuggest3', 'aiSuggest4']

  return (
    <div className="anim-sheet fixed inset-0 z-50 flex flex-col bg-app">
      <header className="glass flex items-center gap-3 border-b border-line px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3">
        <span className="grad-accent flex h-10 w-10 items-center justify-center rounded-2xl text-xl">✨</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] font-extrabold text-ink">{t('aiTitle')}</h1>
          <p className="truncate text-[11px] text-ink2">{t('aiDisclaimer')}</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => {
              setMessages([])
              setError('')
            }}
            aria-label={t('aiClear')}
            className="press rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-ink2"
          >
            🧹
          </button>
        )}
        <button
          onClick={onClose}
          aria-label={t('back')}
          className="press flex h-9 w-9 items-center justify-center rounded-full bg-card2 text-[15px] font-bold text-ink"
        >
          ✕
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-lg space-y-3">
          {messages.length === 0 && (
            <div className="anim-rise space-y-4 pt-6">
              <div className="rounded-3xl rounded-tl-lg border border-line bg-card px-4 py-3.5 text-[15px] leading-relaxed text-ink">
                {t('aiIntro')}
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((key) => (
                  <button
                    key={key}
                    onClick={() => send(t(key))}
                    className="press rounded-full border border-line bg-card px-3.5 py-2 text-[13px] font-semibold text-ink"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} thinking={busy && i === messages.length - 1 && !m.content} />
          ))}

          {error && (
            <p className="anim-rise rounded-2xl bg-bad/10 px-4 py-3 text-[13px] font-semibold text-bad">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="glass border-t border-line px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="mx-auto max-w-lg">
          {csv && (
            <p className="mb-2 flex items-center gap-2 rounded-xl bg-card2 px-3 py-2 text-[12px] font-semibold text-ink">
              📎 {t('aiCsvAttached', { name: csv.name })}
              <button onClick={() => setCsv(null)} className="ml-auto font-bold text-ink2">
                ✕
              </button>
            </p>
          )}
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) attachCsv(f)
                e.target.value = ''
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              aria-label={t('aiAttachCsv')}
              className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-card text-lg"
            >
              📎
            </button>
            <input
              className="min-w-0 flex-1 rounded-full border border-line bg-card px-4 py-3 text-ink outline-none focus:border-accent"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send(input)}
              placeholder={t('aiPlaceholder')}
              enterKeyHint="send"
            />
            <button
              onClick={() => send(input)}
              disabled={busy || (!input.trim() && !csv)}
              aria-label={t('aiSend')}
              className="press grad-accent flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-white disabled:opacity-50"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message, thinking }: { message: AiMessage; thinking: boolean }) {
  const { t } = useI18n()
  const isUser = message.role === 'user'
  const csvIdx = message.content.indexOf(CSV_MARKER)
  const visible = isUser && csvIdx !== -1 ? message.content.slice(0, csvIdx) : message.content
  const csvName =
    isUser && csvIdx !== -1
      ? message.content.slice(csvIdx + CSV_MARKER.length).split('\n')[0].trim()
      : null

  return (
    <div className={`anim-rise flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'grad-accent rounded-3xl rounded-br-lg text-white'
            : 'rounded-3xl rounded-tl-lg border border-line bg-card text-ink'
        }`}
      >
        {thinking ? (
          <span className="animate-pulse font-semibold text-ink2">✨ {t('aiThinking')}</span>
        ) : (
          <>
            {visible}
            {csvName && (
              <span className={`${visible ? 'mt-2 ' : ''}block rounded-xl bg-white/20 px-2.5 py-1.5 text-[12px] font-bold`}>
                📎 {csvName}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
