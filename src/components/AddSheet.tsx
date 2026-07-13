import { useEffect, useState } from 'react'
import type { Currency, Frequency, Income, IncomeFrequency, Item, ItemKind, Owner } from '../types'
import { CATEGORIES, CATEGORY_EMOJI } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, type TKey } from '../lib/i18n'
import { formatMoney, parseAmount } from '../lib/money'
import { todayISO } from '../lib/dates'
import { Chip, Field, inputCls, Segmented, Sheet } from './ui'

type FormKind = ItemKind | 'income'

const CAT_KEY: Record<string, TKey> = {
  rent: 'catRent',
  utilities: 'catUtilities',
  internet: 'catInternet',
  phone: 'catPhone',
  groceries: 'catGroceries',
  transport: 'catTransport',
  car: 'catCar',
  health: 'catHealth',
  insurance: 'catInsurance',
  education: 'catEducation',
  card: 'catCard',
  streaming: 'catStreaming',
  gym: 'catGym',
  tax: 'catTax',
  travel: 'catTravel',
  gift: 'catGift',
  other: 'catOther',
}

export function AddSheet({
  open,
  onClose,
  editItem,
  editIncome,
  defaultOwner,
}: {
  open: boolean
  onClose: () => void
  editItem?: Item | null
  editIncome?: Income | null
  defaultOwner: Owner
}) {
  const { snapshot, upsertItem, deleteItem, upsertIncome, deleteIncome } = useAppData()
  const { t, locale } = useI18n()
  const editing = Boolean(editItem || editIncome)

  const [kind, setKind] = useState<FormKind>('bill')
  const [name, setName] = useState('')
  const [amountRaw, setAmountRaw] = useState('')
  const [currency, setCurrency] = useState<Currency>('AUD')
  const [owner, setOwner] = useState<Owner>('shared')
  const [category, setCategory] = useState<string>('rent')
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [startDate, setStartDate] = useState(todayISO())
  const [installments, setInstallments] = useState('12')
  const [notes, setNotes] = useState('')
  const [incomeActive, setIncomeActive] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (editItem) {
      setKind(editItem.kind)
      setName(editItem.name)
      setAmountRaw(String(editItem.amount).replace('.', locale.startsWith('pt') ? ',' : '.'))
      setCurrency(editItem.currency)
      setOwner(editItem.owner)
      setCategory(editItem.category)
      setFrequency(editItem.frequency)
      setStartDate(editItem.startDate)
      setInstallments(String(editItem.installmentsTotal ?? 12))
      setNotes(editItem.notes ?? '')
    } else if (editIncome) {
      setKind('income')
      setName(editIncome.name)
      setAmountRaw(String(editIncome.amount).replace('.', locale.startsWith('pt') ? ',' : '.'))
      setCurrency(editIncome.currency)
      setOwner(editIncome.owner)
      setFrequency(editIncome.frequency)
      setStartDate(editIncome.nextDate)
      setIncomeActive(editIncome.active)
    } else {
      setKind('bill')
      setName('')
      setAmountRaw('')
      setCurrency('AUD')
      setOwner(defaultOwner)
      setCategory('rent')
      setFrequency('monthly')
      setStartDate(todayISO())
      setInstallments('12')
      setNotes('')
      setIncomeActive(true)
    }
  }, [open, editItem, editIncome, defaultOwner, locale])

  const setKindPreset = (k: FormKind) => {
    setKind(k)
    if (k === 'installment') {
      setCurrency('BRL')
      setCategory('card')
      setFrequency('monthly')
    } else if (k === 'subscription') {
      setCategory('streaming')
      setFrequency('monthly')
    } else if (k === 'income') {
      setFrequency('fortnightly')
      if (owner === 'shared') setOwner('a')
    } else {
      setCategory('rent')
    }
  }

  const amount = parseAmount(amountRaw)
  const nInstallments = Math.max(1, Math.floor(Number(installments) || 0))

  const save = async () => {
    if (!name.trim()) return setError(t('fillName'))
    if (amount === null || amount <= 0) return setError(t('invalidAmount'))

    if (kind === 'income') {
      const income: Income = {
        id: editIncome?.id ?? crypto.randomUUID(),
        name: name.trim(),
        owner,
        amount,
        currency,
        frequency: frequency as IncomeFrequency,
        nextDate: startDate,
        active: incomeActive,
        createdAt: editIncome?.createdAt ?? new Date().toISOString(),
      }
      await upsertIncome(income)
    } else {
      const item: Item = {
        id: editItem?.id ?? crypto.randomUUID(),
        kind,
        name: name.trim(),
        category,
        amount,
        currency,
        owner,
        frequency: kind === 'installment' ? 'monthly' : frequency,
        startDate,
        installmentsTotal: kind === 'installment' ? nInstallments : null,
        notes: notes.trim() || null,
        archived: editItem?.archived ?? false,
        createdAt: editItem?.createdAt ?? new Date().toISOString(),
      }
      await upsertItem(item)
    }
    onClose()
  }

  const remove = async () => {
    if (!confirm(t('deleteConfirm'))) return
    if (editItem) await deleteItem(editItem.id)
    if (editIncome) await deleteIncome(editIncome.id)
    onClose()
  }

  const kinds: { value: FormKind; emoji: string; label: string; hint: string }[] = [
    { value: 'bill', emoji: '🧾', label: t('bill'), hint: t('kindBillHint') },
    { value: 'subscription', emoji: '🔁', label: t('subscription'), hint: t('kindSubHint') },
    { value: 'installment', emoji: '💳', label: t('installment'), hint: t('kindInstHint') },
    { value: 'income', emoji: '💰', label: t('income'), hint: t('kindIncomeHint') },
  ]

  const freqOptions: Frequency[] =
    kind === 'income' ? ['weekly', 'fortnightly', 'monthly'] : ['weekly', 'fortnightly', 'monthly', 'yearly', 'once']

  const ownerOptions: { value: Owner; label: string }[] = [
    { value: 'a', label: snapshot.settings.nameA },
    { value: 'b', label: snapshot.settings.nameB },
    ...(kind === 'income' ? [] : [{ value: 'shared' as Owner, label: t('couple') }]),
  ]

  return (
    <Sheet open={open} onClose={onClose} title={editing ? t('editTitle') : t('addTitle')}>
      <div className="space-y-4 pb-4">
        {!editing && (
          <div className="grid grid-cols-2 gap-2">
            {kinds.map((k) => (
              <button
                key={k.value}
                onClick={() => setKindPreset(k.value)}
                className={`press rounded-2xl border p-3 text-left transition-all ${
                  kind === k.value ? 'border-accent bg-card shadow-sm' : 'border-line bg-card2'
                }`}
              >
                <span className="text-xl">{k.emoji}</span>
                <span className="mt-1 block text-sm font-bold text-ink">{k.label}</span>
                <span className="block text-[11px] leading-tight text-ink2">{k.hint}</span>
              </button>
            ))}
          </div>
        )}

        <Field label={t('name')}>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'income' ? t('incomeNamePlaceholder') : t('namePlaceholder')}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === 'installment' ? t('installmentAmount') : t('amount')}>
            <input
              className={`${inputCls} num`}
              value={amountRaw}
              onChange={(e) => setAmountRaw(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
            />
          </Field>
          <Field label={t('currency')}>
            <Segmented
              options={[
                { value: 'AUD', label: '🇦🇺 AUD' },
                { value: 'BRL', label: '🇧🇷 BRL' },
              ]}
              value={currency}
              onChange={setCurrency}
              className="py-[3px]"
            />
          </Field>
        </div>

        {kind === 'installment' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('numInstallments')}>
              <input
                className={`${inputCls} num`}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <div className="flex items-end pb-3 text-sm font-semibold text-ink2">
              {amount !== null && amount > 0 && (
                <span className="num">{t('totalOfPlan', { v: formatMoney(amount * nInstallments, currency, locale) })}</span>
              )}
            </div>
          </div>
        )}

        <Field label={t('owner')}>
          <div className="flex gap-2">
            {ownerOptions.map((o) => (
              <Chip key={o.value} selected={owner === o.value} onClick={() => setOwner(o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
        </Field>

        {kind !== 'income' && kind !== 'installment' && (
          <Field label={t('frequency')}>
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
              {freqOptions.map((f) => (
                <Chip key={f} selected={frequency === f} onClick={() => setFrequency(f)}>
                  {t(f as TKey)}
                </Chip>
              ))}
            </div>
          </Field>
        )}

        {kind === 'income' && (
          <>
            <Field label={t('frequency')}>
              <Segmented
                options={freqOptions.map((f) => ({ value: f, label: t(f as TKey) }))}
                value={frequency}
                onChange={(f) => setFrequency(f)}
              />
            </Field>
            {editing && (
              <Field label={t('active')}>
                <Segmented
                  options={[
                    { value: 'on', label: `✅ ${t('active')}` },
                    { value: 'off', label: `⏸️ ${t('inactive')}` },
                  ]}
                  value={incomeActive ? 'on' : 'off'}
                  onChange={(v) => setIncomeActive(v === 'on')}
                />
              </Field>
            )}
          </>
        )}

        <Field
          label={
            kind === 'income'
              ? t('nextPayDate')
              : frequency === 'once' && kind !== 'installment'
                ? t('dueDate')
                : t('firstDue')
          }
        >
          <input
            type="date"
            className={inputCls}
            value={startDate}
            onChange={(e) => e.target.value && setStartDate(e.target.value)}
          />
        </Field>

        {kind !== 'income' && (
          <>
            <Field label={t('category')}>
              <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
                {CATEGORIES.map((c) => (
                  <Chip key={c} selected={category === c} onClick={() => setCategory(c)}>
                    {CATEGORY_EMOJI[c]} {t(CAT_KEY[c])}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label={t('notes')}>
              <input
                className={inputCls}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('notesPlaceholder')}
              />
            </Field>
          </>
        )}

        {error && <p className="text-sm font-semibold text-bad">{error}</p>}

        <div className="flex gap-3 pt-1">
          {editing && (
            <button
              onClick={remove}
              className="press rounded-2xl border border-line px-5 py-3.5 text-[15px] font-bold text-bad"
            >
              {t('delete')}
            </button>
          )}
          <button
            onClick={save}
            className="press grad-accent flex-1 rounded-2xl py-3.5 text-[15px] font-bold text-white shadow-md"
          >
            {t('save')}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
