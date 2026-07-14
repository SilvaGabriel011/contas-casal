import type { Currency, Frequency, ItemKind } from '../types'
import type { TKey } from './i18n'

export interface KindConfig {
  emoji: string
  labelKey: TKey
  hintKey: TKey
  defaultCategory: string
  presetCurrency?: Currency
  forcedFrequency: Frequency | null
  dateLabelKey: TKey
  amountLabelKey: TKey
}

export const KIND_CONFIG: Record<ItemKind, KindConfig> = {
  bill: {
    emoji: '🧾',
    labelKey: 'bill',
    hintKey: 'kindBillHint',
    defaultCategory: 'rent',
    forcedFrequency: null,
    dateLabelKey: 'firstDue',
    amountLabelKey: 'amount',
  },
  subscription: {
    emoji: '🔁',
    labelKey: 'subscription',
    hintKey: 'kindSubHint',
    defaultCategory: 'streaming',
    forcedFrequency: null,
    dateLabelKey: 'firstDue',
    amountLabelKey: 'amount',
  },
  installment: {
    emoji: '💳',
    labelKey: 'installment',
    hintKey: 'kindInstHint',
    defaultCategory: 'card',
    presetCurrency: 'BRL',
    forcedFrequency: 'monthly',
    dateLabelKey: 'firstDue',
    amountLabelKey: 'installmentAmount',
  },
  purchase: {
    emoji: '🛍️',
    labelKey: 'purchase',
    hintKey: 'kindPurchaseHint',
    defaultCategory: 'shopping',
    forcedFrequency: 'once',
    dateLabelKey: 'purchaseDate',
    amountLabelKey: 'amount',
  },
}

export const ITEM_KINDS = Object.keys(KIND_CONFIG) as ItemKind[]

export const FREQ_EVERY: Record<Frequency, TKey> = {
  weekly: 'everyWeek',
  fortnightly: 'everyFortnight',
  monthly: 'everyMonth',
  yearly: 'everyYear',
  once: 'oneOff',
}
