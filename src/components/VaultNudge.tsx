import { useState } from 'react'
import type { Currency } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n } from '../lib/i18n'
import { formatMoney, formatMoneyShort, parseAmount } from '../lib/money'
import { monthOf } from '../lib/expenses'
import { todayISO } from '../lib/dates'
import { getVault, nudgeRemainders, recordDeposit } from '../lib/vault'
import { Chip, inputCls, Segmented } from './ui'

// "This month there's Y left over — stash it": one tap sends the leftover
// into a caixinha and the nudge quiets down for the rest of the month.
export function VaultNudge() {
  const { snapshot, saveSettings } = useAppData()
  const { t, locale, decimalSep } = useI18n()
  const today = todayISO()
  const month = monthOf(today)
  const vault = getVault(snapshot.settings)
  const remainders = nudgeRemainders(snapshot, today)

  const [open, setOpen] = useState(false)
  const [currency, setCurrency] = useState<Currency | null>(null)
  const [boxId, setBoxId] = useState<string | null>(null)
  const [amountRaw, setAmountRaw] = useState('')

  if (remainders.length === 0) return null

  const activeCurrency = currency ?? remainders[0][0]
  const remainder = remainders.find(([c]) => c === activeCurrency)?.[1] ?? 0
  const boxesForCurrency = vault.boxes.filter((b) => b.currency === activeCurrency)
  const activeBoxId = boxId ?? boxesForCurrency[0]?.id ?? null

  const openForm = () => {
    setOpen(true)
    setCurrency(remainders[0][0])
    setBoxId(null)
    setAmountRaw(String(Math.floor(remainders[0][1])))
  }

  const pickCurrency = (c: Currency) => {
    setCurrency(c)
    setBoxId(null)
    setAmountRaw(String(Math.floor(remainders.find(([rc]) => rc === c)?.[1] ?? 0)))
  }

  const save = async () => {
    const amount = parseAmount(amountRaw, decimalSep)
    if (amount === null || amount <= 0) return
    let boxes = vault.boxes
    let id = activeBoxId
    if (!id) {
      const box = {
        id: crypto.randomUUID(),
        emoji: '🐖',
        name: t('vaultDefaultBox'),
        currency: activeCurrency,
        amount: 0,
        createdAt: new Date().toISOString(),
      }
      boxes = [...boxes, box]
      id = box.id
    }
    const next = recordDeposit({ ...vault, boxes }, id, amount, month)
    await saveSettings({ ...snapshot.settings, vault: next })
    setOpen(false)
    setAmountRaw('')
    setBoxId(null)
  }

  return (
    <div className="anim-rise space-y-2.5 rounded-2xl border border-good/40 bg-good/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🐖</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug font-bold text-ink">
            {t('vaultNudgeTitle', {
              v: remainders.map(([c, v]) => formatMoneyShort(v, c, locale)).join(' + '),
            })}
          </p>
          <p className="text-[12px] text-ink2">{t('vaultNudgeBody')}</p>
        </div>
        {!open && (
          <button
            onClick={openForm}
            className="press shrink-0 rounded-full border border-good px-3 py-1.5 text-[12px] font-bold text-good"
          >
            {t('vaultNudgeCta')}
          </button>
        )}
      </div>

      {open && (
        <div className="anim-rise space-y-2">
          {remainders.length > 1 && (
            <Segmented
              options={remainders.map(([c]) => ({ value: c, label: c === 'AUD' ? '🇦🇺 AUD' : '🇧🇷 BRL' }))}
              value={activeCurrency}
              onChange={pickCurrency}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {boxesForCurrency.map((b) => (
              <Chip key={b.id} selected={activeBoxId === b.id} onClick={() => setBoxId(b.id)}>
                {b.emoji} {b.name}
              </Chip>
            ))}
            {boxesForCurrency.length === 0 && (
              <span className="text-[12px] font-semibold text-ink2">🐖 {t('vaultDefaultBox')}</span>
            )}
          </div>
          <div className="flex items-end gap-2">
            <input
              className={`${inputCls} num flex-1`}
              value={amountRaw}
              onChange={(e) => setAmountRaw(e.target.value)}
              inputMode="decimal"
            />
            <button
              onClick={save}
              disabled={!parseAmount(amountRaw, decimalSep)}
              className="press grad-accent shrink-0 rounded-xl px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {t('vaultDeposit')}
            </button>
          </div>
          {parseAmount(amountRaw, decimalSep) !== null && remainder > 0 && (
            <p className="num text-[11px] text-ink2">
              = {formatMoney(parseAmount(amountRaw, decimalSep) ?? 0, activeCurrency, locale)}
            </p>
          )}
          <button onClick={() => setOpen(false)} className="w-full py-0.5 text-[12px] font-semibold text-ink2">
            ← {t('back')}
          </button>
        </div>
      )}
    </div>
  )
}
