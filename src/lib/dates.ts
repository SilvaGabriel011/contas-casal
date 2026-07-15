// All dates are local-time 'YYYY-MM-DD' strings. Never new Date('YYYY-MM-DD') — that parses as UTC.

const pad = (n: number) => String(n).padStart(2, '0')

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayISO(): string {
  return toISO(new Date())
}

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

// Month arithmetic is always computed from the anchor date so a day-31 anchor
// clamps to short months without drifting (Jan 31 → Feb 28 → Mar 31).
export function addMonthsClamped(iso: string, n: number): string {
  const [y, m, day] = iso.split('-').map(Number)
  const total = m - 1 + n
  const ny = y + Math.floor(total / 12)
  const nm = ((total % 12) + 12) % 12
  const lastDay = new Date(ny, nm + 1, 0).getDate()
  return toISO(new Date(ny, nm, Math.min(day, lastDay)))
}

// Whole months from the month of `from` through the month of `to`, inclusive.
// Accepts 'YYYY-MM' or 'YYYY-MM-DD' on either side (days are ignored).
// "1st instalment in July, last in October" -> 4.
export function monthsInclusive(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm) + 1
}

export function daysBetween(fromISO: string, toISOStr: string): number {
  const ms = parseDate(toISOStr).getTime() - parseDate(fromISO).getTime()
  return Math.round(ms / 86_400_000)
}


export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function endOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return toISO(new Date(y, m, 0))
}
