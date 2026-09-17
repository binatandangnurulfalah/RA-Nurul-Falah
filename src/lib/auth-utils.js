export function validatePassword(password) {
  if (password.length < 10) return 'Password minimal 10 karakter.'

  const groups = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length

  if (groups < 3) {
    return 'Gunakan kombinasi minimal 3 jenis: huruf besar, huruf kecil, angka, atau simbol.'
  }
  return ''
}
