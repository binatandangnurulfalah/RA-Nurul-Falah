import assert from 'node:assert/strict'
import test from 'node:test'
import { validatePassword } from '../src/lib/auth-utils.js'

test('password di bawah 10 karakter ditolak', () => {
  assert.match(validatePassword('Aa123456!'), /10 karakter/)
})

test('password panjang tetapi terlalu lemah ditolak', () => {
  assert.match(validatePassword('abcdefghij'), /minimal 3 jenis/)
  assert.match(validatePassword('1234567890'), /minimal 3 jenis/)
})

test('password minimal 10 karakter dengan kombinasi kuat diterima', () => {
  assert.equal(validatePassword('NurulFalah2026'), '')
  assert.equal(validatePassword('Aman!Sekali1'), '')
})
