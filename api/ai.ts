// Vercel Edge Function: the couple's finance AI assistant.
// The OpenAI key lives only here (env OPENAI_API_KEY, no VITE_ prefix, so it
// is never bundled into the browser). Callers must present a valid Supabase
// session token — the endpoint is useless to anyone who isn't signed in.
export const config = { runtime: 'edge' }

declare const process: { env: Record<string, string | undefined> }

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const MAX_MESSAGES = 12
const MAX_MESSAGE_CHARS = 24_000
const MAX_CONTEXT_CHARS = 40_000

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function systemPrompt(context: string, lang: string): string {
  const language = lang === 'pt' ? 'Brazilian Portuguese' : 'English'
  return [
    'You are the built-in finance assistant of "Contas do Casal", a personal finance app used by a couple living in Australia with bills in AUD and in BRL (Brazil).',
    'The two currencies are tracked separately and must never be summed together or converted unless the user explicitly asks and provides a rate.',
    'You receive a JSON snapshot of their real data below: recurring bills, subscriptions, BR card installment plans, one-off purchases, incomes (some hourly-based) and payment history.',
    'Help with: monthly/period reports, spending breakdowns by category or person, upcoming obligations, savings suggestions, and preparing figures for the Australian tax return (the Australian financial year runs 1 July to 30 June; income tax is filed with the ATO, and work-related deductions need records).',
    'When the user pastes bank-statement CSV data (e.g. CommBank exports), parse it, categorize transactions sensibly, flag anything unusual, and reconcile against the bills in the snapshot when possible.',
    'You are not a licensed tax agent — for tax questions, provide organized figures and general ATO guidance, and recommend confirming specifics with an accountant.',
    `Answer in ${language}. Be concise and concrete: totals first, then the breakdown. Use plain text with short lines and simple lists (no markdown tables).`,
    'Money formatting: A$ 1,234.56 for AUD and R$ 1.234,56 for BRL.',
    '',
    'DATA SNAPSHOT (JSON):',
    context,
  ].join('\n')
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonError(405, 'method-not-allowed')

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return jsonError(501, 'missing-openai-key')

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return jsonError(501, 'missing-supabase-config')

  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return jsonError(401, 'unauthorized')
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { authorization: authHeader, apikey: anonKey },
  })
  if (!userRes.ok) return jsonError(401, 'unauthorized')

  let body: {
    messages?: ChatMessage[]
    context?: string
    lang?: string
    mode?: string
    text?: string
    image?: string
    images?: string[]
    meta?: { today?: string; nameA?: string; nameB?: string; categories?: string[] }
  }
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'bad-request')
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  // Receipt scan: photo of a purchase receipt -> at least the final total.
  if (body.mode === 'receipt') {
    const image = String(body.image ?? '')
    if (!image.startsWith('data:image/') || image.length > 2_500_000) return jsonError(400, 'bad-request')
    const meta = body.meta ?? {}
    const receiptSystem = [
      'You read photos of purchase receipts for a household finance app and output strict JSON.',
      `Today is ${meta.today ?? 'unknown'}. Valid category ids: ${(meta.categories ?? []).join(', ')}.`,
      'Output ONLY: {"records":[{"type":"expense","note":string,"amount":number,"currency":"AUD"|"BRL","category":string?,"date":"YYYY-MM-DD"?}]}',
      'amount = the receipt TOTAL actually charged (after discounts, including tax/GST).',
      'currency: R$ or Brazilian layout -> BRL; otherwise AUD.',
      'note = short merchant name. date = the purchase date printed on the receipt if legible, else omit.',
      'category = best guess from the merchant (e.g. supermarket -> groceries, restaurant/cafe -> food, pharmacy -> health).',
      'One record per receipt in the photo (usually one). If no total is readable, return {"records":[]}. Never invent an amount.',
    ].join('\n')

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: receiptSystem },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the total from this receipt.' },
              { type: 'image_url', image_url: { url: image, detail: 'high' } },
            ],
          },
        ],
      }),
    })
    if (!res.ok) {
      return jsonError(502, res.status === 401 ? 'invalid-openai-key' : 'upstream-error')
    }
    const data = await res.json()
    const raw = data?.choices?.[0]?.message?.content ?? '{}'
    try {
      const parsed = JSON.parse(raw)
      return new Response(JSON.stringify({ records: Array.isArray(parsed.records) ? parsed.records : [] }), {
        headers: { 'content-type': 'application/json' },
      })
    } catch {
      return jsonError(502, 'upstream-error')
    }
  }

  // Screenshot ("print") of bills, statements or app screens -> full records
  // the user reviews in a summary modal before confirming.
  if (body.mode === 'screenshot') {
    // One or many prints in a single call — one OpenAI request sees them all,
    // so overlapping shots can be deduplicated by the model.
    const images = (Array.isArray(body.images) ? body.images : [body.image ?? '']).map(String)
    if (images.length === 0 || images.length > 6) return jsonError(400, 'bad-request')
    let totalSize = 0
    for (const img of images) {
      if (!img.startsWith('data:image/') || img.length > 2_500_000) return jsonError(400, 'bad-request')
      totalSize += img.length
    }
    if (totalSize > 4_000_000) return jsonError(400, 'bad-request')
    const meta = body.meta ?? {}
    const screenshotSystem = [
      'You read screenshots ("prints") of financial content — bank/app statements, utility bills, invoices, card faturas, bill lists, spreadsheets or chat messages — for a household finance app used by a couple, and output strict JSON.',
      `Today is ${meta.today ?? 'unknown'}. Partner A is "${meta.nameA ?? 'A'}", partner B is "${meta.nameB ?? 'B'}".`,
      `Valid category ids: ${(meta.categories ?? []).join(', ')}.`,
      'Output ONLY a JSON object: {"records":[...]}. Each record:',
      '{"type":"expense"|"bill"|"subscription"|"installment"|"purchase"|"income","name":string?,"note":string?,"amount":number,"currency":"AUD"|"BRL","category":string?,"owner":"a"|"b"|"shared"?,"paidBy":"a"|"b"?,"date":"YYYY-MM-DD"?,"frequency":"weekly"|"fortnightly"|"monthly"|"yearly"|"once"?,"installmentsTotal":number?}',
      'One record per distinct charge, bill or line visible. Recurring obligations (rent, utilities, plans, streaming) -> bill or subscription with frequency and next due date. Brazilian card instalment lines (e.g. "3/10") -> installment with the per-instalment amount and installmentsTotal = the total count. Day-to-day money already spent -> expense (note = short description). Salary/pay lines -> income.',
      'currency: "R$" or Brazilian number formatting (1.234,56) -> BRL; "$"/"A$" or Australian context -> AUD.',
      'Dates: resolve to YYYY-MM-DD; a date without a year means its closest plausible occurrence; omit the date if unreadable.',
      'name = short readable name (merchant or bill). category = best guess from the valid ids.',
      'Read only what is visible — never invent amounts. Skip subtotal/total lines that just sum the other entries. If nothing extractable: {"records":[]}.',
      'There may be several screenshots: extract from all of them, and if the same entry appears in more than one (overlapping shots of the same list), output it only once.',
    ].join('\n')

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: screenshotSystem },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract every finance record from these screenshots.' },
              ...images.map((img) => ({ type: 'image_url', image_url: { url: img, detail: 'high' } })),
            ],
          },
        ],
      }),
    })
    if (!res.ok) {
      return jsonError(502, res.status === 401 ? 'invalid-openai-key' : 'upstream-error')
    }
    const data = await res.json()
    const raw = data?.choices?.[0]?.message?.content ?? '{}'
    try {
      const parsed = JSON.parse(raw)
      return new Response(JSON.stringify({ records: Array.isArray(parsed.records) ? parsed.records : [] }), {
        headers: { 'content-type': 'application/json' },
      })
    } catch {
      return jsonError(502, 'upstream-error')
    }
  }

  // Quick-add: turn a casual sentence into structured finance records.
  if (body.mode === 'parse') {
    const text = String(body.text ?? '').slice(0, 2000)
    if (!text.trim()) return jsonError(400, 'bad-request')
    const meta = body.meta ?? {}
    const parseSystem = [
      'You convert casual Portuguese or English descriptions of household finance records into strict JSON.',
      `Today is ${meta.today ?? 'unknown'}. Partner A is "${meta.nameA ?? 'A'}", partner B is "${meta.nameB ?? 'B'}".`,
      `Valid category ids: ${(meta.categories ?? []).join(', ')}.`,
      'Output ONLY a JSON object: {"records":[...]}. Each record:',
      '{"type":"expense"|"bill"|"subscription"|"installment"|"purchase"|"income","name":string?,"note":string?,"amount":number,"currency":"AUD"|"BRL","category":string?,"owner":"a"|"b"|"shared"?,"paidBy":"a"|"b"?,"date":"YYYY-MM-DD"?,"frequency":"weekly"|"fortnightly"|"monthly"|"yearly"|"once"?,"installmentsTotal":number?}',
      'Rules: money already spent day-to-day -> expense (note = short description). Recurring obligations -> bill or subscription with frequency and first due date. Brazilian card instalment purchases -> installment with amount per instalment and installmentsTotal. One-off planned purchases -> purchase. Salaries/wages -> income (amount per pay cycle).',
      'If the user gives when the instalments END instead of a count ("parcelas até outubro", "paying until March 2027"), set installmentsTotal to the number of monthly payments from the first payment month (date, or today if absent) through that month, inclusive; a bare month name means its next occurrence.',
      'currency: "R$", "reais", "conta do Brasil" -> BRL; default AUD. owner default "shared"; if a partner is named, map to a/b. paidBy only for expenses when the payer is explicit.',
      'Relative dates ("ontem", "sexta", "dia 15") resolve against today. If nothing extractable: {"records":[]}.',
    ].join('\n')

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: parseSystem },
          { role: 'user', content: text },
        ],
      }),
    })
    if (!res.ok) {
      return jsonError(502, res.status === 401 ? 'invalid-openai-key' : 'upstream-error')
    }
    const data = await res.json()
    const raw = data?.choices?.[0]?.message?.content ?? '{}'
    try {
      const parsed = JSON.parse(raw)
      return new Response(JSON.stringify({ records: Array.isArray(parsed.records) ? parsed.records : [] }), {
        headers: { 'content-type': 'application/json' },
      })
    } catch {
      return jsonError(502, 'upstream-error')
    }
  }

  const messages = (body.messages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
  if (messages.length === 0) return jsonError(400, 'bad-request')

  const context = String(body.context ?? '{}').slice(0, MAX_CONTEXT_CHARS)
  const lang = body.lang === 'pt' ? 'pt' : 'en'

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: 'system', content: systemPrompt(context, lang) }, ...messages],
    }),
  })

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '')
    console.error('openai error', upstream.status, detail.slice(0, 500))
    return jsonError(502, upstream.status === 401 ? 'invalid-openai-key' : 'upstream-error')
  }

  // Re-emit OpenAI's SSE stream as plain text chunks.
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  const textStream = upstream.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const data = line.startsWith('data: ') ? line.slice(6).trim() : null
          if (!data || data === '[DONE]') continue
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content
            if (delta) controller.enqueue(encoder.encode(delta))
          } catch {
            /* partial or non-JSON keepalive line — skip */
          }
        }
      },
    })
  )

  return new Response(textStream, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}
