import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { unlock, disableLock } from '../lib/applock'
import { useAppData } from '../data/DataProvider'

export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const { t } = useI18n()
  const { signOut } = useAppData()
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const attempt = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const ok = await unlock()
    setBusy(false)
    if (ok) onUnlocked()
    else setFailed(true)
  }

  useEffect(() => {
    // Give the app a beat to paint, then prompt Face ID right away.
    const id = setTimeout(attempt, 350)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-app px-8">
      <div className="grad-accent flex h-20 w-20 items-center justify-center rounded-[26px] text-4xl shadow-xl">
        💞
      </div>
      <p className="text-lg font-extrabold text-ink">Contas do Casal</p>
      <button
        onClick={attempt}
        disabled={busy}
        className="press grad-accent w-full max-w-xs rounded-2xl py-3.5 text-[15px] font-bold text-white shadow-lg disabled:opacity-60"
      >
        {busy ? t('loading') : `🔓 ${t('lockUnlock')}`}
      </button>
      {failed && (
        <>
          <p className="text-center text-[13px] font-semibold text-bad">{t('lockFailed')}</p>
          <button
            onClick={async () => {
              disableLock()
              await signOut()
              onUnlocked()
            }}
            className="py-1 text-[13px] font-semibold text-ink2 underline"
          >
            {t('lockSignOut')}
          </button>
        </>
      )}
    </div>
  )
}
