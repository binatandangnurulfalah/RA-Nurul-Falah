import { isConnectivityFailure } from './observability'

function errorText(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '')
  }
  return ''
}

export function userErrorMessage(error: unknown, fallback: string) {
  if (isConnectivityFailure(error)) return 'Koneksi ke server terputus. Periksa internet lalu coba lagi.'

  const message = errorText(error)
  if (/jwt|refresh token|session|not authenticated|auth session/i.test(message)) {
    return 'Sesi Anda perlu diperbarui. Silakan login kembali.'
  }
  if (/row-level security|permission denied|42501|not authorized|forbidden/i.test(message)) {
    return 'Akun Anda tidak memiliki akses untuk data ini.'
  }
  return fallback
}
