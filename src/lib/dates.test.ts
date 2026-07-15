import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonthsClamped,
  daysBetween,
  endOfMonth,
  monthsInclusive,
  parseDate,
  startOfMonth,
  toISO,
} from './dates'

describe('parseDate / toISO', () => {
  it('round-trips ISO dates in local time', () => {
    expect(toISO(parseDate('2026-07-14'))).toBe('2026-07-14')
    expect(toISO(parseDate('2026-01-01'))).toBe('2026-01-01')
    expect(toISO(parseDate('2026-12-31'))).toBe('2026-12-31')
  })

  it('parses as local time, not UTC', () => {
    const d = parseDate('2026-07-14')
    expect(d.getDate()).toBe(14)
    expect(d.getHours()).toBe(0)
  })
})

describe('addDays', () => {
  it('adds and subtracts days across month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-07-14', 0)).toBe('2026-07-14')
  })

  it('crosses leap-year February', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01')
  })
})

describe('addMonthsClamped', () => {
  it('keeps the anchor day when it fits', () => {
    expect(addMonthsClamped('2026-01-15', 1)).toBe('2026-02-15')
    expect(addMonthsClamped('2026-01-15', 12)).toBe('2027-01-15')
  })

  it('clamps day-31 anchors to short months without drift', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31')
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30')
  })

  it('handles leap February', () => {
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29')
  })

  it('handles negative offsets', () => {
    expect(addMonthsClamped('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonthsClamped('2026-01-15', -1)).toBe('2025-12-15')
  })

  it('crosses year boundaries', () => {
    expect(addMonthsClamped('2026-11-30', 3)).toBe('2027-02-28')
  })
})

describe('daysBetween', () => {
  it('computes signed day differences', () => {
    expect(daysBetween('2026-07-14', '2026-07-21')).toBe(7)
    expect(daysBetween('2026-07-21', '2026-07-14')).toBe(-7)
    expect(daysBetween('2026-07-14', '2026-07-14')).toBe(0)
  })

  it('is exact across DST-length months', () => {
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364)
    expect(daysBetween('2026-04-01', '2026-04-06')).toBe(5)
    expect(daysBetween('2026-10-01', '2026-10-05')).toBe(4)
  })
})

describe('monthsInclusive', () => {
  it('counts instalments from first month through last month', () => {
    expect(monthsInclusive('2026-07-15', '2026-10')).toBe(4)
    expect(monthsInclusive('2026-07-15', '2026-07')).toBe(1)
    expect(monthsInclusive('2026-07', '2026-10')).toBe(4)
  })

  it('crosses year boundaries', () => {
    expect(monthsInclusive('2026-11-05', '2027-02')).toBe(4)
    expect(monthsInclusive('2026-01-01', '2027-01')).toBe(13)
  })

  it('goes non-positive when the end month is before the start', () => {
    expect(monthsInclusive('2026-10-01', '2026-09')).toBe(0)
    expect(monthsInclusive('2026-10-01', '2026-07')).toBe(-2)
  })
})

describe('month helpers', () => {
  it('startOfMonth / endOfMonth', () => {
    expect(startOfMonth('2026-07-14')).toBe('2026-07-01')
    expect(endOfMonth('2026-07-14')).toBe('2026-07-31')
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28')
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29')
  })
})
