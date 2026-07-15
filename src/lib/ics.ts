import type { Item } from '../types'
import { occurrenceDates } from './schedule'
import { addDays, todayISO } from './dates'

// Reminders land on the DAY BEFORE each due date as all-day events with a
// 9am alarm ("pay X tomorrow"). Discrete VEVENTs (no RRULE) so month-end
// clamping matches the app's schedule math exactly.

const HORIZON_DAYS = 400
const MAX_EVENTS_PER_ITEM = 26

const fmtDate = (iso: string) => iso.replaceAll('-', '')

const escapeText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

export interface IcsOptions {
  // Skip specific occurrences (e.g. already-paid future due dates in the feed).
  skip?: (item: Item, dueDate: string) => boolean
  // Marks the output as a subscribable feed with a display name + refresh hints.
  feedName?: string
}

export function buildRemindersIcs(
  items: Item[],
  titleFor: (item: Item, dueDate: string) => string,
  bodyFor: (item: Item, dueDate: string) => string,
  opts: IcsOptions = {}
): string {
  const today = todayISO()
  const dtstamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
  const events: string[] = []

  for (const item of items) {
    const occs = occurrenceDates(item, today, addDays(today, HORIZON_DAYS)).slice(0, MAX_EVENTS_PER_ITEM)
    for (const { date } of occs) {
      if (opts.skip?.(item, date)) continue
      const title = escapeText(titleFor(item, date))
      events.push(
        [
          'BEGIN:VEVENT',
          `UID:cc-${item.id}-${date}@contas-casal`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART;VALUE=DATE:${fmtDate(addDays(date, -1))}`,
          `SUMMARY:${title}`,
          `DESCRIPTION:${escapeText(bodyFor(item, date))}`,
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${title}`,
          'TRIGGER:PT9H',
          'END:VALARM',
          'END:VEVENT',
        ].join('\r\n')
      )
    }
  }

  const feedHeaders = opts.feedName
    ? [
        `X-WR-CALNAME:${escapeText(opts.feedName)}`,
        'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
        'X-PUBLISHED-TTL:PT6H',
      ]
    : []

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Contas do Casal//PT',
    'CALSCALE:GREGORIAN',
    ...feedHeaders,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')
}

export function icsEventCount(ics: string): number {
  return ics.split('BEGIN:VEVENT').length - 1
}

// iOS standalone PWAs handle the share sheet far better than downloads:
// sharing a .ics offers "Add to Calendar" directly.
export async function shareIcs(filename: string, content: string): Promise<void> {
  const file = new File([content], filename, { type: 'text/calendar' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
