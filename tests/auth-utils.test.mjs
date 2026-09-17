import assert from 'node:assert/strict'
import test from 'node:test'
import { validatePassword } from '../src/lib/auth-utils.js'

test('password di bawah 6 karakter ditolak', () => {
  assert.match(validatePassword('12345'), /6 karakter/)
})

test('password minimal 6 karakter diterima', () => {
  assert.equal(validatePassword('123456'), '')
  assert.equal(validatePassword('abcdef'), '')
  assert.equal(validatePassword('NurulFalah2026'), '')
})
