import { describe, expect, it } from 'vitest'
import { formatMoney, formatMoneyShort, parseAmount } from './money'

describe('parseAmount — pt-BR (decimal comma)', () => {
  const pt = (s: string) => parseAmount(s, ',')

  it('parses plain and comma-decimal values', () => {
    expect(pt('620')).toBe(620)
    expect(pt('0,5')).toBe(0.5)
    expect(pt('1234,56')).toBe(1234.56)
  })

  it('reads a lone dot with 3 digits as thousands', () => {
    expect(pt('1.234')).toBe(1234)
    expect(pt('12.500')).toBe(12500)
    expect(pt('12.345.678')).toBe(12345678)
  })

  it('parses the full pt-BR format', () => {
    expect(pt('1.234,56')).toBe(1234.56)
  })

  it('tolerates dot-decimal input from other keyboards', () => {
    expect(pt('1234.56')).toBe(1234.56)
    expect(pt('12.5')).toBe(12.5)
  })

  it('rejects garbage and negatives', () => {
    expect(pt('')).toBeNull()
    expect(pt('abc')).toBeNull()
    expect(pt('1,2a')).toBeNull()
    expect(pt('-5')).toBeNull()
  })

  it('accepts a trailing separator as integer', () => {
    expect(pt('1234,')).toBe(1234)
  })
})

describe('parseAmount — en (decimal dot)', () => {
  const en = (s: string) => parseAmount(s, '.')

  it('parses plain and dot-decimal values', () => {
    expect(en('620')).toBe(620)
    expect(en('0.5')).toBe(0.5)
    expect(en('1234.56')).toBe(1234.56)
  })

  it('reads a lone comma with 3 digits as thousands', () => {
    expect(en('1,234')).toBe(1234)
  })

  it('parses the full en format', () => {
    expect(en('1,234.56')).toBe(1234.56)
  })

  it('reads a lone dot with 3 digits as decimal (locale rules)', () => {
    expect(en('1.234')).toBe(1.234)
  })
})

describe('formatMoney', () => {
  const NBSP = '\u00a0'

  it('prefixes the currency symbol with locale digits (NBSP-joined)', () => {
    expect(formatMoney(1234.5, 'AUD', 'en-AU')).toBe(`A$${NBSP}1,234.50`)
    expect(formatMoney(1234.5, 'BRL', 'pt-BR')).toBe(`R$${NBSP}1.234,50`)
  })

  it('short format drops cents only for whole numbers', () => {
    expect(formatMoneyShort(620, 'AUD', 'en-AU')).toBe(`A$${NBSP}620`)
    expect(formatMoneyShort(620.5, 'AUD', 'en-AU')).toBe(`A$${NBSP}620.50`)
  })
})
