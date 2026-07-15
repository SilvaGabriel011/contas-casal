// AUD→BRL spot rate from the free, keyless Frankfurter API (ECB data).
// Cached on-device for 3 hours; the previous cached value powers the trend arrow.
const KEY = 'cc.fx.audbrl'
const TTL_MS = 3 * 60 * 60 * 1000

export interface FxInfo {
  rate: number
  prevRate: number | null
  fetchedAt: number
}

export async function getAudBrl(): Promise<FxInfo | null> {
  let cached: FxInfo | null = null
  try {
    cached = JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    /* ignore */
  }
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached

  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=AUD&symbols=BRL')
    if (!res.ok) return cached
    const data = await res.json()
    const rate = Number(data?.rates?.BRL)
    if (!Number.isFinite(rate) || rate <= 0) return cached
    const info: FxInfo = {
      rate,
      prevRate: cached && cached.rate !== rate ? cached.rate : (cached?.prevRate ?? null),
      fetchedAt: Date.now(),
    }
    localStorage.setItem(KEY, JSON.stringify(info))
    return info
  } catch {
    return cached
  }
}
