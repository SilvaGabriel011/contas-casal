import type { Currency } from '../types'

const SYMBOL: Record<Currency, string> = { AUD: 'A$', BRL: 'R$' }

export function formatMoney(amount: number, currency: Currency, locale: string): string {
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return `${SYMBOL[currency]} ${value}`
}

export function formatMoneyShort(amount: number, currency: Currency, locale: string): string {
  const digits = amount % 1 === 0 ? 0 : 2
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount)
  return `${SYMBOL[currency]} ${value}`
}

// Accepts both "1.234,56" (pt-BR) and "1,234.56" (en) styles.
export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '')
  if (!s) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let normalized: string
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, '').replace(',', '.')
  } else {
    normalized = s.replace(/,/g, '')
  }
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export const CURRENCY_FLAG: Record<Currency, string> = { AUD: '🇦🇺', BRL: '🇧🇷' }
