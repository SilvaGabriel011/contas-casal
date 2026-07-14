// The couple signs in with a 4-digit PIN. Supabase still requires a real
// password, so the PIN is stretched into a strong deterministic one with
// PBKDF2 — same email + same PIN on any device derives the same password.
// The raw PIN never leaves the device.
export async function derivePinPassword(email: string, pin: string): Promise<string> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ])
  const salt = enc.encode(`cc-pin-v1:${email.trim().toLowerCase()}`)
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310_000 },
    keyMaterial,
    256
  )
  const b64 = btoa(String.fromCharCode(...new Uint8Array(bits)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `Cc1.${b64}`
}

export const isValidPin = (pin: string) => /^\d{4}$/.test(pin)
