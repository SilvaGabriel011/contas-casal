import { useEffect, useRef, useState } from 'react'
import type { Currency, Expense, Frequency, Income, IncomeFrequency, Item, ItemKind, Owner } from '../types'
import { getDeviceOwner } from '../lib/device'
import { CATEGORIES } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n, type TKey } from '../lib/i18n'
import { CAT_KEY, categoryEmoji } from '../lib/categories'
import { AiQuickAdd } from './AiQuickAdd'
import type { QuickDraft } from '../lib/ai'
import { FREQ_EVERY, KIND_CONFIG } from '../lib/kinds'
import { formatAmountInput, formatMoney, parseAmount } from '../lib/money'
import { hourlyPerCycle } from '../lib/schedule'
import { buildRemindersIcs, icsEventCount, shareIcs } from '../lib/ics'
import { formatDay } from '../lib/i18n'
import { addMonthsClamped, monthsInclusive, todayISO } from '../lib/dates'
import { downscaleImage } from '../lib/image'
import { Chip, Field, inputCls, Segmented, Sheet } from './ui'

type FormKind = ItemKind | 'income' | 'expense'
type Screen = 'menu' | 'ai' | 'form'

function ReceiptThumb({
  src,
  alt,
  removeLabel,
  onRemove,
}: {
  src: string
  alt: string
  removeLabel: string
  onRemove: () => void
}) {
  return (
    <div className="relative">
      <img src={src} alt={alt} className="h-20 w-20 rounded-xl border border-line object-cover" />
      <button
        onClick={onRemove}
        aria-label={removeLabel}
        className="press absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-bad text-[12px] font-bold text-white shadow"
      >
        ✕
      </button>
    </div>
  )
}

// The intent list: verbs instead of a taxonomy quiz. Each row opens ONE
// single-screen form with only that intent's fields.
const INTENTS: { kind: FormKind; emoji: string; labelKey: TKey; hintKey: TKey }[] = [
  { kind: 'expense', emoji: '☕', labelKey: 'intentExpense', hintKey: 'intentExpenseHint' },
  { kind: 'bill', emoji: '🧾', labelKey: 'intentBill', hintKey: 'kindBillHint' },
  { kind: 'subscription', emoji: '🔁', labelKey: 'intentSub', hintKey: 'kindSubHint' },
  { kind: 'installment', emoji: '💳', labelKey: 'intentInst', hintKey: 'kindInstHint' },
  { kind: 'purchase', emoji: '🛍️', labelKey: 'intentPurchase', hintKey: 'kindPurchaseHint' },
  { kind: 'income', emoji: '💰', labelKey: 'intentIncome', hintKey: 'intentIncomeHint' },
]

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
    listReceipts,
    removeReceipt,
    deleteReceipt,
  } = useAppData()
  const { t, lang, locale, decimalSep } = useI18n()
  const editing = Boolean(editItem || editIncome || editExpense)

  const [screen, setScreen] = useState<Screen>('menu')
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
  const [newCatOpen, setNewCatOpen] = useState(false)
  const [newCatEmoji, setNewCatEmoji] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const receiptInputRef = useRef<HTMLInputElement>(null)
  // The receipt gallery: what's already stored, what was added this session
  // (uploaded on save) and which stored ones the user removed.
  const [receipts, setReceipts] = useState<{ id: string; url: string }[]>([])
  const [newReceipts, setNewReceipts] = useState<{ id: string; blob: Blob; preview: string }[]>([])
  const [removedReceiptIds, setRemovedReceiptIds] = useState<string[]>([])
  const [aiFilled, setAiFilled] = useState(false)

  // AI quick-add with a single result: fill the detected intent's form and
  // land on it — the user just reviews the fields and hits save.
  const applyDraft = (d: QuickDraft) => {
    setKindPreset(d.type)
    setAmountRaw(formatAmountInput(d.amount, decimalSep))
    setCurrency(d.currency)
    setName(d.name ?? '')
    setNotes(d.note ?? '')
    if (d.category) setCategory(d.category)
    setStartDate(d.date ?? todayISO())
    if (d.type === 'income') {
      setOwner(d.owner === 'b' ? 'b' : 'a')
      setFrequency(
        d.frequency === 'weekly' || d.frequency === 'fortnightly' || d.frequency === 'once'
          ? d.frequency
          : 'monthly'
      )
      setBasis('fixed')
    } else {
      setOwner(d.owner ?? 'shared')
      if (d.type === 'expense') {
        setPaidBy(d.paidBy ?? getDeviceOwner() ?? 'a')
      } else {
        const cfg = KIND_CONFIG[d.type]
        const freq = ['weekly', 'fortnightly', 'monthly', 'yearly', 'once'].includes(d.frequency ?? '')
          ? (d.frequency as Frequency)
          : 'monthly'
        setFrequency(cfg.forcedFrequency ?? freq)
        if (d.type === 'installment') {
          setInstMode('count')
          setInstallments(String(d.installmentsTotal ?? 12))
        }
      }
    }
    setError('')
    setAiFilled(true)
    setScreen('form')
  }

  useEffect(() => {
    if (!open) return
    setError('')
    setScreen(editItem || editIncome || editExpense ? 'form' : 'menu')
    setNewCatOpen(false)
    setNewCatEmoji('')
    setNewCatName('')
    setReceipts([])
    setNewReceipts([])
    setRemovedReceiptIds([])
    setAiFilled(false)
    if (editExpense && mode === 'cloud') {
      listReceipts(editExpense.id).then(setReceipts)
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

  const openIntent = (k: FormKind) => {
    setError('')
    setKindPreset(k)
    setScreen('form')
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
  const incomeFrequency: IncomeFrequency = frequency === 'yearly' ? 'monthly' : frequency
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
        for (const r of newReceipts) {
          const ok = await uploadReceipt(expenseId, r.id, await downscaleImage(r.blob))
          if (!ok) alert(t('receiptFailed'))
        }
        for (const id of removedReceiptIds) await removeReceipt(expenseId, id)
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
    if (kind === 'installment' && instMode === 'until' && (!endMonth || nInstallments < 1))
      return setError(t('invalidEndMonth'))
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

  const incomeFreqOptions: IncomeFrequency[] = ['weekly', 'fortnightly', 'monthly', 'once']
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
      ? incomeFrequency === 'once'
        ? t('payDateOnce')
        : t('nextPayDate')
      : kind === 'expense'
        ? t('expenseDate')
        : frequency === 'once' && kind !== 'purchase'
          ? t('dueDate')
          : t(KIND_CONFIG[kind].dateLabelKey)

  const intent = INTENTS.find((i) => i.kind === kind)
  const title =
    screen === 'menu'
      ? t('addIntentTitle')
      : screen === 'ai'
        ? `✨ ${t('intentAi')}`
        : editing
          ? t('editTitle')
          : intent
            ? `${intent.emoji} ${t(intent.labelKey)}`
            : t('addTitle')

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-4 pb-4">
        {screen === 'menu' && (
          <div className="anim-rise space-y-4">
            <div className="divide-y divide-line rounded-2xl border border-line bg-card">
              {INTENTS.map((i, idx) => (
                <button
                  key={i.kind}
                  onClick={() => openIntent(i.kind)}
                  className="press anim-rise flex w-full items-center gap-3 px-4 py-3.5 text-left"
                  style={{ animationDelay: `${Math.min(idx * 35, 250)}ms` }}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card2 text-xl">
                    {i.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold text-ink">{t(i.labelKey)}</span>
                    <span className="block text-[12px] leading-snug text-ink2">{t(i.hintKey)}</span>
                  </span>
                  <span className="shrink-0 text-[16px] font-bold text-ink2">›</span>
                </button>
              ))}
            </div>

            {mode === 'cloud' && (
              <button
                onClick={() => {
                  setError('')
                  setScreen('ai')
                }}
                className="press anim-rise flex w-full items-center gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3.5 text-left"
              >
                <span className="grad-accent flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl text-white">
                  ✨
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-ink">{t('intentAi')}</span>
                  <span className="block text-[12px] leading-snug text-ink2">{t('intentAiHint')}</span>
                </span>
                <span className="shrink-0 text-[16px] font-bold text-ink2">›</span>
              </button>
            )}
          </div>
        )}

        {screen === 'ai' && (
          <div className="anim-rise space-y-4">
            <AiQuickAdd onDone={onClose} onPrefill={applyDraft} />
            <button
              onClick={() => setScreen('menu')}
              className="press w-full py-1 text-[13px] font-semibold text-ink2"
            >
              ← {t('back')}
            </button>
          </div>
        )}

        {screen === 'form' && (
          <div className="anim-rise space-y-4">
            {aiFilled && (
              <p className="anim-rise rounded-2xl bg-accent/10 px-4 py-2.5 text-[13px] font-bold text-accent">
                ✨ {t('aiFilledBanner')}
              </p>
            )}

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

            {kind === 'income' && incomeFrequency !== 'once' && (
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

            {kind === 'income' ? (
              <>
                <Field label={t('frequency')}>
                  <div className="flex flex-wrap gap-2">
                    {incomeFreqOptions.map((f) => (
                      <Chip
                        key={f}
                        selected={incomeFrequency === f}
                        onClick={() => {
                          setFrequency(f)
                          // A one-off (an extra shift) is a plain amount — the
                          // hourly calculator only makes sense for a cadence.
                          if (f === 'once') setBasis('fixed')
                        }}
                      >
                        {f === 'once' ? t('onceIncome') : t(f as TKey)}
                      </Chip>
                    ))}
                  </div>
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
              </>
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
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const added = Array.from(e.target.files ?? []).map((f) => ({
                      id: crypto.randomUUID(),
                      blob: f as Blob,
                      preview: URL.createObjectURL(f),
                    }))
                    if (added.length > 0) setNewReceipts((prev) => [...prev, ...added])
                    e.target.value = ''
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  {receipts
                    .filter((r) => !removedReceiptIds.includes(r.id))
                    .map((r) => (
                      <ReceiptThumb
                        key={r.id}
                        src={r.url}
                        alt={t('receiptLabel')}
                        removeLabel={t('receiptRemove')}
                        onRemove={() => setRemovedReceiptIds((prev) => [...prev, r.id])}
                      />
                    ))}
                  {newReceipts.map((r) => (
                    <ReceiptThumb
                      key={r.id}
                      src={r.preview}
                      alt={t('receiptLabel')}
                      removeLabel={t('receiptRemove')}
                      onRemove={() => {
                        URL.revokeObjectURL(r.preview)
                        setNewReceipts((prev) => prev.filter((n) => n.id !== r.id))
                      }}
                    />
                  ))}
                  <button
                    onClick={() => receiptInputRef.current?.click()}
                    aria-label={t('receiptAttach')}
                    className="press flex h-20 w-20 flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-line text-ink2"
                  >
                    <span className="text-xl">📷</span>
                    <span className="text-lg leading-none">＋</span>
                  </button>
                </div>
              </Field>
            )}

            {editing && editItem && (
              <button
                onClick={exportReminder}
                className="press w-full rounded-2xl border border-line bg-card2 py-3 text-[14px] font-semibold text-ink"
              >
                📅 {t('calendarAdd')}
              </button>
            )}

            {error && <p className="text-sm font-semibold text-bad">{error}</p>}

            <div className="flex gap-3 pt-1">
              {editing ? (
                <button
                  onClick={remove}
                  className="press rounded-2xl border border-line px-4 py-3.5 text-[15px] font-bold text-bad"
                >
                  {t('delete')}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setError('')
                    setScreen('menu')
                  }}
                  className="press rounded-2xl border border-line px-5 py-3.5 text-[15px] font-bold text-ink2"
                >
                  ← {t('back')}
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
        )}
      </div>
    </Sheet>
  )
}
