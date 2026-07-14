export type AppMode = 'demo' | 'cloud'

export interface CloudConfig {
  url: string
  anonKey: string
}

const MODE_KEY = 'cc.mode'
const CLOUD_KEY = 'cc.cloud'

// Keys can also be baked in at build time (Vercel env vars / GitHub secrets).
const ENV_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ENV_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export function getMode(): AppMode | null {
  const m = localStorage.getItem(MODE_KEY)
  return m === 'demo' || m === 'cloud' ? m : null
}

export function setMode(mode: AppMode | null) {
  if (mode) localStorage.setItem(MODE_KEY, mode)
  else localStorage.removeItem(MODE_KEY)
}

// Re-validated on every read so a poisoned localStorage entry can never point
// the client at a non-Supabase or non-HTTPS host.
export const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/

export function getCloudConfig(): CloudConfig | null {
  if (ENV_URL && ENV_KEY) return { url: ENV_URL, anonKey: ENV_KEY }
  try {
    const raw = localStorage.getItem(CLOUD_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      typeof parsed.url === 'string' &&
      SUPABASE_URL_RE.test(parsed.url) &&
      typeof parsed.anonKey === 'string'
    ) {
      return parsed
    }
  } catch {
    /* corrupted config falls through to null */
  }
  return null
}

export function hasBakedCloudConfig(): boolean {
  return Boolean(ENV_URL && ENV_KEY)
}

export function saveCloudConfig(cfg: CloudConfig) {
  localStorage.setItem(CLOUD_KEY, JSON.stringify(cfg))
}

