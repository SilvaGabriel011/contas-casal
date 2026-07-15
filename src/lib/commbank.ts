// CommBank CSV reconciliation: parse the exported statement, then match each
// debit against the couple's bills and recorded expenses so paying/recording
// becomes one tap instead of typing.
import type { Expense, Occurrence } from '../types'
import { daysBetween } from './dates'

export interface BankTx {
  date: string // ISO
  amount: number // signed: debits negative
  description: string
}

// CommBank exports have no header by default ("14/07/2026","-12.50","DESC","+1,234.56"),
// but exports from NetBank sometimes include one. Both are handled.
export function parseCommBankCsv(text: string): BankTx[] {
  const out: BankTx[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const fields = splitCsvLine(line)
    if (fields.length < 3) continue
    const date = parseAuDate(fields[0])
    const amount = parseSignedAmount(fields[1])
    if (!date || amount === null) continue // header or malformed line
    out.push({ date, amount, description: fields[2].trim() })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      fields.push(cur)
      cur = ''
    } else cur += ch
  }
  fields.push(cur)
  return fields
}

function parseAuDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseSignedAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/[+$,\s]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  return Number(cleaned)
}

// "PURCHASE AT WOOLWORTHS 1234 SYDNEY NS AUS Card xx1234" -> "Woolworths 1234 Sydney"
export function cleanDescription(desc: string): string {
  let s = desc
    .replace(/\b(PURCHASE AT|EFTPOS|VISA-|DEBIT CARD PURCHASE|DIRECT DEBIT|PAYPAL \*)\s*/gi, '')
    .replace(/\bCard\s+xx\d+\b.*$/i, '')
    .replace(/\bValue Date:.*$/i, '')
    .replace(/\b(AUS?|NSW?|VIC|QLD|WA|SA|TAS|NT|ACT)\b\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (s === s.toUpperCase()) {
    s = s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase())
  }
  return s.slice(0, 48) || desc.slice(0, 48)
}

const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/woolworths|coles|aldi|iga\b|foodworks|harris farm/i, 'groceries'],
  [/uber(?!\s*eats)|didi|ola\b|opal|translink|myki|transport/i, 'transport'],
  [/uber\s*eats|menulog|doordash|deliveroo|mcdonald|kfc|hungry jack|domino|subway|cafe|coffee|restaurant|sushi|kebab|bakery/i, 'food'],
  [/chemist|pharmacy|priceline|medical|dental|doctor/i, 'health'],
  [/telstra|optus|vodafone|amaysim|boost mobile|belong/i, 'phone'],
  [/netflix|spotify|disney|stan\b|binge|youtube|apple\.com\/bill|prime video|paramount/i, 'streaming'],
  [/agl|origin energy|energyaustralia|red energy|sydney water|urban utilities/i, 'utilities'],
  [/nbn|aussie broadband|tpg|iinet|superloop/i, 'internet'],
  [/bp\b|shell|caltex|ampol|7-eleven fuel|petrol|nrma|linkt|e-toll/i, 'car'],
  [/kmart|target|big w|bunnings|ikea|amazon|ebay|myer/i, 'shopping'],
  [/anytime fitness|fitness first|f45|gym|plus fitness/i, 'gym'],
  [/petbarn|petstock|vet\b/i, 'pet'],
  [/rent|realestate|real estate|ray white|lj hooker/i, 'rent'],
]

export function guessCategory(description: string): string {
  for (const [re, cat] of CATEGORY_KEYWORDS) if (re.test(description)) return cat
  return 'other'
}

export interface ReconcileResult {
  billMatches: { tx: BankTx; occ: Occurrence }[]
  newExpenses: { tx: BankTx; category: string; note: string }[]
  alreadyRecorded: BankTx[]
  credits: BankTx[]
}

const AMOUNT_TOLERANCE = 0.011
const BILL_DAY_WINDOW = 4
const EXPENSE_DAY_WINDOW = 2

// Occurrences must be UNPAID AUD occurrences covering the statement window.
export function reconcile(txs: BankTx[], occurrences: Occurrence[], expenses: Expense[]): ReconcileResult {
  const result: ReconcileResult = { billMatches: [], newExpenses: [], alreadyRecorded: [], credits: [] }
  const usedOccs = new Set<string>()
  const audExpenses = expenses.filter((e) => e.currency === 'AUD')

  for (const tx of txs) {
    if (tx.amount >= 0) {
      result.credits.push(tx)
      continue
    }
    const value = -tx.amount

    let best: { occ: Occurrence; dist: number } | null = null
    for (const occ of occurrences) {
      const key = `${occ.item.id}|${occ.dueDate}`
      if (usedOccs.has(key) || occ.payment || occ.item.currency !== 'AUD') continue
      if (Math.abs(occ.item.amount - value) > AMOUNT_TOLERANCE) continue
      const dist = Math.abs(daysBetween(occ.dueDate, tx.date))
      if (dist > BILL_DAY_WINDOW) continue
      if (!best || dist < best.dist) best = { occ, dist }
    }
    if (best) {
      usedOccs.add(`${best.occ.item.id}|${best.occ.dueDate}`)
      result.billMatches.push({ tx, occ: best.occ })
      continue
    }

    const recorded = audExpenses.some(
      (e) => Math.abs(e.amount - value) <= AMOUNT_TOLERANCE && Math.abs(daysBetween(e.date, tx.date)) <= EXPENSE_DAY_WINDOW
    )
    if (recorded) {
      result.alreadyRecorded.push(tx)
      continue
    }

    result.newExpenses.push({ tx, category: guessCategory(tx.description), note: cleanDescription(tx.description) })
  }
  return result
}
