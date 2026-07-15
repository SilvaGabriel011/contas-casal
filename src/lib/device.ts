// Which of the two partners uses THIS device (per-device, not synced).
// Used to stamp who actually paid a bill/expense for the settle-up math.
const KEY = 'cc.device-owner'

export function getDeviceOwner(): 'a' | 'b' | null {
  const v = localStorage.getItem(KEY)
  return v === 'a' || v === 'b' ? v : null
}

export function setDeviceOwner(owner: 'a' | 'b' | null) {
  if (owner) localStorage.setItem(KEY, owner)
  else localStorage.removeItem(KEY)
}

// Email is identity, not a secret: remember it per device after the first
// successful sign-in so future logins are PIN-only.
const EMAIL_KEY = 'cc.last-email'

export function getSavedEmail(): string | null {
  const v = localStorage.getItem(EMAIL_KEY)
  return v && v.includes('@') ? v : null
}

export function setSavedEmail(email: string) {
  localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase())
}

export function clearSavedEmail() {
  localStorage.removeItem(EMAIL_KEY)
}
