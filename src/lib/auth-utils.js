export function validatePassword(password) {
  if (password.length < 6) return 'Password minimal 6 karakter.'
  return ''
}
