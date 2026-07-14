import type { Currency } from '../types'

// NBSP keeps the symbol glued to the number so it never wraps mid-value.
const NBSP = '\u00a0'
const SYMBOL: Record<Currency, string> = { AUD: 'A$', BRL: 'R$' }

export function formatMoney(amount: number, currency: Currency, locale: string): string {
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return `${SYMBOL[currency]}${NBSP}${value}`
}

export function formatMoneyShort(amount: number, currency: Currency, locale: string): string {
  const digits = amount % 1 === 0 ? 0 : 2
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount)
  return `${SYMBOL[currency]}${NBSP}${value}`
}

// Accepts "1.234,56", "1234,56", "1.234" (pt) and "1,234.56", "1234.56", "1,234" (en).
// A lone separator followed by exactly 3 digits is ambiguous ("1.234"): the
// locale's decimal separator decides — pt reads it as thousands, en as decimal.
export function parseAmount(raw: string, decimalSep: '.' | ',' = ','): number | null {
  const s = raw.trim().replace(/\s/g, '')
  if (!s) return null
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  const lastSep = Math.max(lastDot, lastComma)
  let intPart = s
  let decPart = ''
  if (lastSep !== -1) {
    const sepChar = s[lastSep]
    const tail = s.slice(lastSep + 1)
    const bothKinds = lastDot !== -1 && lastComma !== -1
    const repeated = s.indexOf(sepChar) !== lastSep
    const isDecimal = bothKinds
      ? true
      : repeated
        ? false
        : tail.length === 3
          ? sepChar === decimalSep
          : tail.length <= 2
    if (isDecimal) {
      intPart = s.slice(0, lastSep)
      decPart = tail
    }
  }
  if (decPart && !/^\d+$/.test(decPart)) return null
  const intDigits = intPart.replace(/[.,]/g, '')
  if (intDigits && !/^\d+$/.test(intDigits)) return null
  const n = Number(`${intDigits || '0'}${decPart ? `.${decPart}` : ''}`)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export const CURRENCY_FLAG: Record<Currency, string> = { AUD: '🇦🇺', BRL: '🇧🇷' }
