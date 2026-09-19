import assert from 'node:assert/strict'
import test from 'node:test'
import { validatePassword } from '../src/lib/auth-utils.js'

test('password di bawah 8 karakter ditolak', () => {
  assert.match(validatePassword('Abc1234'), /8 karakter/)
})

test('password tanpa kombinasi huruf dan angka ditolak', () => {
  assert.match(validatePassword('abcdefgh'), /huruf dan satu angka/)
  assert.match(validatePassword('12345678'), /huruf dan satu angka/)
})

test('password minimal 8 karakter dengan huruf dan angka diterima', () => {
  assert.equal(validatePassword('Nurul123'), '')
  assert.equal(validatePassword('aman2026'), '')
})
