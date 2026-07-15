import { useState } from 'react'
import type { Currency, SavingsGoal } from '../types'
import { useAppData } from '../data/DataProvider'
import { useI18n } from '../lib/i18n'
import { formatMoneyShort, parseAmount } from '../lib/money'
import { monthsInclusive, todayISO } from '../lib/dates'
import { EmptyState, Field, inputCls, Segmented } from '../components/ui'

export function GoalsScreen() {
  const { snapshot, saveSettings } = useAppData()
  const { t, locale, decimalSep } = useI18n()
  const goals = snapshot.settings.goals ?? []

  const [editing, setEditing] = useState<SavingsGoal | 'new' | null>(null)
  const [depositId, setDepositId] = useState<string | null>(null)
  const [depositRaw, setDepositRaw] = useState('')

  const persist = async (next: SavingsGoal[]) => {
    await saveSettings({ ...snapshot.settings, goals: next })
  }

  const deposit = async (goal: SavingsGoal) => {
    const v = parseAmount(depositRaw, decimalSep)
    if (v === null || v === 0) return
    await persist(goals.map((g) => (g.id === goal.id ? { ...g, saved: Math.max(0, g.saved + v) } : g)))
    setDepositId(null)
    setDepositRaw('')
  }

  const remove = async (goal: SavingsGoal) => {
    if (!confirm(t('goalDeleteConfirm'))) return
    await persist(goals.filter((g) => g.id !== goal.id))
    setEditing(null)
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between pt-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('menuGoals')}</h1>
      </header>

      {goals.length === 0 && editing === null ? (
        <EmptyState emoji="🐷" title={t('goalEmptyTitle')} body={t('goalEmptyBody')} />
      ) : (
        <div className="space-y-3">
          {goals.map((g, i) => {
            const ratio = g.target > 0 ? Math.min(1, g.saved / g.target) : 0
            const done = g.saved >= g.target
            const monthsLeft = g.targetDate ? Math.max(1, monthsInclusive(todayISO(), g.targetDate)) : null
            const perMonth = monthsLeft && !done ? (g.target - g.saved) / monthsLeft : null
            return (
              <div
                key={g.id}
                className="anim-rise rounded-3xl border border-line bg-card p-4"
                style={{ animationDelay: `${Math.min(i * 50, 300)}ms` }}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-card2 text-2xl">
                    {g.emoji || '🐷'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold text-ink">{g.name}</p>
                    <p className="num text-[13px] font-semibold text-ink2">
                      {formatMoneyShort(g.saved, g.currency, locale)} / {formatMoneyShort(g.target, g.currency, locale)}
                      <span className="ml-1.5 font-bold text-accent">{Math.round(ratio * 100)}%</span>
                    </p>
                  </div>
                  <button
                    onClick={() => setEditing(g)}
                    aria-label={t('editTitle')}
                    className="press shrink-0 rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-ink2"
                  >
                    ✏️
                  </button>
                </div>

                <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-card2">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${done ? 'bg-good' : 'grad-accent'}`}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="num min-w-0 truncate text-[12px] font-semibold text-ink2">
                    {done
                      ? t('goalDone')
                      : perMonth !== null
                        ? t('goalPerMonth', { v: formatMoneyShort(perMonth, g.currency, locale) })
                        : t('goalRemaining', { v: formatMoneyShort(g.target - g.saved, g.currency, locale) })}
                  </p>
                  {!done && (
                    <button
                      onClick={() => {
                        setDepositId(depositId === g.id ? null : g.id)
                        setDepositRaw('')
                      }}
                      className="press shrink-0 rounded-full border border-accent px-3 py-1.5 text-[12px] font-bold text-accent"
                    >
                      ＋ {t('goalDeposit')}
                    </button>
                  )}
                </div>

                {depositId === g.id && (
                  <div className="anim-rise mt-2 flex items-end gap-2">
                    <input
                      className={`${inputCls} num flex-1`}
                      value={depositRaw}
                      onChange={(e) => setDepositRaw(e.target.value)}
                      inputMode="decimal"
                      placeholder={decimalSep === ',' ? '0,00' : '0.00'}
                      autoFocus
                    />
                    <button
                      onClick={() => deposit(g)}
                      className="press grad-accent shrink-0 rounded-xl px-4 py-3 text-[13px] font-bold text-white"
                    >
                      {t('save')}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editing !== null ? (
        <GoalForm
          goal={editing === 'new' ? null : editing}
          onSave={async (g) => {
            const exists = goals.some((x) => x.id === g.id)
            await persist(exists ? goals.map((x) => (x.id === g.id ? g : x)) : [...goals, g])
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
          ＋ {t('goalNew')}
        </button>
      )}
    </div>
  )
}

function GoalForm({
  goal,
  onSave,
  onDelete,
  onCancel,
}: {
  goal: SavingsGoal | null
  onSave: (g: SavingsGoal) => Promise<void>
  onDelete?: () => void
  onCancel: () => void
}) {
  const { t, decimalSep } = useI18n()
  const [emoji, setEmoji] = useState(goal?.emoji ?? '')
  const [name, setName] = useState(goal?.name ?? '')
  const [targetRaw, setTargetRaw] = useState(goal ? String(goal.target) : '')
  const [currency, setCurrency] = useState<Currency>(goal?.currency ?? 'AUD')
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')
  const [error, setError] = useState('')

  const save = async () => {
    const target = parseAmount(targetRaw, decimalSep)
    if (!name.trim()) return setError(t('fillName'))
    if (target === null || target <= 0) return setError(t('invalidAmount'))
    await onSave({
      id: goal?.id ?? crypto.randomUUID(),
      emoji: emoji.trim(),
      name: name.trim(),
      target,
      currency,
      saved: goal?.saved ?? 0,
      targetDate: targetDate || null,
      createdAt: goal?.createdAt ?? new Date().toISOString(),
    })
  }

  return (
    <div className="anim-rise space-y-3 rounded-3xl border border-line bg-card2 p-4">
      <p className="text-[14px] font-bold text-ink">{goal ? t('editTitle') : t('goalNew')}</p>
      <div className="flex items-end gap-2">
        <label className="block w-16 shrink-0">
          <span className="mb-1.5 block text-[13px] font-semibold text-ink2">{t('categoryEmoji')}</span>
          <input
            className={`${inputCls} text-center`}
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🏖️"
            maxLength={16}
          />
        </label>
        <label className="block min-w-0 flex-1">
          <span className="mb-1.5 block text-[13px] font-semibold text-ink2">{t('name')}</span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('goalNamePlaceholder')}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('goalTarget')}>
          <input
            className={`${inputCls} num`}
            value={targetRaw}
            onChange={(e) => setTargetRaw(e.target.value)}
            inputMode="decimal"
            placeholder={decimalSep === ',' ? '0,00' : '0.00'}
          />
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
      <Field label={t('goalDateLabel')}>
        <input
          type="date"
          className={inputCls}
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </Field>
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
