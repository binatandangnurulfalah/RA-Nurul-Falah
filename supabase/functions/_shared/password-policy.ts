export function validatePassword(password: string) {
  if (password.length < 8) return 'Password minimal 8 karakter.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password wajib mengandung minimal satu huruf dan satu angka.'
  }
  return ''
}
