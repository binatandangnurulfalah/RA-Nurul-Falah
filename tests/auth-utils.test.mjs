import assert from 'node:assert/strict'
import test from 'node:test'
import { validatePassword } from '../src/lib/auth-utils.js'

test('password lemah ditolak', () => {
  assert.match(validatePassword('Pendek1'), /10 karakter/)
  assert.match(validatePassword('semuahuruf1'), /huruf besar/)
  assert.match(validatePassword('TanpaAngka'), /angka/)
})

test('password kuat diterima', () => {
  assert.equal(validatePassword('NurulFalah2026'), '')
})
