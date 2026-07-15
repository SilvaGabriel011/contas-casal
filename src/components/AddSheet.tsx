import { useEffect, useRef, useState } from 'react'
import type { Currency, Expense, Frequency, Income, IncomeFrequency, Item, ItemKind, Owner } from '../types'
import { getDeviceOwner } from '../lib/device'
import { CATEGORIES } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, type TKey } from '../lib/i18n'
import { CAT_KEY, categoryEmoji } from '../lib/categories'
import { AiQuickAdd } from './AiQuickAdd'
import { FREQ_EVERY, ITEM_KINDS, KIND_CONFIG } from '../lib/kinds'
import { formatAmountInput, formatMoney, parseAmount } from '../lib/money'
import { hourlyPerCycle } from '../lib/schedule'
import { buildRemindersIcs, icsEventCount, shareIcs } from '../lib/ics'
import { formatDay } from '../lib/i18n'
import { addMonthsClamped, monthsInclusive, todayISO } from '../lib/dates'
import { downscaleImage } from '../lib/image'
import { Chip, Field, inputCls, Segmented, Sheet } from './ui'

type FormKind = ItemKind | 'income' | 'expense'

export function AddSheet({
  open,
  onClose,
  editItem,
  editIncome,
  editExpense,
  defaultOwner,
}: {
  open: boolean
  onClose: () => void
  editItem?: Item | null
  editIncome?: Income | null
  editExpense?: Expense | null
  defaultOwner: Owner
}) {
  const {
    snapshot,
    mode,
    upsertItem,
    deleteItem,
    upsertIncome,
    deleteIncome,
    upsertExpense,
    deleteExpense,
    saveSettings,
    uploadReceipt,
    getReceiptUrl,
    deleteReceipt,
  } = useAppData()
  const { t, lang, locale, decimalSep } = useI18n()
  const editing = Boolean(editItem || editIncome || editExpense)

  const [kind, setKind] = useState<FormKind>('bill')
  const [name, setName] = useState('')
  const [amountRaw, setAmountRaw] = useState('')
  const [currency, setCurrency] = useState<Currency>('AUD')
  const [owner, setOwner] = useState<Owner>('shared')
  const [category, setCategory] = useState<string>('rent')
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [startDate, setStartDate] = useState(todayISO())
  const [installments, setInstallments] = useState('12')
  const [instMode, setInstMode] = useState<'count' | 'until'>('count')
  const [endMonth, setEndMonth] = useState('')
  const [notes, setNotes] = useState('')
  const [incomeActive, setIncomeActive] = useState(true)
  const [basis, setBasis] = useState<'fixed' | 'hourly'>('fixed')
  const [paidBy, setPaidBy] = useState<'a' | 'b'>('a')
  const [rateRaw, setRateRaw] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState('8')
  const [daysPerWeek, setDaysPerWeek] = useState('5')
  const [error, setError] = useState('')
  const [stepIdx, setStepIdx] = useState(0)
  const [newCatOpen, setNewCatOpen] = useState(false)
  const [newCatEmoji, setNewCatEmoji] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const receiptInputRef = useRef<HTMLInputElement>(null)
  const [receiptBlob, setReceiptBlob] = useState<Blob | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [receiptRemoved, setReceiptRemoved] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    setStepIdx(0)
    setNewCatOpen(false)
    setNewCatEmoji('')
    setNewCatName('')
    setReceiptBlob(null)
    setReceiptPreview(null)
    setReceiptRemoved(false)
    if (editExpense && mode === 'cloud') {
      getReceiptUrl(editExpense.id).then((url) => {
        if (url) setReceiptPreview(url)
      })
    }
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
      setInstMode('count')
      setEndMonth(addMonthsClamped(editItem.startDate, (editItem.installmentsTotal ?? 12) - 1).slice(0, 7))
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
    } else if (editExpense) {
      setKind('expense')
      setName('')
      setAmountRaw(formatAmountInput(editExpense.amount, decimalSep))
      setCurrency(editExpense.currency)
      setOwner(editExpense.owner)
      setCategory(editExpense.category)
      setStartDate(editExpense.date)
      setNotes(editExpense.note ?? '')
      setPaidBy(editExpense.paidBy ?? getDeviceOwner() ?? 'a')
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
      setInstMode('count')
      setEndMonth('')
      setNotes('')
      setIncomeActive(true)
      setBasis('fixed')
      setRateRaw('')
      setHoursPerDay('8')
      setDaysPerWeek('5')
      setPaidBy(getDeviceOwner() ?? 'a')
    }
  }, [open, editItem, editIncome, editExpense, defaultOwner, decimalSep])

  const setKindPreset = (k: FormKind) => {
    setKind(k)
    if (k === 'income') {
      setFrequency('fortnightly')
      if (owner === 'shared') setOwner('a')
      return
    }
    if (k === 'expense') {
      setCategory('groceries')
      setStartDate(todayISO())
      return
    }
    const cfg = KIND_CONFIG[k]
    setCategory(cfg.defaultCategory)
    setFrequency(cfg.forcedFrequency ?? 'monthly')
    if (cfg.presetCurrency) setCurrency(cfg.presetCurrency)
  }

  const amount = parseAmount(amountRaw, decimalSep)
  // "until October" mode: the count is derived from first-payment month
  // through the chosen last month, inclusive.
  const nInstallments =
    instMode === 'until' && endMonth
      ? monthsInclusive(startDate, endMonth)
      : Math.max(1, Math.floor(Number(installments) || 0))
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
    if (kind !== 'expense' && !name.trim()) return setError(t('fillName'))
    if (editItem && !snapshot.items.some((i) => i.id === editItem.id)) return setError(t('deletedElsewhere'))
    if (editIncome && !snapshot.incomes.some((i) => i.id === editIncome.id))
      return setError(t('deletedElsewhere'))
    if (editExpense && !snapshot.expenses.some((e) => e.id === editExpense.id))
      return setError(t('deletedElsewhere'))

    if (kind === 'expense') {
      if (amount === null || amount <= 0) return setError(t('invalidAmount'))
      const expenseId = editExpense?.id ?? crypto.randomUUID()
      await upsertExpense({
        id: expenseId,
        date: startDate,
        amount,
        currency,
        category,
        owner,
        paidBy,
        note: notes.trim() || null,
        createdAt: editExpense?.createdAt ?? new Date().toISOString(),
      })
      if (mode === 'cloud') {
        if (receiptBlob) {
          const ok = await uploadReceipt(expenseId, await downscaleImage(receiptBlob))
          if (!ok) alert(t('receiptFailed'))
        } else if (receiptRemoved && editExpense) {
          await deleteReceipt(expenseId)
        }
      }
      return onClose()
    }

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
      installmentsTotal: kind === 'installment' ? Math.max(1, nInstallments) : null,
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
    if (editExpense) {
      await deleteExpense(editExpense.id)
      if (mode === 'cloud') void deleteReceipt(editExpense.id)
    }
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

  const kindConfig = kind === 'income' || kind === 'expense' ? null : KIND_CONFIG[kind]
  const showFrequency = kind !== 'expense' && !kindConfig?.forcedFrequency
  const dateLabel =
    kind === 'income'
      ? t('nextPayDate')
      : kind === 'expense'
        ? t('expenseDate')
        : frequency === 'once' && kind !== 'purchase'
          ? t('dueDate')
          : t(KIND_CONFIG[kind].dateLabelKey)

  // Wizard: what -> value -> details -> extras (income has no extras step).
  type WizardStep = 'what' | 'value' | 'details' | 'extras'
  const steps: WizardStep[] = [
    ...(editing ? [] : (['what'] as WizardStep[])),
    'value',
    'details',
    ...(kind === 'income' ? [] : (['extras'] as WizardStep[])),
  ]
  const step = steps[Math.min(stepIdx, steps.length - 1)]
  const stepTitle: Record<WizardStep, TKey> = {
    what: 'stepWhat',
    value: 'stepValue',
    details: 'stepDetails',
    extras: 'stepExtras',
  }

  const validateStep = (s: WizardStep): string | null => {
    if (s === 'value') {
      if (isHourlyIncome) {
        if (cyclePay === null || cyclePay <= 0) return t('invalidAmount')
      } else if (amount === null || amount <= 0) {
        return t('invalidAmount')
      }
      if (kind === 'installment' && instMode === 'until' && (!endMonth || nInstallments < 1))
        return t('invalidEndMonth')
    }
    if (s === 'details' && kind !== 'expense' && !name.trim()) return t('fillName')
    // The first-payment date lives on this step and can move past the chosen
    // last month, so the "until" count needs re-checking here too.
    if (s === 'details' && kind === 'installment' && instMode === 'until' && nInstallments < 1)
      return t('invalidEndMonth')
    return null
  }

  const nextStep = () => {
    const err = validateStep(step)
    if (err) return setError(err)
    setError('')
    if (stepIdx >= steps.length - 1) save()
    else setStepIdx(stepIdx + 1)
  }

  const prevStep = () => {
    setError('')
    setStepIdx(Math.max(0, stepIdx - 1))
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? t('editTitle') : t('addTitle')}>
      <div className="space-y-4 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1.5">
            {steps.map((s, i) => (
              <span
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= stepIdx ? 'grad-accent' : 'bg-card2'
                }`}
              />
            ))}
          </div>
          <span className="text-[12px] font-bold text-ink2">
            {t('stepOf', { a: stepIdx + 1, b: steps.length })} · {t(stepTitle[step])}
          </span>
        </div>

        {step === 'what' && (
          <div className="anim-rise space-y-4">
            <Segmented
              options={[
                { value: 'bill', label: `🧾 ${t('bill')}` },
                { value: 'expense', label: `☕ ${t('quickExpense')}` },
                { value: 'income', label: `💰 ${t('income')}` },
              ]}
              value={kind === 'income' ? 'income' : kind === 'expense' ? 'expense' : 'bill'}
              onChange={(v) => setKindPreset(v as FormKind)}
            />

            {kind !== 'income' && kind !== 'expense' && (
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

            <AiQuickAdd onDone={onClose} />
          </div>
        )}

        {step === 'value' && (
          <div className="anim-rise space-y-4">
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
          <div className="space-y-3">
            <Field label={t('numInstallments')}>
              <Segmented
                options={[
                  { value: 'count', label: `#️⃣ ${t('instModeCount')}` },
                  { value: 'until', label: `📅 ${t('instModeUntil')}` },
                ]}
                value={instMode}
                onChange={(v) => {
                  setInstMode(v)
                  // Entering "until" mode: seed the month from the current count
                  // so the picker starts on a sensible value.
                  if (v === 'until' && !endMonth)
                    setEndMonth(addMonthsClamped(startDate, nInstallments - 1).slice(0, 7))
                }}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              {instMode === 'count' ? (
                <Field label={t('instModeCount')}>
                  <input
                    className={`${inputCls} num`}
                    value={installments}
                    onChange={(e) => setInstallments(e.target.value)}
                    inputMode="numeric"
                    pattern="[0-9]*"
                  />
                </Field>
              ) : (
                <Field label={t('lastInstallmentMonth')}>
                  <input
                    type="month"
                    className={inputCls}
                    value={endMonth}
                    min={startDate.slice(0, 7)}
                    onChange={(e) => setEndMonth(e.target.value)}
                  />
                </Field>
              )}
              <div className="flex flex-col justify-end gap-0.5 pb-3 text-sm font-semibold text-ink2">
                {instMode === 'until' && endMonth && nInstallments >= 1 && (
                  <span className="num anim-rise">= {t('installmentsComputed', { n: nInstallments })}</span>
                )}
                {amount !== null && amount > 0 && nInstallments >= 1 && (
                  <span className="num">
                    {t('totalOfPlan', { v: formatMoney(amount * nInstallments, currency, locale) })}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
          </div>
        )}

        {step === 'details' && (
          <div className="anim-rise space-y-4">
        {kind !== 'expense' && (
          <Field label={t('name')}>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'income' ? t('incomeNamePlaceholder') : t('namePlaceholder')}
            />
          </Field>
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

        {kind === 'expense' && (
          <Field label={t('paidByLabel')}>
            <Segmented
              options={[
                { value: 'a', label: snapshot.settings.nameA },
                { value: 'b', label: snapshot.settings.nameB },
              ]}
              value={paidBy}
              onChange={setPaidBy}
            />
          </Field>
        )}

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
          </div>
        )}

        {step === 'extras' && kind !== 'income' && (
          <div className="anim-rise space-y-4">
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

            {kind === 'expense' && mode === 'cloud' && (
              <Field label={`🧾 ${t('receiptLabel')}`}>
                <input
                  ref={receiptInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setReceiptBlob(f)
                      setReceiptRemoved(false)
                      setReceiptPreview(URL.createObjectURL(f))
                    }
                    e.target.value = ''
                  }}
                />
                {receiptPreview ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={receiptPreview}
                      alt={t('receiptLabel')}
                      className="h-24 w-24 rounded-xl border border-line object-cover"
                    />
                    <button
                      onClick={() => {
                        setReceiptBlob(null)
                        setReceiptPreview(null)
                        if (editExpense) setReceiptRemoved(true)
                      }}
                      className="press rounded-xl border border-line px-3 py-2 text-[13px] font-bold text-bad"
                    >
                      {t('receiptRemove')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => receiptInputRef.current?.click()}
                    className="press w-full rounded-xl border border-dashed border-line py-3 text-[13px] font-semibold text-ink2"
                  >
                    📷 {t('receiptAttach')}
                  </button>
                )}
              </Field>
            )}
          </div>
        )}

        {editing && editItem && step === 'details' && (
          <button
            onClick={exportReminder}
            className="press w-full rounded-2xl border border-line bg-card2 py-3 text-[14px] font-semibold text-ink"
          >
            📅 {t('calendarAdd')}
          </button>
        )}

        {error && <p className="text-sm font-semibold text-bad">{error}</p>}

        <div className="flex gap-3 pt-1">
          {editing && (
            <button
              onClick={remove}
              className="press rounded-2xl border border-line px-4 py-3.5 text-[15px] font-bold text-bad"
            >
              {t('delete')}
            </button>
          )}
          {stepIdx > 0 && (
            <button
              onClick={prevStep}
              className="press rounded-2xl border border-line px-5 py-3.5 text-[15px] font-bold text-ink2"
            >
              ← {t('back')}
            </button>
          )}
          <button
            onClick={nextStep}
            className="press grad-accent flex-1 rounded-2xl py-3.5 text-[15px] font-bold text-white shadow-md"
          >
            {stepIdx >= steps.length - 1 ? t('save') : `${t('continueBtn')} →`}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
