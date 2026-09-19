export type PasswordLinkType = 'invite' | 'recovery'

export type EmailAuthLink = {
  type: PasswordLinkType
  accessToken: string
  refreshToken: string
}

export function authRedirectUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
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
