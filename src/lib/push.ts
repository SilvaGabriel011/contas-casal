// Web Push subscription management. The VAPID public key comes from the
// deployment's runtime config endpoint; the private key never leaves Vercel.
// On iOS this only works after the app is added to the Home Screen (16.4+).
import type { SupabaseClient } from '@supabase/supabase-js'
import { logError } from './errors'

export type PushEnableResult = 'ok' | 'denied' | 'unavailable' | 'error'

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    return Boolean(sub)
  } catch {
    return false
  }
}

function urlB64ToUint8(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const base = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base), (c) => c.charCodeAt(0))
}

async function fetchVapidKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/config')
    if (!res.ok) return null
    const cfg = (await res.json()) as { vapidPublicKey?: string }
    return cfg.vapidPublicKey && cfg.vapidPublicKey.length > 20 ? cfg.vapidPublicKey : null
  } catch {
    return null
  }
}

export async function subscribePush(sb: SupabaseClient, userId: string, lang: string): Promise<PushEnableResult> {
  if (!pushSupported()) return 'unavailable'
  try {
    const vapid = await fetchVapidKey()
    if (!vapid) return 'unavailable'
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'denied'
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) return 'unavailable'
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(vapid).buffer as ArrayBuffer,
    })
    const json = sub.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('bad-subscription')
    const { error } = await sb.from('push_subscriptions').upsert({
      endpoint: json.endpoint,
      user_id: userId,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      lang,
    })
    if (error) throw error
    return 'ok'
  } catch (e) {
    logError('push-enable', e)
    return 'error'
  }
}

export async function unsubscribePush(sb: SupabaseClient): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  } catch (e) {
    logError('push-disable', e)
  }
}
