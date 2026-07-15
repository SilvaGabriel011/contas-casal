import { useEffect, useMemo, useState } from 'react'
import type { Transfer } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, formatDay } from '../lib/i18n'
import { formatMoneyShort, parseAmount } from '../lib/money'
import { getAudBrl, type FxInfo } from '../lib/fx'
import { todayISO } from '../lib/dates'
import { EmptyState, Field, inputCls } from '../components/ui'

export function TransfersScreen() {
  const { snapshot, upsertTransfer, deleteTransfer } = useAppData()
  const { t, locale, decimalSep } = useI18n()
  const [fx, setFx] = useState<FxInfo | null>(null)
  const [editing, setEditing] = useState<Transfer | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [date, setDate] = useState(todayISO())
  const [audRaw, setAudRaw] = useState('')
  const [brlRaw, setBrlRaw] = useState('')
  const [feeRaw, setFeeRaw] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    getAudBrl().then(setFx)
  }, [])

  const transfers = useMemo(
    () => [...snapshot.transfers].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [snapshot.transfers]
  )

  const year = todayISO().slice(0, 4)
  const yearStats = useMemo(() => {
    const list = transfers.filter((tr) => tr.date.startsWith(year))
    const sent = list.reduce((s, tr) => s + tr.audSent, 0)
    const received = list.reduce((s, tr) => s + tr.brlReceived, 0)
    const fees = list.reduce((s, tr) => s + (tr.feeAud ?? 0), 0)
    return { sent, received, fees, avg: sent > 0 ? received / sent : null }
  }, [transfers, year])

  const openForm = (tr: Transfer | null) => {
    setEditing(tr)
    setDate(tr?.date ?? todayISO())
    setAudRaw(tr ? String(tr.audSent).replace('.', decimalSep) : '')
    setBrlRaw(tr ? String(tr.brlReceived).replace('.', decimalSep) : '')
    setFeeRaw(tr?.feeAud ? String(tr.feeAud).replace('.', decimalSep) : '')
    setNote(tr?.note ?? '')
    setFormOpen(true)
  }

  const save = async () => {
    const aud = parseAmount(audRaw, decimalSep)
    const brl = parseAmount(brlRaw, decimalSep)
    if (!aud || !brl || aud <= 0 || brl <= 0) return
    await upsertTransfer({
      id: editing?.id ?? crypto.randomUUID(),
      date,
      audSent: aud,
      brlReceived: brl,
      feeAud: parseAmount(feeRaw, decimalSep) || null,
      note: note.trim() || null,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    })
    setFormOpen(false)
  }

  const fmtRate = (r: number) => `R$ ${new Intl.NumberFormat(locale, { minimumFractionDigits: 4 }).format(r)}`

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('transfersTitle')}</h1>
      </header>

      {fx && (
        <div className="anim-rise grad-brl flex items-center justify-between rounded-3xl p-4 text-white shadow-lg">
          <div>
            <p className="text-[12px] font-bold tracking-wide uppercase opacity-90">🇦🇺→🇧🇷 {t('fxNow')}</p>
            <p className="num text-[26px] font-extrabold">A$ 1 = {fmtRate(fx.rate)}</p>
          </div>
          {fx.prevRate !== null && (
            <span className="num rounded-full bg-white/20 px-3 py-1.5 text-[14px] font-bold">
              {fx.rate >= fx.prevRate ? '▲' : '▼'}{' '}
              {new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
                ((fx.rate - fx.prevRate) / fx.prevRate) * 100
              )}
              %
            </span>
          )}
        </div>
      )}

      {yearStats.sent > 0 && (
        <div className="anim-rise grid grid-cols-2 gap-2 rounded-3xl border border-line bg-card p-4">
          <p className="col-span-2 text-[12px] font-extrabold tracking-wide text-ink2 uppercase">
            📆 {t('transfersYearTitle')} ({year})
          </p>
          <div>
            <p className="num text-[18px] font-extrabold text-ink">{formatMoneyShort(yearStats.sent, 'AUD', locale)}</p>
            <p className="text-[11px] text-ink2">{t('totalSentLabel')}</p>
          </div>
          <div>
            <p className="num text-[18px] font-extrabold text-ink">
              {formatMoneyShort(yearStats.received, 'BRL', locale)}
            </p>
            <p className="text-[11px] text-ink2">{t('totalReceivedLabel')}</p>
          </div>
          {yearStats.avg !== null && (
            <div>
              <p className="num text-[18px] font-extrabold text-ink">{fmtRate(yearStats.avg)}</p>
              <p className="text-[11px] text-ink2">{t('avgRateLabel')}</p>
            </div>
          )}
          {yearStats.fees > 0 && (
            <div>
              <p className="num text-[18px] font-extrabold text-bad">
                {formatMoneyShort(yearStats.fees, 'AUD', locale)}
              </p>
              <p className="text-[11px] text-ink2">{t('totalFeesLabel')}</p>
            </div>
          )}
        </div>
      )}

      {formOpen ? (
        <div className="anim-rise space-y-3 rounded-3xl border border-line bg-card p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('audSentLabel')}>
              <input className={`${inputCls} num`} value={audRaw} onChange={(e) => setAudRaw(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </Field>
            <Field label={t('brlReceivedLabel')}>
              <input className={`${inputCls} num`} value={brlRaw} onChange={(e) => setBrlRaw(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </Field>
            <Field label={t('feeLabel')}>
              <input className={`${inputCls} num`} value={feeRaw} onChange={(e) => setFeeRaw(e.target.value)} inputMode="decimal" placeholder="—" />
            </Field>
            <Field label={t('expenseDate')}>
              <input type="date" className={inputCls} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </Field>
          </div>
          <Field label={t('notes')}>
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Wise, Remitly…" />
          </Field>
          <div className="flex gap-2">
            {editing && (
              <button
                onClick={async () => {
                  if (confirm(t('deleteConfirm'))) {
                    await deleteTransfer(editing.id)
                    setFormOpen(false)
                  }
                }}
                className="press rounded-2xl border border-line px-4 py-3 text-[14px] font-bold text-bad"
              >
                {t('delete')}
              </button>
            )}
            <button onClick={save} className="press grad-accent flex-1 rounded-2xl py-3 text-[14px] font-bold text-white">
              {t('save')}
            </button>
          </div>
          <button onClick={() => setFormOpen(false)} className="w-full py-1 text-[13px] font-semibold text-ink2">
            ← {t('back')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => openForm(null)}
          className="press grad-accent w-full rounded-2xl py-3.5 text-[15px] font-bold text-white shadow-md"
        >
          ✈️ {t('transferAdd')}
        </button>
      )}

      {transfers.length === 0 ? (
        <EmptyState emoji="✈️" title={t('noTransfers')} />
      ) : (
        <div className="divide-y divide-line rounded-2xl border border-line bg-card">
          {transfers.map((tr, i) => (
            <button
              key={tr.id}
              onClick={() => openForm(tr)}
              className="anim-rise flex w-full items-center gap-3 px-4 py-3 text-left"
              style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card2 text-xl">✈️</span>
              <span className="min-w-0 flex-1">
                <span className="num block text-[15px] font-semibold text-ink">
                  {formatMoneyShort(tr.audSent, 'AUD', locale)} → {formatMoneyShort(tr.brlReceived, 'BRL', locale)}
                </span>
                <span className="block text-[12px] text-ink2">
                  {formatDay(tr.date, locale)}
                  {tr.note && ` · ${tr.note}`}
                </span>
              </span>
              <span className="num shrink-0 text-[12px] font-bold text-ink2">
                {fmtRate(tr.brlReceived / tr.audSent)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
