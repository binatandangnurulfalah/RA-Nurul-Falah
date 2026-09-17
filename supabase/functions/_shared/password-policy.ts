export function validatePassword(password: string) {
  if (password.length < 6) return 'Password minimal 6 karakter.'
  return ''
}
