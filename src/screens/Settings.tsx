import { useEffect, useState } from 'react'
import { useAppData } from '../data/DataProvider'
import { getDeviceOwner, setDeviceOwner } from '../lib/device'
import { useI18n, formatDay, type Lang } from '../lib/i18n'
import { useTheme, type Theme } from '../lib/theme'
import { formatMoney, parseAmount } from '../lib/money'
import { getAudBrl } from '../lib/fx'
import { buildRemindersIcs, icsEventCount, shareIcs } from '../lib/ics'
import { clearErrorLog, errorReport, getErrorLog } from '../lib/errors'
import { pushEnabled, pushSupported } from '../lib/push'
import { disableLock, enableLock, isLockEnabled, lockAvailable } from '../lib/applock'
import { isItemFinished } from '../lib/schedule'
import { Field, inputCls, Segmented } from '../components/ui'

export function Settings() {
  const {
    snapshot,
    saveSettings,
    mode,
    userEmail,
    signOut,
    backToWelcome,
    resetDemo,
    importSnapshot,
    getCalendarFeed,
    enableCalendarFeed,
    disableCalendarFeed,
    enablePush,
    disablePush,
    listBackups,
    getBackup,
  } = useAppData()
  const { t, lang, locale, decimalSep, setLang } = useI18n()
  const { theme, setTheme } = useTheme()

  const [nameA, setNameA] = useState(snapshot.settings.nameA)
  const [nameB, setNameB] = useState(snapshot.settings.nameB)
  const [dirty, setDirty] = useState(false)
  const [feedToken, setFeedToken] = useState<string | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  const [deviceOwner, setDeviceOwnerState] = useState<'a' | 'b' | null>(getDeviceOwner)
  const [errLog, setErrLog] = useState(getErrorLog)
  const [reportCopied, setReportCopied] = useState(false)
  const [pushState, setPushState] = useState<'unknown' | 'on' | 'off' | 'unsupported'>('unknown')
  const [pushBusy, setPushBusy] = useState(false)
  const [lockOn, setLockOn] = useState(isLockEnabled)
  const [lockOk, setLockOk] = useState(false)
  const [notifyEmailsRaw, setNotifyEmailsRaw] = useState((snapshot.settings.notifyEmails ?? []).join(', '))
  const notifyEmailsDirty =
    notifyEmailsRaw.trim() !== (snapshot.settings.notifyEmails ?? []).join(', ').trim()

  const [backups, setBackups] = useState<{ id: string; takenAt: string }[] | null>(null)
  const [fxTargetRaw, setFxTargetRaw] = useState(
    snapshot.settings.fxAlert ? String(snapshot.settings.fxAlert.target) : ''
  )
  const [fxNow, setFxNow] = useState<number | null>(null)
  const fxDirty =
    fxTargetRaw.trim() !== (snapshot.settings.fxAlert ? String(snapshot.settings.fxAlert.target) : '')

  useEffect(() => {
    if (mode === 'cloud') getAudBrl().then((info) => setFxNow(info?.rate ?? null))
  }, [mode])

  const saveFxAlert = async () => {
    const target = parseAmount(fxTargetRaw, decimalSep)
    if (fxTargetRaw.trim() === '' || target === null || target <= 0) {
      const { fxAlert: _drop, ...rest } = snapshot.settings
      await saveSettings(rest)
      setFxTargetRaw('')
    } else {
      await saveSettings({ ...snapshot.settings, fxAlert: { target } })
      setFxTargetRaw(String(target))
    }
  }

  const restoreBackup = async (b: { id: string; takenAt: string }) => {
    const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(b.takenAt)
    )
    if (!confirm(t('backupsConfirm', { when }))) return
    const snapshot = await getBackup(b.id)
    if (!snapshot || !Array.isArray(snapshot.items)) {
      alert(t('importInvalid'))
      return
    }
    const ok = await importSnapshot({
      items: snapshot.items,
      incomes: snapshot.incomes ?? [],
      payments: snapshot.payments ?? [],
      expenses: snapshot.expenses ?? [],
      transfers: snapshot.transfers ?? [],
      settings: snapshot.settings,
    })
    alert(ok ? t('backupsRestored') : t('importInvalid'))
    setBackups(null)
  }

  const saveNotifyEmails = async () => {
    const emails = notifyEmailsRaw
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@'))
    await saveSettings({ ...snapshot.settings, notifyEmails: emails })
    setNotifyEmailsRaw(emails.join(', '))
  }

  useEffect(() => {
    if (!pushSupported()) {
      setPushState('unsupported')
      return
    }
    pushEnabled().then((on) => setPushState(on ? 'on' : 'off'))
  }, [])

  useEffect(() => {
    lockAvailable().then(setLockOk)
  }, [])

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(errorReport())
      setReportCopied(true)
      setTimeout(() => setReportCopied(false), 2000)
    } catch {
      prompt('Report', errorReport())
    }
  }

  // Sync remote name changes in, but never while the user is mid-edit.
  useEffect(() => {
    if (dirty) return
    setNameA(snapshot.settings.nameA)
    setNameB(snapshot.settings.nameB)
  }, [snapshot.settings.nameA, snapshot.settings.nameB, dirty])

  const persistNames = () => {
    const a = nameA.trim() || snapshot.settings.nameA
    const b = nameB.trim() || snapshot.settings.nameB
    if (a !== snapshot.settings.nameA || b !== snapshot.settings.nameB) {
      saveSettings({ ...snapshot.settings, nameA: a, nameB: b })
    }
    setDirty(false)
  }

  const importJson = (file: File) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? ''))
        if (
          !Array.isArray(parsed.items) ||
          !Array.isArray(parsed.incomes) ||
          !Array.isArray(parsed.payments)
        ) {
          throw new Error('shape')
        }
        if (!confirm(t('importConfirm'))) return
        const ok = await importSnapshot({
          items: parsed.items,
          incomes: parsed.incomes,
          payments: parsed.payments,
          expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
          transfers: Array.isArray(parsed.transfers) ? parsed.transfers : [],
          settings: { ...snapshot.settings, ...parsed.settings },
        })
        if (ok) alert(t('importDone'))
      } catch {
        alert(t('importInvalid'))
      }
    }
    reader.readAsText(file)
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'contas-casal.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    if (mode === 'cloud') getCalendarFeed().then(setFeedToken)
    else setFeedToken(null)
  }, [mode, getCalendarFeed])

  const feedUrl = feedToken ? `${location.origin}/api/calendar?t=${feedToken}` : null
  const webcalUrl = feedUrl ? feedUrl.replace(/^https?:/, 'webcal:') : null

  const copyFeed = async () => {
    if (!feedUrl) return
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('URL', feedUrl)
    }
  }

  const exportCalendar = () => {
    const items = snapshot.items.filter((i) => !i.archived && !isItemFinished(i, snapshot.payments))
    const ics = buildRemindersIcs(
      items,
      (i, due) =>
        t('calendarReminderTitle', { name: i.name, amount: formatMoney(i.amount, i.currency, locale) }) +
        ` (${formatDay(due, locale)})`,
      (_i, due) => t('calendarReminderBody', { date: formatDay(due, locale) })
    )
    if (icsEventCount(ics) === 0) return alert(t('calendarNothing'))
    shareIcs('contas-casal-lembretes.ics', ics)
  }

  return (
    <div className="space-y-5">
      <header className="pt-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('settingsTitle')}</h1>
      </header>

      <section className="space-y-4 rounded-3xl border border-line bg-card p-5">
        <Field label={`🌐 ${t('language')}`}>
          <Segmented<Lang>
            options={[
              { value: 'pt', label: '🇧🇷 Português' },
              { value: 'en', label: '🇦🇺 English' },
            ]}
            value={lang}
            onChange={setLang}
          />
        </Field>
        <Field label={`🎨 ${t('theme')}`}>
          <Segmented<Theme>
            options={[
              { value: 'light', label: `☀️ ${t('themeLight')}` },
              { value: 'dark', label: `🌙 ${t('themeDark')}` },
              { value: 'auto', label: t('themeAuto') },
            ]}
            value={theme}
            onChange={setTheme}
          />
        </Field>
      </section>

      <section className="space-y-4 rounded-3xl border border-line bg-card p-5">
        <p className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">{t('profiles')}</p>
        <Field label={t('profileAName')}>
          <input
            className={inputCls}
            value={nameA}
            onChange={(e) => {
              setNameA(e.target.value)
              setDirty(true)
            }}
            onBlur={persistNames}
          />
        </Field>
        <Field label={t('profileBName')}>
          <input
            className={inputCls}
            value={nameB}
            onChange={(e) => {
              setNameB(e.target.value)
              setDirty(true)
            }}
            onBlur={persistNames}
          />
        </Field>
        <Field label={`📱 ${t('deviceOwnerLabel')}`}>
          <Segmented
            options={[
              { value: 'a', label: snapshot.settings.nameA },
              { value: 'b', label: snapshot.settings.nameB },
            ]}
            value={deviceOwner ?? 'a'}
            onChange={(v) => {
              setDeviceOwner(v)
              setDeviceOwnerState(v)
            }}
          />
          <p className="mt-1.5 text-[12px] text-ink2">{t('deviceOwnerHint')}</p>
        </Field>
      </section>

      <section className="space-y-3 rounded-3xl border border-line bg-card p-5">
        <p className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">{t('dataSection')}</p>

        {mode === 'demo' ? (
          <>
            <div className="rounded-2xl bg-card2 p-3.5">
              <p className="text-sm font-bold text-ink">🧪 {t('demoMode')}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink2">
                {t('demoModeBody', { name: snapshot.settings.nameB })}
              </p>
            </div>
            <button
              onClick={backToWelcome}
              className="press grad-accent w-full rounded-2xl py-3.5 text-[15px] font-bold text-white"
            >
              ☁️ {t('connectCloud')}
            </button>
            <button
              onClick={() => confirm(t('resetDemoConfirm')) && resetDemo()}
              className="press w-full rounded-2xl border border-line py-3 text-[14px] font-semibold text-bad"
            >
              {t('resetDemo')}
            </button>
          </>
        ) : (
          <>
            {userEmail && (
              <p className="text-[13px] text-ink2">
                {t('signedInAs')} <span className="font-semibold text-ink">{userEmail}</span>
              </p>
            )}
            <button
              onClick={signOut}
              className="press w-full rounded-2xl border border-line py-3 text-[14px] font-semibold text-bad"
            >
              {t('signOut')}
            </button>
          </>
        )}

        <button
          onClick={exportJson}
          className="press w-full rounded-2xl border border-line py-3 text-[14px] font-semibold text-ink"
        >
          📤 {t('exportData')}
        </button>

        <label className="press block w-full cursor-pointer rounded-2xl border border-line py-3 text-center text-[14px] font-semibold text-ink">
          📥 {t('importData')}
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importJson(f)
              e.target.value = ''
            }}
          />
        </label>

        {mode === 'cloud' && (
          <>
            <button
              onClick={async () => {
                if (backups === null) {
                  setBackups(await listBackups())
                } else {
                  setBackups(null)
                }
              }}
              className="press w-full rounded-2xl border border-line py-3 text-[14px] font-semibold text-ink"
            >
              🕰️ {t('backupsTitle')}
            </button>
            {backups !== null && (
              <div className="anim-rise space-y-1.5">
                <p className="text-[12px] leading-relaxed text-ink2">{t('backupsHint')}</p>
                {backups.length === 0 ? (
                  <p className="rounded-xl bg-card2 px-3 py-2.5 text-[13px] font-semibold text-ink2">
                    {t('backupsEmpty')}
                  </p>
                ) : (
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {backups.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => restoreBackup(b)}
                        className="press flex w-full items-center justify-between rounded-xl bg-card2 px-3 py-2.5 text-left"
                      >
                        <span className="text-[13px] font-semibold text-ink">
                          {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
                            new Date(b.takenAt)
                          )}
                        </span>
                        <span className="text-[12px] font-bold text-accent">{t('backupsRestore')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <section className="space-y-3 rounded-3xl border border-line bg-card p-5">
        <p className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
          📅 {t('calendarSection')}
        </p>

        {mode === 'cloud' && feedToken !== undefined && (
          <>
            {!feedToken ? (
              <>
                <p className="text-[13px] leading-relaxed text-ink2">{t('calendarFeedBody')}</p>
                <button
                  onClick={async () => {
                    const token = await enableCalendarFeed(lang)
                    if (!token) alert(t('errFeedFailed'))
                    setFeedToken(token)
                  }}
                  className="press grad-accent w-full rounded-2xl py-3.5 text-[15px] font-bold text-white"
                >
                  🔄 {t('calendarFeedEnable')}
                </button>
              </>
            ) : (
              <>
                <a
                  href={webcalUrl ?? '#'}
                  className="press block w-full rounded-2xl border border-line bg-card2 py-3 text-center text-[14px] font-semibold text-ink"
                >
                  🍎 {t('calendarFeedApple')}
                </a>
                <a
                  href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl ?? '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="press block w-full rounded-2xl border border-line bg-card2 py-3 text-center text-[14px] font-semibold text-ink"
                >
                  🗓️ {t('calendarFeedGoogle')}
                </a>
                <button
                  onClick={copyFeed}
                  className="press w-full rounded-2xl border border-line py-3 text-[14px] font-semibold text-ink"
                >
                  {copied ? `✓ ${t('calendarFeedCopied')}` : `🔗 ${t('calendarFeedCopy')}`}
                </button>
                <p className="text-[12px] leading-relaxed text-ink2">{t('calendarFeedHint')}</p>
                <button
                  onClick={async () => {
                    await disableCalendarFeed()
                    setFeedToken(null)
                  }}
                  className="press w-full rounded-2xl border border-line py-2.5 text-[13px] font-semibold text-bad"
                >
                  {t('calendarFeedDisable')}
                </button>
              </>
            )}
          </>
        )}

        <button
          onClick={exportCalendar}
          className="press w-full rounded-2xl border border-line py-3 text-[14px] font-semibold text-ink"
        >
          📤 {t('calendarExportAll')}
        </button>
      </section>

      {mode === 'cloud' && (
        <section className="space-y-3 rounded-3xl border border-line bg-card p-5">
          <p className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">🔔 {t('pushSection')}</p>
          <p className="text-[13px] leading-relaxed text-ink2">{t('pushBody')}</p>
          {pushState === 'unsupported' ? (
            <p className="text-[12px] leading-relaxed text-ink2">📲 {t('pushUnsupportedHint')}</p>
          ) : pushState === 'on' ? (
            <button
              onClick={async () => {
                setPushBusy(true)
                await disablePush()
                setPushBusy(false)
                setPushState('off')
              }}
              disabled={pushBusy}
              className="press w-full rounded-2xl border border-line py-3 text-[14px] font-semibold text-bad disabled:opacity-60"
            >
              {t('pushDisable')}
            </button>
          ) : (
            <button
              onClick={async () => {
                setPushBusy(true)
                const r = await enablePush(lang)
                setPushBusy(false)
                if (r === 'ok') setPushState('on')
                else if (r === 'denied') alert(t('pushDenied'))
                else if (r === 'unavailable') alert(t('pushUnavailable'))
                else alert(t('pushFailed'))
              }}
              disabled={pushBusy || pushState === 'unknown'}
              className="press grad-accent w-full rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-60"
            >
              {pushBusy ? t('loading') : `🔔 ${t('pushEnable')}`}
            </button>
          )}
          {pushState !== 'unsupported' && (
            <p className="text-[11px] leading-relaxed text-ink2">{t('pushIosHint')}</p>
          )}

          <div className="border-t border-line pt-3">
            <Field label={`✉️ ${t('notifyEmailsLabel')}`}>
              <input
                className={inputCls}
                value={notifyEmailsRaw}
                onChange={(e) => setNotifyEmailsRaw(e.target.value)}
                placeholder="voce@email.com, izabela@email.com"
                autoCapitalize="none"
                autoCorrect="off"
                inputMode="email"
              />
            </Field>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink2">{t('notifyEmailsHint')}</p>
            {notifyEmailsDirty && (
              <button
                onClick={saveNotifyEmails}
                className="press mt-2 w-full rounded-2xl border border-accent py-2.5 text-[13px] font-bold text-accent"
              >
                {t('save')}
              </button>
            )}
          </div>

          <div className="border-t border-line pt-3">
            <Field label={`💱 ${t('fxAlertLabel')}`}>
              <input
                className={`${inputCls} num`}
                value={fxTargetRaw}
                onChange={(e) => setFxTargetRaw(e.target.value)}
                inputMode="decimal"
                placeholder={decimalSep === ',' ? '3,60' : '3.60'}
              />
            </Field>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink2">
              {t('fxAlertHint')}
              {fxNow !== null && (
                <span className="num font-bold"> {t('fxAlertNow', { r: fxNow.toFixed(2) })}</span>
              )}
            </p>
            {fxDirty && (
              <button
                onClick={saveFxAlert}
                className="press mt-2 w-full rounded-2xl border border-accent py-2.5 text-[13px] font-bold text-accent"
              >
                {t('save')}
              </button>
            )}
          </div>
        </section>
      )}

      {lockOk && (
        <section className="space-y-3 rounded-3xl border border-line bg-card p-5">
          <p className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">🔒 {t('lockSection')}</p>
          <p className="text-[13px] leading-relaxed text-ink2">{t('lockHint')}</p>
          {lockOn ? (
            <button
              onClick={() => {
                disableLock()
                setLockOn(false)
              }}
              className="press w-full rounded-2xl border border-line py-3 text-[14px] font-semibold text-bad"
            >
              {t('lockDisable')}
            </button>
          ) : (
            <button
              onClick={async () => {
                const ok = await enableLock()
                if (ok) setLockOn(true)
                else alert(t('lockEnableFailed'))
              }}
              className="press grad-accent w-full rounded-2xl py-3.5 text-[15px] font-bold text-white"
            >
              🔒 {t('lockEnable')}
            </button>
          )}
        </section>
      )}

      <section className="space-y-3 rounded-3xl border border-line bg-card p-5">
        <p className="text-[13px] font-extrabold tracking-wide text-ink2 uppercase">🩺 {t('diagTitle')}</p>
        <p className="text-[12px] leading-relaxed text-ink2">{t('diagHint')}</p>
        {errLog.length === 0 ? (
          <p className="text-[13px] font-semibold text-good">{t('diagEmpty')}</p>
        ) : (
          <>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-card2 p-2.5">
              {errLog.slice(0, 8).map((e, i) => (
                <p key={i} className="num text-[11px] leading-snug text-ink2">
                  <span className="font-bold text-ink">[{e.context}]</span> {e.message}
                </p>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyReport}
                className="press flex-1 rounded-2xl border border-line py-2.5 text-[13px] font-semibold text-ink"
              >
                {reportCopied ? `✓ ${t('diagCopied')}` : `📋 ${t('diagCopy')}`}
              </button>
              <button
                onClick={() => {
                  clearErrorLog()
                  setErrLog([])
                }}
                className="press rounded-2xl border border-line px-4 py-2.5 text-[13px] font-semibold text-bad"
              >
                {t('diagClear')}
              </button>
            </div>
          </>
        )}
        <p className="num border-t border-line pt-3 text-[12px] text-ink2">
          {t('diagBuild')}: <span className="font-bold">{__BUILD_SHA__}</span> ·{' '}
          {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
            new Date(__BUILD_TIME__)
          )}
        </p>
      </section>

      <p className="pb-2 text-center text-[12px] text-ink2">{t('about')}</p>
    </div>
  )
}
