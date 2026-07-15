// App lock via the platform authenticator (Face ID / Touch ID through
// WebAuthn). This is a per-device convenience gate, not cryptographic access
// control — the credential never leaves the device and nothing is verified
// server-side.
import { logError } from './errors'

const KEY = 'cc.applock.v1'

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export function isLockEnabled(): boolean {
  return Boolean(localStorage.getItem(KEY))
}

export function disableLock() {
  localStorage.removeItem(KEY)
}

export async function lockAvailable(): Promise<boolean> {
  try {
    return (
      'PublicKeyCredential' in window &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    )
  } catch {
    return false
  }
}

export async function enableLock(): Promise<boolean> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Contas do Casal', id: location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'casal',
          displayName: 'Contas do Casal',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged',
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null
    if (!cred) return false
    localStorage.setItem(KEY, b64(cred.rawId))
    return true
  } catch (e) {
    logError('applock-enable', e)
    return false
  }
}

export async function unlock(): Promise<boolean> {
  const stored = localStorage.getItem(KEY)
  if (!stored) return true
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: unb64(stored) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return assertion !== null
  } catch (e) {
    logError('applock-unlock', e)
    return false
  }
}
