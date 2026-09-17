export function validatePassword(password) {
  if (password.length < 10) return 'Password minimal 10 karakter.'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) return 'Password harus berisi huruf besar dan huruf kecil.'
  if (!/\d/.test(password)) return 'Password harus berisi angka.'
  return ''
}
