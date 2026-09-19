export type PasswordLinkType = 'invite' | 'recovery'

export type EmailAuthLink = {
  type: PasswordLinkType
  accessToken: string
  refreshToken: string
}

const DEFAULT_AUTH_REDIRECT_URL = 'https://binatandangnurulfalah.github.io/RA-Nurul-Falah/'

export function authRedirectUrl() {
  const configured = String(import.meta.env.VITE_AUTH_REDIRECT_URL ?? '').trim()
  if (!configured) return DEFAULT_AUTH_REDIRECT_URL

  try {
    const url = new URL(configured)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      return DEFAULT_AUTH_REDIRECT_URL
    }
    return url.toString()
  } catch {
    return DEFAULT_AUTH_REDIRECT_URL
  }
}

export function readEmailAuthLink(hash = window.location.hash): EmailAuthLink | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(fragment)
  const type = params.get('type')
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')

  if ((type !== 'invite' && type !== 'recovery') || !accessToken || !refreshToken) return null
  return { type, accessToken, refreshToken }
}

export function clearEmailAuthLink() {
  const cleanUrl = new URL(window.location.href)
  cleanUrl.hash = ''
  window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search)
}
