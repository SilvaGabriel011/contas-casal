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
