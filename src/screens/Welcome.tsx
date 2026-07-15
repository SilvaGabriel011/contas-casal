import { useEffect, useState } from 'react'
import { useAppData } from '../data/DataProvider'
import { useI18n } from '../lib/i18n'
import { fetchRemoteConfig, getCloudConfig, hasBakedCloudConfig, SUPABASE_URL_RE } from '../lib/config'
import { authErrorKey, logError } from '../lib/errors'
import { derivePinPassword, isValidPin } from '../lib/pin'
import { Field, inputCls, Segmented } from '../components/ui'
import { PinInput } from '../components/PinInput'

type Step = 'menu' | 'supabase' | 'auth'

export function Welcome() {
  const { status, chooseDemo, chooseCloud, signIn, signUp, backToWelcome } = useAppData()
  const { t } = useI18n()

  const [step, setStep] = useState<Step>(status === 'auth' ? 'auth' : 'menu')

  useEffect(() => {
    if (status === 'auth') setStep('auth')
  }, [status])
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authTab, setAuthTab] = useState<'in' | 'up'>('in')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [passwordMode, setPasswordMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)

  const startCloud = async () => {
    setMessage(null)
    let cfg = getCloudConfig()
    if (!cfg) {
      setBusy(true)
      cfg = await fetchRemoteConfig()
      setBusy(false)
    }
    if (cfg) {
      chooseCloud(cfg)
      setStep('auth')
    } else {
      setStep('supabase')
    }
  }

  const saveSupabase = () => {
    const u = url.trim().replace(/\/+$/, '')
    const k = anonKey.trim()
    if (!SUPABASE_URL_RE.test(u) || k.length < 20) {
      setMessage({ kind: 'error', text: t('invalidSupabaseConfig') })
      return
    }
    setMessage(null)
    chooseCloud({ url: u, anonKey: k })
    setStep('auth')
  }

  const submitAuth = async (mode: 'in' | 'up', secret: string) => {
    setBusy(true)
    setMessage(null)
    try {
      const result = mode === 'in' ? await signIn(email.trim(), secret) : await signUp(email.trim(), secret)
      if (result === 'confirm-email') setMessage({ kind: 'info', text: t('signUpDone') })
      else if (result === 'missing-config') setMessage({ kind: 'error', text: t('missingConfig') })
      else if (result === 'missing-schema') setMessage({ kind: 'error', text: t('missingSchema') })
      else if (result) {
        logError(`auth-${mode}`, result)
        const key = authErrorKey(result)
        setMessage({ kind: 'error', text: key ? t(key) : t('authErrorGeneric', { msg: result }) })
      }
    } catch (e) {
      logError(`auth-${mode}`, e)
      const key = authErrorKey((e as Error).message ?? '')
      setMessage({
        kind: 'error',
        text: key ? t(key) : t('authErrorGeneric', { msg: (e as Error).message ?? '?' }),
      })
    } finally {
      setBusy(false)
    }
  }

  const doPinAuth = async () => {
    setMessage(null)
    if (!email.includes('@')) return setMessage({ kind: 'error', text: t('fillEmail') })
    if (!isValidPin(pin)) return setMessage({ kind: 'error', text: t('pinTooShort') })
    if (authTab === 'up' && pinConfirm !== pin)
      return setMessage({ kind: 'error', text: t('pinMismatch') })
    setBusy(true)
    const secret = await derivePinPassword(email, pin)
    await submitAuth(authTab, secret)
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
                disabled={busy}
                className="press grad-accent w-full rounded-2xl py-4 text-center text-white shadow-lg disabled:opacity-70"
              >
                <span className="block text-[16px] font-bold">
                  ☁️ {busy ? t('loading') : t('cloudLogin')}
                </span>
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
              <Segmented
                options={[
                  { value: 'in', label: t('signIn') },
                  { value: 'up', label: `✨ ${t('signUpShort')}` },
                ]}
                value={authTab}
                onChange={(v) => {
                  setAuthTab(v)
                  setPin('')
                  setPinConfirm('')
                  setMessage(null)
                }}
              />

              <p className="text-center text-[13px] leading-relaxed text-ink2">💡 {t('authHint')}</p>

              <Field label={t('email')}>
                <input
                  className={inputCls}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoCapitalize="none"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="casal@email.com"
                />
              </Field>

              {passwordMode ? (
                <Field label={t('password')}>
                  <input
                    className={inputCls}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </Field>
              ) : (
                <>
                  <PinInput
                    label={authTab === 'up' ? t('pinCreateLabel') : t('pinLabel')}
                    value={pin}
                    onChange={setPin}
                  />
                  {authTab === 'up' && pin.length === 4 && (
                    <div className="anim-rise">
                      <PinInput label={t('pinConfirmLabel')} value={pinConfirm} onChange={setPinConfirm} />
                    </div>
                  )}
                </>
              )}

              {message && <Message kind={message.kind} text={message.text} />}

              <button
                onClick={() => (passwordMode ? submitAuth('in', password) : doPinAuth())}
                disabled={busy}
                className="press grad-accent w-full rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-60"
              >
                {busy ? t('loading') : authTab === 'up' && !passwordMode ? t('signUp') : t('signIn')}
              </button>

              <button
                onClick={() => {
                  setPasswordMode((v) => !v)
                  setMessage(null)
                }}
                className="w-full py-1 text-[13px] font-semibold text-ink2"
              >
                {passwordMode ? t('usePinInstead') : t('usePasswordInstead')}
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
