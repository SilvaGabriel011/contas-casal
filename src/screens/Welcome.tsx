import { useState } from 'react'
import { useAppData } from '../data/DataProvider'
import { useI18n } from '../lib/i18n'
import { getCloudConfig, hasBakedCloudConfig } from '../lib/config'
import { Field, inputCls } from '../components/ui'

type Step = 'menu' | 'supabase' | 'auth'

export function Welcome() {
  const { status, chooseDemo, chooseCloud, signIn, signUp, backToWelcome } = useAppData()
  const { t } = useI18n()

  const [step, setStep] = useState<Step>(status === 'auth' ? 'auth' : 'menu')
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)

  const startCloud = () => {
    setMessage(null)
    if (getCloudConfig()) {
      chooseCloud(getCloudConfig()!)
      setStep('auth')
    } else {
      setStep('supabase')
    }
  }

  const saveSupabase = () => {
    const u = url.trim().replace(/\/+$/, '')
    const k = anonKey.trim()
    if (!/^https:\/\/.+\.supabase\.co$/.test(u) || k.length < 20) {
      setMessage({ kind: 'error', text: t('authErrorGeneric', { msg: 'URL/key' }) })
      return
    }
    setMessage(null)
    chooseCloud({ url: u, anonKey: k })
    setStep('auth')
  }

  const doAuth = async (mode: 'in' | 'up') => {
    setBusy(true)
    setMessage(null)
    try {
      const result = mode === 'in' ? await signIn(email.trim(), password) : await signUp(email.trim(), password)
      if (result === 'confirm-email') setMessage({ kind: 'info', text: t('signUpDone') })
      else if (result) setMessage({ kind: 'error', text: t('authErrorGeneric', { msg: result }) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-6 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <div className="flex flex-1 flex-col justify-center">
        <div className="anim-rise text-center">
          <div className="grad-accent mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] text-4xl shadow-xl shadow-black/20">
            💞
          </div>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-ink">{t('welcomeTitle')}</h1>
          <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-ink2">{t('welcomeSubtitle')}</p>
          <p className="mt-3 text-xl">🇦🇺 🤝 🇧🇷</p>
        </div>

        <div className="mt-10 space-y-3">
          {step === 'menu' && (
            <>
              <button
                onClick={startCloud}
                className="press grad-accent w-full rounded-2xl py-4 text-center text-white shadow-lg"
              >
                <span className="block text-[16px] font-bold">☁️ {t('cloudLogin')}</span>
                <span className="block text-[12px] opacity-85">{t('cloudLoginHint')}</span>
              </button>
              <button
                onClick={chooseDemo}
                className="press w-full rounded-2xl border border-line bg-card py-4 text-center"
              >
                <span className="block text-[16px] font-bold text-ink">🧪 {t('tryDemo')}</span>
                <span className="block text-[12px] text-ink2">{t('tryDemoHint')}</span>
              </button>
            </>
          )}

          {step === 'supabase' && (
            <div className="anim-rise space-y-4 rounded-3xl border border-line bg-card p-5">
              <div>
                <h2 className="text-lg font-bold text-ink">{t('supabaseSetupTitle')}</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-ink2">{t('supabaseSetupBody')}</p>
                <a
                  href="https://github.com/silvagabriel011/contas-casal#supabase"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-[13px] font-semibold text-accent"
                >
                  {t('supabaseHowTo')}
                </a>
              </div>
              <Field label={t('supabaseUrl')}>
                <input
                  className={inputCls}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://xxxx.supabase.co"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </Field>
              <Field label={t('supabaseKey')}>
                <input
                  className={inputCls}
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  placeholder="eyJhbGciOi…"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </Field>
              {message && <Message kind={message.kind} text={message.text} />}
              <button
                onClick={saveSupabase}
                className="press grad-accent w-full rounded-2xl py-3.5 text-[15px] font-bold text-white"
              >
                {t('continueBtn')}
              </button>
              <button onClick={() => setStep('menu')} className="w-full py-1 text-[14px] font-semibold text-ink2">
                ← {t('back')}
              </button>
            </div>
          )}

          {step === 'auth' && (
            <div className="anim-rise space-y-4 rounded-3xl border border-line bg-card p-5">
              <p className="text-[13px] leading-relaxed text-ink2">💡 {t('authHint')}</p>
              <Field label={t('email')}>
                <input
                  className={inputCls}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoCapitalize="none"
                  autoComplete="email"
                  inputMode="email"
                />
              </Field>
              <Field label={t('password')}>
                <input
                  className={inputCls}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </Field>
              {message && <Message kind={message.kind} text={message.text} />}
              <button
                onClick={() => doAuth('in')}
                disabled={busy}
                className="press grad-accent w-full rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-60"
              >
                {busy ? t('loading') : t('signIn')}
              </button>
              <button
                onClick={() => doAuth('up')}
                disabled={busy}
                className="press w-full rounded-2xl border border-line py-3.5 text-[15px] font-bold text-ink disabled:opacity-60"
              >
                {t('signUp')}
              </button>
              <button
                onClick={() => {
                  backToWelcome()
                  if (hasBakedCloudConfig()) {
                    setStep('menu')
                  } else {
                    const cfg = getCloudConfig()
                    if (cfg) {
                      setUrl(cfg.url)
                      setAnonKey(cfg.anonKey)
                    }
                    setStep('supabase')
                  }
                  setMessage(null)
                }}
                className="w-full py-1 text-[14px] font-semibold text-ink2"
              >
                ← {t('back')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Message({ kind, text }: { kind: 'error' | 'info'; text: string }) {
  return (
    <p
      className={`rounded-xl px-3 py-2.5 text-[13px] font-semibold ${
        kind === 'error' ? 'bg-bad/10 text-bad' : 'bg-good/10 text-good'
      }`}
    >
      {text}
    </p>
  )
}
