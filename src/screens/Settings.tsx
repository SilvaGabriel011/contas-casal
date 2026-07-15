import { useEffect, useState } from 'react'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay, type Lang } from '../lib/i18n'
import { useTheme, type Theme } from '../lib/theme'
import { formatMoney } from '../lib/money'
import { buildRemindersIcs, icsEventCount, shareIcs } from '../lib/ics'
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
    getCalendarFeed,
    enableCalendarFeed,
    disableCalendarFeed,
  } = useAppData()
  const { t, lang, locale, setLang } = useI18n()
  const { theme, setTheme } = useTheme()

  const [nameA, setNameA] = useState(snapshot.settings.nameA)
  const [nameB, setNameB] = useState(snapshot.settings.nameB)
  const [dirty, setDirty] = useState(false)
  const [feedToken, setFeedToken] = useState<string | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)

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
                  onClick={async () => setFeedToken(await enableCalendarFeed(lang))}
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

      <p className="pb-2 text-center text-[12px] text-ink2">{t('about')}</p>
    </div>
  )
}
