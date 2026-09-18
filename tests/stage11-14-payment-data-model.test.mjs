import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const migration = read('supabase/migrations/20260918030000_stage11_14_payment_data_model.sql')
const payments = read('src/portal-v2/PaymentsPage.tsx')
const paymentsQuery = read('src/data/queries/payments.ts')
const types = read('src/lib/database-normalized.types.ts')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('tagihan dan transaksi pembayaran dipisah tanpa memutus compatibility aggregate', () => {
  assert.match(migration, /create table if not exists public\.payment_transactions/)
  assert.match(migration, /alter table public\.student_payments[\s\S]*add column if not exists is_waived/)
  assert.match(migration, /recalculate_student_payment/)
  assert.match(migration, /paid_amount = v_paid/)
  assert.match(migration, /status = case/)
  assert.match(paymentsQuery, /student_payments_search/)
  assert.match(paymentsQuery, /payment_summary/)
})

test('browser tidak lagi melakukan direct mutation ke tabel keuangan', () => {
  assert.match(migration, /revoke insert, update, delete on table public\.student_payments from authenticated, anon/)
  assert.match(migration, /revoke insert, update, delete on table public\.payment_transactions from authenticated, anon/)
  assert.doesNotMatch(payments, /from\('student_payments'\)\.insert/)
  assert.doesNotMatch(payments, /from\('student_payments'\)\.update/)
  assert.doesNotMatch(payments, /from\('student_payments'\)\.delete/)
  assert.match(payments, /save_student_charge/)
  assert.match(payments, /record_payment_transaction/)
  assert.match(payments, /void_payment_transaction/)
  assert.match(payments, /delete_student_charge/)
})

test('overpayment dan charge deletion dengan histori dipaksa backend', () => {
  assert.match(migration, /payment_transactions_enforce_balance/)
  assert.match(migration, /Nominal pembayaran melebihi sisa tagihan/)
  assert.match(migration, /p_amount > greatest\(v_charge_amount - v_paid_amount, 0\)/)
  assert.match(migration, /Tagihan yang memiliki riwayat transaksi tidak dapat dihapus/)
  assert.match(migration, /for update/)
})

test('void transaksi tidak menghapus histori dan alasan wajib', () => {
  assert.match(migration, /voided_at timestamptz/)
  assert.match(migration, /voided_by uuid/)
  assert.match(migration, /void_reason text/)
  assert.match(migration, /Alasan pembatalan wajib diisi 3-500 karakter/)
  assert.match(payments, /Batalkan Transaksi/)
  assert.match(payments, /Salah nominal|reason|Alasan pembatalan/i)
})

test('Wali dapat membaca transaksi anak melalui RLS tetapi Guru tidak', () => {
  assert.match(migration, /create policy "payment transaction access"/)
  assert.match(migration, /private\.current_user_role\(\)\) = 'admin'/)
  assert.match(migration, /student_guardians guardian/)
  assert.match(migration, /guardian\.guardian_user_id = \(select auth\.uid\(\)\)/)
  assert.doesNotMatch(migration, /current_user_role\(\).*teacher[\s\S]*payment transaction access/)
})

test('audit global mencakup transaksi dan membuang catatan atau nomor referensi', () => {
  assert.match(migration, /'payment_transactions'/)
  assert.match(migration, /payment_transactions_capture_audit/)
  assert.match(migration, /when 'payment_transactions'[\s\S]*'notes','reference_no'/)
})

test('frontend menyediakan histori, kuitansi per transaksi, dan invalidasi dashboard', () => {
  assert.match(paymentsQuery, /paymentTransactionsOptions/)
  assert.match(paymentsQuery, /\.from\('payment_transactions'\)/)
  assert.match(payments, /Riwayat Pembayaran/)
  assert.match(payments, /Nominal transaksi/)
  assert.match(payments, /queryKeys\.dashboard\.all/)
  assert.match(payments, /queryKeys\.payments\.detail/)
})

test('typing normalized mencakup transaction table dan RPC keuangan', () => {
  assert.match(types, /type PaymentTransactionsTable/)
  assert.match(types, /payment_transactions: PaymentTransactionsTable/)
  for (const rpc of ['save_student_charge', 'record_payment_transaction', 'void_payment_transaction', 'delete_student_charge']) {
    assert.match(types, new RegExp(rpc))
  }
})

test('scanner tetap LIVE CAMERA ONLY setelah Tahap 11.14', () => {
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(scanner, /BarcodeDetector/)
  assert.match(scanner, /detector\.detect\(video\)/)
  assert.match(scanner, /record-attendance/)
  assert.doesNotMatch(scanner, /type="file"|capture=|galeri|gallery|upload foto|unggah foto/i)
  assert.doesNotMatch(scanner, /\btorch\b|Flashlight|toggleTorch/i)
  assert.doesNotMatch(scanner, /setManual|Masukkan kode QR secara manual|Tempel kode QR/i)
})
