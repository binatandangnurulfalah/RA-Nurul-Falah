export type PasswordLinkType = 'invite' | 'recovery'

export type EmailAuthLink = {
  type: PasswordLinkType
  accessToken: string
  refreshToken: string
}

export type EmailAuthLinkError = {
  message: string
}

const DEFAULT_AUTH_REDIRECT_URL = 'https://binatandangnurulfalah.github.io/RA-Nurul-Falah/'

export function authRedirectUrl(flow?: PasswordLinkType) {
  const configured = String(import.meta.env.VITE_AUTH_REDIRECT_URL ?? '').trim()
  const fallback = new URL(DEFAULT_AUTH_REDIRECT_URL)

  try {
    const url = configured ? new URL(configured) : fallback
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      return DEFAULT_AUTH_REDIRECT_URL
    }
    if (flow) url.searchParams.set('auth_flow', flow)
    return url.toString()
  } catch {
    if (flow) fallback.searchParams.set('auth_flow', flow)
    return fallback.toString()
  }
}

export function readEmailAuthLink(hash = window.location.hash, search = window.location.search): EmailAuthLink | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(fragment)
  const query = new URLSearchParams(search)
  const type = params.get('type') ?? query.get('auth_flow')
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')

  if ((type !== 'invite' && type !== 'recovery') || !accessToken || !refreshToken) return null
  return { type, accessToken, refreshToken }
}

export function readEmailAuthLinkError(hash = window.location.hash): EmailAuthLinkError | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(fragment)
  if (!params.get('error') && !params.get('error_code')) return null
  return { message: params.get('error_description') ?? 'Tautan email tidak valid atau sudah kedaluwarsa.' }
}

export function clearEmailAuthLink() {
  const cleanUrl = new URL(window.location.href)
  cleanUrl.hash = ''
  cleanUrl.searchParams.delete('auth_flow')
  window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search)
}
