// Voice dictation via the Web Speech API (webkit-prefixed on iOS Safari).
// Recognition runs on-device/OS-side, so there is nothing to configure —
// but availability varies (iOS needs Siri & Dictation enabled), so callers
// must hide the mic when `supported` is false.
import { useEffect, useRef, useState } from 'react'
import { logError } from './errors'

type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error?: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> }

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Recognition) | null
}

export function useDictation(
  locale: string,
  onText: (text: string) => void,
  onDenied?: () => void
): { supported: boolean; listening: boolean; toggle: (currentText: string) => void } {
  const recRef = useRef<Recognition | null>(null)
  const baseRef = useRef('')
  const [listening, setListening] = useState(false)
  const supported = recognitionCtor() !== null

  useEffect(() => () => recRef.current?.abort(), [])

  const toggle = (currentText: string) => {
    if (recRef.current) {
      recRef.current.stop()
      return
    }
    const Ctor = recognitionCtor()
    if (!Ctor) return
    const rec = new Ctor()
    recRef.current = rec
    baseRef.current = currentText.trim()
    rec.lang = locale
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      // results holds the whole session (interim + final); rebuild every time
      // so corrections the recognizer makes mid-sentence are reflected.
      let heard = ''
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript
      heard = heard.trim()
      if (!heard) return
      onText(baseRef.current ? `${baseRef.current} ${heard}` : heard)
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') onDenied?.()
      else if (e.error && e.error !== 'aborted' && e.error !== 'no-speech') logError('speech', e.error)
    }
    rec.onend = () => {
      recRef.current = null
      setListening(false)
    }
    try {
      rec.start()
      setListening(true)
    } catch (e) {
      logError('speech', e)
      recRef.current = null
    }
  }

  return { supported, listening, toggle }
}
