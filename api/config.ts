// Vercel Edge Function: serves the Supabase connection config at runtime so
// the app works even when the static build was made before the env vars were
// saved, and tolerates common env-var naming variations. The anon key is
// public by design — RLS is the security boundary.
export const config = { runtime: 'edge' }

declare const process: { env: Record<string, string | undefined> }

const URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/

export default function handler(): Response {
  const env = process.env
  const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '')
  const anonKey = (
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.SUPABASE_KEY ||
    ''
  ).trim()

  if (!URL_RE.test(url) || anonKey.length < 20) {
    return new Response(JSON.stringify({ error: 'not-configured' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ url, anonKey }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  })
}
