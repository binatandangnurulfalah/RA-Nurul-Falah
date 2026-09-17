export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function normalizeQrToken(value: unknown) {
  const raw = String(value ?? '').trim()
  return raw.startsWith('RA-NF:') ? raw.slice(6) : raw
}

export function toJakartaIso(date: string, time: string | null) {
  if (!time) return null
  const normalized = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time
  const value = new Date(`${date}T${normalized}+07:00`)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}

export function createTemporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const body = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `Nf!${body}`
}
