import type { HouseholdSettings, Snapshot } from '../types'
import { ownerLabel } from './owners'
import { categoryLabel } from './categories'
import { todayISO, addDays } from './dates'
import type { TKey } from './i18n'

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

const MAX_CONTEXT_CHARS = 38_000

// Compact, human-readable snapshot the model can reason over. Payments are
// capped to the last ~13 months and trimmed further if the JSON gets huge.
export function buildAiContext(
  snapshot: Snapshot,
  t: (key: TKey) => string
): string {
  const today = todayISO()
  const s: HouseholdSettings = snapshot.settings
  const names = { a: s.nameA, b: s.nameB }

  const items = snapshot.items
    .filter((i) => !i.archived)
    .map((i) => ({
      id: i.id.slice(0, 8),
      name: i.name,
      kind: i.kind,
      category: categoryLabel(i.category, s, t),
      amount: i.amount,
      currency: i.currency,
      frequency: i.frequency,
      owner: ownerLabel(i.owner, s, t),
      startDate: i.startDate,
      ...(i.installmentsTotal ? { installmentsTotal: i.installmentsTotal } : {}),
      ...(i.notes ? { notes: i.notes } : {}),
    }))

  const incomes = snapshot.incomes.map((i) => ({
    name: i.name,
    owner: ownerLabel(i.owner, s, t),
    amountPerCycle: i.amount,
    currency: i.currency,
    frequency: i.frequency,
    nextPayDate: i.nextDate,
    active: i.active,
    ...(i.hourlyRate ? { hourlyRate: i.hourlyRate, hoursPerDay: i.hoursPerDay, daysPerWeek: i.daysPerWeek } : {}),
  }))

  const itemName = new Map(snapshot.items.map((i) => [i.id, i.name]))
  const paymentsFloor = addDays(today, -400)
  let payments = snapshot.payments
    .filter((p) => p.dueDate >= paymentsFloor)
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1))
    .map((p) => ({
      item: itemName.get(p.itemId) ?? p.itemId.slice(0, 8),
      dueDate: p.dueDate,
      paidAt: p.paidAt.slice(0, 10),
      amount: p.amount,
    }))

  const build = () =>
    JSON.stringify({ today, couple: names, items, incomes, payments })

  let out = build()
  while (out.length > MAX_CONTEXT_CHARS && payments.length > 20) {
    payments = payments.slice(0, Math.floor(payments.length / 2))
    out = build()
  }
  return out
}

export type AiError = 'missing-openai-key' | 'unauthorized' | 'invalid-openai-key' | 'unavailable' | 'generic'

export interface QuickDraft {
  type: 'expense' | 'bill' | 'subscription' | 'installment' | 'purchase' | 'income'
  name?: string
  note?: string
  amount: number
  currency: 'AUD' | 'BRL'
  category?: string
  owner?: 'a' | 'b' | 'shared'
  paidBy?: 'a' | 'b'
  date?: string
  frequency?: string
  installmentsTotal?: number
}

const DRAFT_TYPES = new Set(['expense', 'bill', 'subscription', 'installment', 'purchase', 'income'])

export interface QuickAddMeta {
  today: string
  nameA: string
  nameB: string
  categories: string[]
}

export async function parseQuickAdd(
  text: string,
  meta: QuickAddMeta,
  lang: string,
  accessToken: string
): Promise<QuickDraft[]> {
  return requestRecords({ mode: 'parse', text, meta, lang }, accessToken)
}

// Receipt photo (data URL, already downscaled) -> at least the final total.
// An optional note written by the user travels with the image.
export async function parseReceipt(
  imageDataUrl: string,
  meta: QuickAddMeta,
  lang: string,
  accessToken: string,
  note?: string
): Promise<QuickDraft[]> {
  return requestRecords({ mode: 'receipt', image: imageDataUrl, meta, lang, note }, accessToken)
}

// Screenshot ("print") of bills/statements -> full records for the review modal.
// An optional note written by the user travels with the image.
export async function parseScreenshot(
  imageDataUrl: string,
  meta: QuickAddMeta,
  lang: string,
  accessToken: string,
  note?: string
): Promise<QuickDraft[]> {
  return requestRecords({ mode: 'screenshot', image: imageDataUrl, meta, lang, note }, accessToken)
}

// Text extracted from a PDF or CSV bank statement -> full records for the
// review modal.
export async function parseStatement(
  text: string,
  meta: QuickAddMeta,
  lang: string,
  accessToken: string
): Promise<QuickDraft[]> {
  return requestRecords({ mode: 'statement', text, meta, lang }, accessToken)
}

async function requestRecords(body: object, accessToken: string): Promise<QuickDraft[]> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    if (res.status === 404) throw new Error('unavailable' satisfies AiError)
    const code = await res
      .json()
      .then((j) => j?.error)
      .catch(() => null)
    throw new Error((code as AiError) || ('generic' satisfies AiError))
  }
  const data = await res.json()
  const records: unknown[] = Array.isArray(data?.records) ? data.records : []
  return records.filter((r): r is QuickDraft => {
    const d = r as QuickDraft
    return (
      DRAFT_TYPES.has(d?.type) &&
      typeof d.amount === 'number' &&
      Number.isFinite(d.amount) &&
      d.amount > 0 &&
      (d.currency === 'AUD' || d.currency === 'BRL')
    )
  })
}

export async function* streamAiChat(
  messages: AiMessage[],
  context: string,
  lang: string,
  accessToken: string
): AsyncGenerator<string> {
  let res: Response
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ messages, context, lang }),
    })
  } catch {
    throw new Error('unavailable' satisfies AiError)
  }

  if (!res.ok) {
    if (res.status === 404) throw new Error('unavailable' satisfies AiError)
    const code = await res
      .json()
      .then((j) => j?.error)
      .catch(() => null)
    if (code === 'missing-openai-key' || code === 'invalid-openai-key' || code === 'unauthorized') {
      throw new Error(code as AiError)
    }
    throw new Error('generic' satisfies AiError)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('generic' satisfies AiError)
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value, { stream: true })
    if (text) yield text
  }
}
