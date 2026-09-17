export function validatePassword(password: string) {
  if (password.length < 10) return 'Password minimal 10 karakter.'
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) return 'Password harus berisi huruf besar dan huruf kecil.'
  if (!/\d/.test(password)) return 'Password harus berisi minimal satu angka.'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password harus berisi minimal satu simbol.'
  return ''
}
