import { useState } from 'react'
import type { Currency, VaultBox } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n } from '../lib/i18n'
import { formatMoney, formatMoneyShort, parseAmount, CURRENCY_FLAG } from '../lib/money'
import { monthOf } from '../lib/expenses'
import { todayISO } from '../lib/dates'
import { getVault, recordDeposit, vaultTotals } from '../lib/vault'
import { VaultNudge } from '../components/VaultNudge'
import { EmptyState, Field, inputCls, Segmented } from '../components/ui'

export function VaultScreen() {
  const { snapshot, saveSettings } = useAppData()
  const { t, locale, decimalSep } = useI18n()
  const vault = getVault(snapshot.settings)
  const totals = vaultTotals(vault.boxes)
  const month = monthOf(todayISO())

  const [editing, setEditing] = useState<VaultBox | 'new' | null>(null)
  const [action, setAction] = useState<{ id: string; dir: 1 | -1 } | null>(null)
  const [amountRaw, setAmountRaw] = useState('')

  const persistBoxes = async (boxes: VaultBox[]) => {
    await saveSettings({ ...snapshot.settings, vault: { ...vault, boxes } })
  }

  const applyAction = async () => {
    if (!action) return
    const amount = parseAmount(amountRaw, decimalSep)
    if (amount === null || amount <= 0) return
    const next = recordDeposit(vault, action.id, action.dir * amount, month)
    await saveSettings({ ...snapshot.settings, vault: next })
    setAction(null)
    setAmountRaw('')
  }

  const remove = async (box: VaultBox) => {
    if (!confirm(t('vaultDeleteConfirm'))) return
    await persistBoxes(vault.boxes.filter((b) => b.id !== box.id))
    setEditing(null)
  }

  const currenciesPresent = (['AUD', 'BRL'] as Currency[]).filter((c) => (totals[c] ?? 0) > 0)

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">🔐 {t('menuVault')}</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink2">{t('vaultIntro')}</p>
      </header>

      <section className="anim-rise grad-accent rounded-3xl p-5 text-white shadow-lg">
        <p className="text-[13px] font-semibold opacity-85">🐖 {t('vaultTotal')}</p>
        {currenciesPresent.length === 0 ? (
          <p className="num mt-1 text-[28px] font-extrabold">—</p>
        ) : (
          currenciesPresent.map((c) => (
            <p key={c} className="num mt-1 text-[28px] leading-tight font-extrabold">
              {CURRENCY_FLAG[c]} {formatMoneyShort(totals[c]!, c, locale)}
            </p>
          ))
        )}
      </section>

      <VaultNudge />

      <section>
        <h2 className="mb-2 px-1 text-[13px] font-extrabold tracking-wide text-ink2 uppercase">
          {t('vaultBoxes')}
        </h2>
        {vault.boxes.length === 0 && editing === null ? (
          <EmptyState emoji="🐖" title={t('vaultEmptyTitle')} body={t('vaultEmptyBody')} />
        ) : (
          <div className="space-y-2">
            {vault.boxes.map((b, i) => {
              const share = totals[b.currency] ? Math.round((b.amount / totals[b.currency]!) * 100) : 0
              return (
                <div
                  key={b.id}
                  className="anim-rise rounded-2xl border border-line bg-card px-4 py-3"
                  style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card2 text-xl">
                      {b.emoji || '🐖'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">{b.name}</span>
                      <span className="block text-[12px] text-ink2">
                        {share}% {t('vaultShareOf')} {b.currency}
                      </span>
                    </span>
                    <span className="num shrink-0 text-[15px] font-bold text-ink">
                      {formatMoney(b.amount, b.currency, locale)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-card2">
                    <div
                      className="grad-accent h-full rounded-full transition-all duration-500"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => {
                        setAction(action?.id === b.id && action.dir === 1 ? null : { id: b.id, dir: 1 })
                        setAmountRaw('')
                      }}
                      className="press flex-1 rounded-xl border border-good py-1.5 text-[12px] font-bold text-good"
                    >
                      ＋ {t('vaultDeposit')}
                    </button>
                    <button
                      onClick={() => {
                        setAction(action?.id === b.id && action.dir === -1 ? null : { id: b.id, dir: -1 })
                        setAmountRaw('')
                      }}
                      className="press flex-1 rounded-xl border border-line py-1.5 text-[12px] font-bold text-ink2"
                    >
                      − {t('vaultWithdraw')}
                    </button>
                    <button
                      onClick={() => setEditing(b)}
                      aria-label={t('editTitle')}
                      className="press rounded-xl border border-line px-3 py-1.5 text-[12px] font-semibold text-ink2"
                    >
                      ✏️
                    </button>
                  </div>
                  {action?.id === b.id && (
                    <div className="anim-rise mt-2 flex items-end gap-2">
                      <input
                        className={`${inputCls} num flex-1`}
                        value={amountRaw}
                        onChange={(e) => setAmountRaw(e.target.value)}
                        inputMode="decimal"
                        placeholder={decimalSep === ',' ? '0,00' : '0.00'}
                        autoFocus
                      />
                      <button
                        onClick={applyAction}
                        disabled={!parseAmount(amountRaw, decimalSep)}
                        className={`press shrink-0 rounded-xl px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50 ${
                          action.dir === 1 ? 'bg-good' : 'bg-bad'
                        }`}
                      >
                        {action.dir === 1 ? t('vaultDeposit') : t('vaultWithdraw')}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {editing !== null ? (
        <BoxForm
          box={editing === 'new' ? null : editing}
          onSave={async (b) => {
            const exists = vault.boxes.some((x) => x.id === b.id)
            await persistBoxes(exists ? vault.boxes.map((x) => (x.id === b.id ? b : x)) : [...vault.boxes, b])
            setEditing(null)
          }}
          onDelete={editing !== 'new' ? () => remove(editing) : undefined}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button
          onClick={() => setEditing('new')}
          className="press w-full rounded-2xl border border-dashed border-line py-3 text-[14px] font-semibold text-ink2"
        >
          ＋ {t('vaultNewBox')}
        </button>
      )}
    </div>
  )
}

function BoxForm({
  box,
  onSave,
  onDelete,
  onCancel,
}: {
  box: VaultBox | null
  onSave: (b: VaultBox) => Promise<void>
  onDelete?: () => void
  onCancel: () => void
}) {
  const { t, locale, decimalSep } = useI18n()
  const [emoji, setEmoji] = useState(box?.emoji ?? '')
  const [name, setName] = useState(box?.name ?? '')
  const [amountRaw, setAmountRaw] = useState(box && box.amount > 0 ? String(box.amount) : '')
  const [currency, setCurrency] = useState<Currency>(box?.currency ?? 'AUD')
  const [error, setError] = useState('')

  const amount = amountRaw.trim() === '' ? 0 : parseAmount(amountRaw, decimalSep)

  const save = async () => {
    if (!name.trim()) return setError(t('fillName'))
    if (amount === null || amount < 0) return setError(t('invalidAmount'))
    await onSave({
      id: box?.id ?? crypto.randomUUID(),
      emoji: emoji.trim(),
      name: name.trim(),
      currency,
      amount,
      createdAt: box?.createdAt ?? new Date().toISOString(),
    })
  }

  return (
    <div className="anim-rise space-y-3 rounded-3xl border border-line bg-card2 p-4">
      <p className="text-[14px] font-bold text-ink">{box ? t('editTitle') : t('vaultNewBox')}</p>
      <div className="flex items-end gap-2">
        <label className="block w-16 shrink-0">
          <span className="mb-1.5 block text-[13px] font-semibold text-ink2">{t('categoryEmoji')}</span>
          <input
            className={`${inputCls} text-center`}
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🐖"
            maxLength={16}
          />
        </label>
        <label className="block min-w-0 flex-1">
          <span className="mb-1.5 block text-[13px] font-semibold text-ink2">{t('name')}</span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('vaultBoxNamePlaceholder')}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('vaultAmountLabel')}>
          <input
            className={`${inputCls} num`}
            value={amountRaw}
            onChange={(e) => setAmountRaw(e.target.value)}
            inputMode="decimal"
            placeholder={decimalSep === ',' ? '0,00' : '0.00'}
          />
          {amount !== null && amount > 0 && (
            <span className="num mt-1 block text-[12px] font-semibold text-ink2">
              = {formatMoney(amount, currency, locale)}
            </span>
          )}
        </Field>
        <Field label={t('currency')}>
          <Segmented
            options={[
              { value: 'AUD', label: '🇦🇺' },
              { value: 'BRL', label: '🇧🇷' },
            ]}
            value={currency}
            onChange={setCurrency}
          />
        </Field>
      </div>
      {error && <p className="text-[13px] font-semibold text-bad">{error}</p>}
      <div className="flex gap-2">
        {onDelete && (
          <button
            onClick={onDelete}
            className="press rounded-xl border border-line px-4 py-2.5 text-[13px] font-bold text-bad"
          >
            {t('delete')}
          </button>
        )}
        <button onClick={save} className="press grad-accent flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white">
          {t('save')}
        </button>
      </div>
      <button onClick={onCancel} className="w-full py-1 text-[13px] font-semibold text-ink2">
        ← {t('back')}
      </button>
    </div>
  )
}
