import { useEffect, useState } from 'react'
import type { Currency, Frequency, Income, IncomeFrequency, Item, ItemKind, Owner } from '../types'
import { CATEGORIES } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, type TKey } from '../lib/i18n'
import { CAT_KEY, categoryEmoji, categoryLabel } from '../lib/categories'
import { FREQ_EVERY, ITEM_KINDS, KIND_CONFIG } from '../lib/kinds'
import { formatAmountInput, formatMoney, parseAmount } from '../lib/money'
import { hourlyPerCycle } from '../lib/schedule'
import { buildRemindersIcs, icsEventCount, shareIcs } from '../lib/ics'
import { formatDay } from '../lib/i18n'
import { todayISO } from '../lib/dates'
import { Chip, Field, inputCls, Segmented, Sheet } from './ui'

type FormKind = ItemKind | 'income'

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
  const { snapshot, upsertItem, deleteItem, upsertIncome, deleteIncome, saveSettings } = useAppData()
  const { t, lang, locale, decimalSep } = useI18n()
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
  const [basis, setBasis] = useState<'fixed' | 'hourly'>('fixed')
  const [rateRaw, setRateRaw] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState('8')
  const [daysPerWeek, setDaysPerWeek] = useState('5')
  const [error, setError] = useState('')
  const [newCatOpen, setNewCatOpen] = useState(false)
  const [newCatEmoji, setNewCatEmoji] = useState('')
  const [newCatName, setNewCatName] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setNewCatOpen(false)
    setNewCatEmoji('')
    setNewCatName('')
    if (editItem) {
      setKind(editItem.kind)
      setName(editItem.name)
      setAmountRaw(formatAmountInput(editItem.amount, decimalSep))
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
      setAmountRaw(formatAmountInput(editIncome.amount, decimalSep))
      setCurrency(editIncome.currency)
      setOwner(editIncome.owner)
      setFrequency(editIncome.frequency)
      setStartDate(editIncome.nextDate)
      setIncomeActive(editIncome.active)
      const hourly = Boolean(editIncome.hourlyRate && editIncome.hoursPerDay && editIncome.daysPerWeek)
      setBasis(hourly ? 'hourly' : 'fixed')
      setRateRaw(editIncome.hourlyRate ? formatAmountInput(editIncome.hourlyRate, decimalSep) : '')
      setHoursPerDay(String(editIncome.hoursPerDay ?? 8))
      setDaysPerWeek(String(editIncome.daysPerWeek ?? 5))
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
      setBasis('fixed')
      setRateRaw('')
      setHoursPerDay('8')
      setDaysPerWeek('5')
    }
  }, [open, editItem, editIncome, defaultOwner, decimalSep])

  const setKindPreset = (k: FormKind) => {
    setKind(k)
    if (k === 'income') {
      setFrequency('fortnightly')
      if (owner === 'shared') setOwner('a')
      return
    }
    const cfg = KIND_CONFIG[k]
    setCategory(cfg.defaultCategory)
    setFrequency(cfg.forcedFrequency ?? 'monthly')
    if (cfg.presetCurrency) setCurrency(cfg.presetCurrency)
  }

  const amount = parseAmount(amountRaw, decimalSep)
  const nInstallments = Math.max(1, Math.floor(Number(installments) || 0))
  const customCategories = snapshot.settings.customCategories

  const isHourlyIncome = kind === 'income' && basis === 'hourly'
  const rate = parseAmount(rateRaw, decimalSep)
  const nHoursPerDay = parseAmount(hoursPerDay, decimalSep) ?? 0
  const nDaysPerWeek = parseAmount(daysPerWeek, decimalSep) ?? 0
  const weeklyHours = nHoursPerDay * nDaysPerWeek
  const incomeFrequency: IncomeFrequency = frequency === 'yearly' || frequency === 'once' ? 'monthly' : frequency
  const cyclePay =
    rate !== null && weeklyHours > 0 ? hourlyPerCycle(rate, nHoursPerDay, nDaysPerWeek, incomeFrequency) : null

  const createCategory = async () => {
    const label = newCatName.trim()
    if (!label) return
    const emoji = newCatEmoji.trim() || '🏷️'
    const id = `c_${crypto.randomUUID().slice(0, 8)}`
    await saveSettings({
      ...snapshot.settings,
      customCategories: [...customCategories, { id, emoji, label }],
    })
    setCategory(id)
    setNewCatOpen(false)
    setNewCatEmoji('')
    setNewCatName('')
  }

  const save = async () => {
    if (!name.trim()) return setError(t('fillName'))
    if (editItem && !snapshot.items.some((i) => i.id === editItem.id)) return setError(t('deletedElsewhere'))
    if (editIncome && !snapshot.incomes.some((i) => i.id === editIncome.id))
      return setError(t('deletedElsewhere'))

    if (kind === 'income') {
      const cycleAmount = isHourlyIncome ? cyclePay : amount
      if (cycleAmount === null || cycleAmount <= 0) return setError(t('invalidAmount'))
      await upsertIncome({
        id: editIncome?.id ?? crypto.randomUUID(),
        name: name.trim(),
        owner,
        amount: Math.round(cycleAmount * 100) / 100,
        currency,
        frequency: incomeFrequency,
        nextDate: startDate,
        active: incomeActive,
        hourlyRate: isHourlyIncome ? rate : null,
        hoursPerDay: isHourlyIncome ? nHoursPerDay : null,
        daysPerWeek: isHourlyIncome ? nDaysPerWeek : null,
        createdAt: editIncome?.createdAt ?? new Date().toISOString(),
      })
      return onClose()
    }

    if (amount === null || amount <= 0) return setError(t('invalidAmount'))
    const item: Item = {
      id: editItem?.id ?? crypto.randomUUID(),
      kind,
      name: name.trim(),
      category,
      amount,
      currency,
      owner,
      frequency: KIND_CONFIG[kind].forcedFrequency ?? frequency,
      startDate,
      installmentsTotal: kind === 'installment' ? nInstallments : null,
      notes: notes.trim() || null,
      archived: editItem?.archived ?? false,
      createdAt: editItem?.createdAt ?? new Date().toISOString(),
    }
    await upsertItem(item)
    onClose()
  }

  const remove = async () => {
    if (!confirm(t('deleteConfirm'))) return
    if (editItem) await deleteItem(editItem.id)
    if (editIncome) await deleteIncome(editIncome.id)
    onClose()
  }

  const exportReminder = () => {
    if (!editItem) return
    const ics = buildRemindersIcs(
      [editItem],
      (i, due) =>
        t('calendarReminderTitle', { name: i.name, amount: formatMoney(i.amount, i.currency, locale) }) +
        ` (${formatDay(due, locale)})`,
      (_i, due) => t('calendarReminderBody', { date: formatDay(due, locale) })
    )
    if (icsEventCount(ics) === 0) return setError(t('calendarNothing'))
    shareIcs(`${editItem.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}-lembretes.ics`, ics)
  }

  const incomeFreqOptions: IncomeFrequency[] = ['weekly', 'fortnightly', 'monthly']
  const itemFreqOptions: Frequency[] = ['weekly', 'fortnightly', 'monthly', 'yearly', 'once']

  const ownerOptions: { value: Owner; label: string }[] = [
    { value: 'a', label: snapshot.settings.nameA },
    { value: 'b', label: snapshot.settings.nameB },
    ...(kind === 'income' ? [] : [{ value: 'shared' as Owner, label: t('couple') }]),
  ]

  const kindConfig = kind === 'income' ? null : KIND_CONFIG[kind]
  const showFrequency = !kindConfig?.forcedFrequency
  const dateLabel =
    kind === 'income'
      ? t('nextPayDate')
      : frequency === 'once' && kind !== 'purchase'
        ? t('dueDate')
        : t(KIND_CONFIG[kind].dateLabelKey)

  return (
    <Sheet open={open} onClose={onClose} title={editing ? t('editTitle') : t('addTitle')}>
      <div className="space-y-4 pb-4">
        {!editing && (
          <>
            <Segmented
              options={[
                { value: 'expense', label: `💸 ${t('expense')}` },
                { value: 'income', label: `💰 ${t('income')}` },
              ]}
              value={kind === 'income' ? 'income' : 'expense'}
              onChange={(v) => setKindPreset(v === 'income' ? 'income' : 'bill')}
            />

            {kind !== 'income' && (
              <div className="grid grid-cols-2 gap-2">
                {ITEM_KINDS.map((k) => (
                  <button
                    key={k}
                    onClick={() => setKindPreset(k)}
                    className={`press rounded-2xl border p-3 text-left transition-all ${
                      kind === k ? 'border-accent bg-card shadow-sm' : 'border-line bg-card2'
                    }`}
                  >
                    <span className="text-xl">{KIND_CONFIG[k].emoji}</span>
                    <span className="mt-1 block text-sm font-bold text-ink">{t(KIND_CONFIG[k].labelKey)}</span>
                    <span className="block text-[11px] leading-tight text-ink2">{t(KIND_CONFIG[k].hintKey)}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <Field label={t('name')}>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'income' ? t('incomeNamePlaceholder') : t('namePlaceholder')}
          />
        </Field>

        {kind === 'income' && (
          <Field label={t('payBasis')}>
            <Segmented
              options={[
                { value: 'fixed', label: `💵 ${t('basisFixed')}` },
                { value: 'hourly', label: `⏱️ ${t('basisHourly')}` },
              ]}
              value={basis}
              onChange={setBasis}
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={
              isHourlyIncome ? t('hourlyRateLabel') : kindConfig ? t(kindConfig.amountLabelKey) : t('amount')
            }
          >
            <input
              className={`${inputCls} num`}
              value={isHourlyIncome ? rateRaw : amountRaw}
              onChange={(e) => (isHourlyIncome ? setRateRaw(e.target.value) : setAmountRaw(e.target.value))}
              inputMode="decimal"
              placeholder={decimalSep === ',' ? '0,00' : '0.00'}
            />
            {!isHourlyIncome && amount !== null && /[.,]/.test(amountRaw) && (
              <span className="num mt-1 block text-[12px] font-semibold text-ink2">
                = {formatMoney(amount, currency, locale)}
              </span>
            )}
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

        {isHourlyIncome && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('hoursPerDayLabel')}>
                <input
                  className={`${inputCls} num`}
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(e.target.value)}
                  inputMode="decimal"
                />
              </Field>
              <Field label={t('daysPerWeekLabel')}>
                <input
                  className={`${inputCls} num`}
                  value={daysPerWeek}
                  onChange={(e) => setDaysPerWeek(e.target.value)}
                  inputMode="decimal"
                />
              </Field>
            </div>
            {cyclePay !== null && (
              <p className="num anim-rise rounded-2xl bg-card2 px-4 py-3 text-[13px] font-bold text-ink">
                ⏱️ {weeklyHours}h/{lang === 'pt' ? 'sem' : 'wk'} = {formatMoney(cyclePay, currency, locale)}{' '}
                <span className="font-semibold text-ink2">{t(FREQ_EVERY[incomeFrequency])}</span>
              </p>
            )}
          </>
        )}

        {kind === 'installment' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('numInstallments')}>
              <input
                className={`${inputCls} num`}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </Field>
            <div className="flex items-end pb-3 text-sm font-semibold text-ink2">
              {amount !== null && amount > 0 && (
                <span className="num">
                  {t('totalOfPlan', { v: formatMoney(amount * nInstallments, currency, locale) })}
                </span>
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

        {kind === 'income' ? (
          <>
            <Field label={t('frequency')}>
              <Segmented
                options={incomeFreqOptions.map((f) => ({ value: f, label: t(f as TKey) }))}
                value={incomeFrequency}
                onChange={(f) => setFrequency(f)}
              />
            </Field>
            {editing && (
              <Field label={t('activeOne')}>
                <Segmented
                  options={[
                    { value: 'on', label: `✅ ${t('activeOne')}` },
                    { value: 'off', label: `⏸️ ${t('inactive')}` },
                  ]}
                  value={incomeActive ? 'on' : 'off'}
                  onChange={(v) => setIncomeActive(v === 'on')}
                />
              </Field>
            )}
          </>
        ) : (
          showFrequency && (
            <Field label={t('frequency')}>
              <div className="flex flex-wrap gap-2">
                {itemFreqOptions.map((f) => (
                  <Chip key={f} selected={frequency === f} onClick={() => setFrequency(f)}>
                    {t(f as TKey)}
                  </Chip>
                ))}
              </div>
            </Field>
          )
        )}

        <Field label={dateLabel}>
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
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <Chip key={c} selected={category === c} onClick={() => setCategory(c)}>
                    {categoryEmoji(c, snapshot.settings)} {t(CAT_KEY[c])}
                  </Chip>
                ))}
                {customCategories.map((c) => (
                  <Chip key={c.id} selected={category === c.id} onClick={() => setCategory(c.id)}>
                    {c.emoji} {c.label}
                  </Chip>
                ))}
                <Chip selected={newCatOpen} onClick={() => setNewCatOpen((v) => !v)}>
                  ＋ {t('newCategory')}
                </Chip>
              </div>
            </Field>

            {newCatOpen && (
              <div className="anim-rise flex items-end gap-2 rounded-2xl border border-line bg-card2 p-3">
                <label className="block w-16 shrink-0">
                  <span className="mb-1.5 block text-[13px] font-semibold text-ink2">
                    {t('categoryEmoji')}
                  </span>
                  <input
                    className={`${inputCls} text-center`}
                    value={newCatEmoji}
                    onChange={(e) => setNewCatEmoji(e.target.value)}
                    placeholder="🏷️"
                    maxLength={16}
                  />
                </label>
                <label className="block min-w-0 flex-1">
                  <span className="mb-1.5 block text-[13px] font-semibold text-ink2">
                    {t('categoryName')}
                  </span>
                  <input
                    className={inputCls}
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder={t('categoryNamePlaceholder')}
                  />
                </label>
                <button
                  onClick={createCategory}
                  disabled={!newCatName.trim()}
                  className="press grad-accent shrink-0 rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {t('createCategory')}
                </button>
              </div>
            )}

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

        {editing && editItem && (
          <>
            <button
              onClick={exportReminder}
              className="press w-full rounded-2xl border border-line bg-card2 py-3 text-[14px] font-semibold text-ink"
            >
              📅 {t('calendarAdd')}
            </button>
            <p className="text-[13px] font-semibold text-ink2">
              {categoryLabel(category, snapshot.settings, t)} · {t(kind as TKey)}
            </p>
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
